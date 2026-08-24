'use client';

import { useEffect } from 'react';
import {
  PRINT_GRID_COLUMNS,
  PRINT_GRID_ROW_MM,
  majorGuideTracks,
  nearestGuide,
} from '@/lib/print-grid';

const MM_TO_CSS_PX = 96 / 25.4;
const MIN_BOX_SPAN = 2;
const SKIP_TAGS = new Set(['TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','COLGROUP','COL']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const px = (value) => Number.parseFloat(value) || 0;

function visibleBackground(style) {
  const value = String(style.backgroundColor || '').replace(/\s/g,'').toLowerCase();
  return Boolean(value && value !== 'transparent' && value !== 'rgba(0,0,0,0)');
}
function borderState(style) {
  const left = px(style.borderLeftWidth) > 0 && style.borderLeftStyle !== 'none';
  const right = px(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none';
  const top = px(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none';
  const bottom = px(style.borderBottomWidth) > 0 && style.borderBottomStyle !== 'none';
  return { left, right, top, bottom, vertical:left || right, horizontal:top || bottom };
}
function isCandidate(element) {
  if (!(element instanceof HTMLElement) || SKIP_TAGS.has(element.tagName)) return false;
  if (element.classList.contains('no-print') || element.closest('.measure')) return false;
  if (element.matches('.paged-grid-boundary,.paged-grid-height,.print-boundary-handle,.print-boundary-height')) return false;
  const style = window.getComputedStyle(element);
  const border = borderState(style);
  const surface = visibleBackground(style) && px(style.borderRadius) > 0;
  return Boolean(element.dataset.printBoundaryBox != null || border.vertical || border.horizontal || surface);
}
function elementIdentity(element, root) {
  if (element.dataset.printBoundaryName) return element.dataset.printBoundaryName;
  if (element.dataset.printGridName) return element.dataset.printGridName;
  const path=[]; let node=element;
  while(node && node!==root && path.length<5){
    const classes=[...node.classList].filter((n)=>!n.startsWith('print-')&&!n.startsWith('paged-')&&n!=='no-print').slice(0,3).join('.');
    const siblings=node.parentElement?[...node.parentElement.children].filter((s)=>s.tagName===node.tagName):[];
    path.unshift(`${node.tagName.toLowerCase()}${classes?`.`+classes:''}:${Math.max(0,siblings.indexOf(node))}`);
    node=node.parentElement;
  }
  return path.join('>') || element.tagName.toLowerCase();
}
function readBox(value, defaults){
  if(value && typeof value==='object' && value.type==='boundary-box'){
    const storedColumns=Math.max(1,Number(value.columns)||PRINT_GRID_COLUMNS);
    return {start:clamp(Math.round(Number(value.start)/storedColumns*PRINT_GRID_COLUMNS),0,PRINT_GRID_COLUMNS-MIN_BOX_SPAN),end:clamp(Math.round(Number(value.end)/storedColumns*PRINT_GRID_COLUMNS),MIN_BOX_SPAN,PRINT_GRID_COLUMNS)};
  }
  return defaults;
}
const serializeBox=(start,end)=>({version:2,type:'boundary-box',columns:PRINT_GRID_COLUMNS,start:Math.round(start),end:Math.round(end)});
function snapTrack(track,guides,min,max){const c=clamp(Math.round(track),min,max);return clamp(nearestGuide(c,guides),min,max);}
function applyBox(element,start,end){
  const safeStart=clamp(start,0,PRINT_GRID_COLUMNS-MIN_BOX_SPAN); const safeEnd=clamp(end,safeStart+MIN_BOX_SPAN,PRINT_GRID_COLUMNS);
  element.style.boxSizing='border-box'; element.style.maxWidth='none'; element.style.width=`${((safeEnd-safeStart)/PRINT_GRID_COLUMNS)*100}%`; element.style.marginLeft=`${(safeStart/PRINT_GRID_COLUMNS)*100}%`; element.style.marginRight='0';
}
function clearBox(element){['box-sizing','max-width','width','margin-left','margin-right'].forEach((p)=>element.style.removeProperty(p));}
function addHorizontalHandle({element,side,root,key,defaults,stored,setGridLayout,guides}){
  element.style.position='relative'; const handle=document.createElement('span'); handle.className=`print-boundary-handle print-boundary-${side} no-print`; handle.title=side==='left'?'اسحب الحد الأيسر على شبكة الدستور':'اسحب الحد الأيمن على شبكة الدستور'; element.appendChild(handle);
  const onDown=(event)=>{event.preventDefault();event.stopPropagation();const rootRect=root.getBoundingClientRect();const trackWidth=(rootRect.width||1)/PRINT_GRID_COLUMNS;const initial=readBox(stored,defaults);const startX=event.clientX;
    const move=(e)=>{const delta=Math.round((e.clientX-startX)/trackWidth);let start=initial.start,end=initial.end;if(side==='left')start=snapTrack(initial.start+delta,guides,0,end-MIN_BOX_SPAN);else end=snapTrack(initial.end+delta,guides,start+MIN_BOX_SPAN,PRINT_GRID_COLUMNS);applyBox(element,start,end);setGridLayout(key,serializeBox(start,end));};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  const dbl=(e)=>{e.preventDefault();e.stopPropagation();clearBox(element);setGridLayout(key,null);};handle.addEventListener('pointerdown',onDown);handle.addEventListener('dblclick',dbl);return()=>{handle.removeEventListener('pointerdown',onDown);handle.removeEventListener('dblclick',dbl);handle.remove();};
}
function addHeightHandle({element,key,storedUnits,setRowHeight}){
  if(element.querySelector(':scope > .paged-grid-height,:scope > .print-boundary-height')) return ()=>{};
  element.style.position='relative';const handle=document.createElement('span');handle.className='print-boundary-height no-print';element.appendChild(handle);
  const down=(event)=>{event.preventDefault();event.stopPropagation();const startY=event.clientY;const natural=Math.max(2,Math.ceil(element.getBoundingClientRect().height/(PRINT_GRID_ROW_MM*MM_TO_CSS_PX)));const start=Number(storedUnits)||natural;const move=(e)=>{const units=Math.max(2,start+Math.round((e.clientY-startY)/(PRINT_GRID_ROW_MM*MM_TO_CSS_PX)));element.style.minHeight=`${units*PRINT_GRID_ROW_MM}mm`;setRowHeight(key,units);};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);};
  const dbl=(e)=>{e.preventDefault();e.stopPropagation();element.style.removeProperty('min-height');setRowHeight(key,null);};handle.addEventListener('pointerdown',down);handle.addEventListener('dblclick',dbl);return()=>{handle.removeEventListener('pointerdown',down);handle.removeEventListener('dblclick',dbl);handle.remove();};
}
export default function BoundaryBoxEditor({editing,gridLayouts,rowHeights,setGridLayout,setRowHeight,documentKey,rootSelector='.print-constitution',refreshKey}){
  useEffect(()=>{const cleanups=[];const roots=[...document.querySelectorAll(rootSelector)];roots.forEach((root)=>{const rootRect=root.getBoundingClientRect();if(!rootRect.width)return;[...root.querySelectorAll('*')].filter(isCandidate).forEach((element)=>{if(element.closest('table'))return;const style=window.getComputedStyle(element);const border=borderState(style);const surface=visibleBackground(style)&&px(style.borderRadius)>0;const identity=elementIdentity(element,root);const boxKey=`${documentKey}:boundary:${identity}`;const heightKey=`${boxKey}:height`;const rect=element.getBoundingClientRect();const defaults={start:clamp(Math.round(((rect.left-rootRect.left)/rootRect.width)*PRINT_GRID_COLUMNS),0,PRINT_GRID_COLUMNS-MIN_BOX_SPAN),end:clamp(Math.round(((rect.right-rootRect.left)/rootRect.width)*PRINT_GRID_COLUMNS),MIN_BOX_SPAN,PRINT_GRID_COLUMNS)};if(defaults.end<=defaults.start)defaults.end=Math.min(PRINT_GRID_COLUMNS,defaults.start+MIN_BOX_SPAN);const stored=gridLayouts?.[boxKey];if(stored?.type==='boundary-box'){const current=readBox(stored,defaults);applyBox(element,current.start,current.end);}if(rowHeights?.[heightKey])element.style.minHeight=`${Number(rowHeights[heightKey])*PRINT_GRID_ROW_MM}mm`;if(!editing)return;element.classList.add('print-boundary-editable');cleanups.push(()=>element.classList.remove('print-boundary-editable'));const guides=majorGuideTracks();if(border.vertical||surface||element.dataset.printBoundaryBox!=null){cleanups.push(addHorizontalHandle({element,side:'left',root,key:boxKey,defaults,stored,setGridLayout,guides}));cleanups.push(addHorizontalHandle({element,side:'right',root,key:boxKey,defaults,stored,setGridLayout,guides}));}if(border.horizontal||border.vertical||surface||element.dataset.printBoundaryBox!=null)cleanups.push(addHeightHandle({element,key:heightKey,storedUnits:rowHeights?.[heightKey],setRowHeight}));});});return()=>cleanups.forEach((fn)=>fn());},[documentKey,editing,gridLayouts,refreshKey,rootSelector,rowHeights,setGridLayout,setRowHeight]);
  return <style jsx global>{`.print-boundary-editable{outline:1px solid rgba(139,51,50,.18);outline-offset:1px}.print-boundary-handle{position:absolute;top:-2px;bottom:-2px;width:18px;z-index:42;cursor:col-resize;touch-action:none}.print-boundary-left{left:-9px}.print-boundary-right{right:-9px}.print-boundary-handle::after{content:'';position:absolute;top:0;bottom:0;left:8.5px;border-left:1px dashed rgba(139,51,50,.55)}.print-boundary-handle:hover::after{border-left:2px solid rgba(139,51,50,.96)}.print-boundary-height{position:absolute;right:0;left:0;bottom:-7px;height:14px;z-index:41;cursor:row-resize;touch-action:none}.print-boundary-height::after{content:'';position:absolute;right:0;left:0;top:6px;border-top:1px dashed rgba(139,51,50,.45)}@media print{.print-boundary-editable{outline:none!important}.print-boundary-handle,.print-boundary-height{display:none!important}}`}</style>;
}
