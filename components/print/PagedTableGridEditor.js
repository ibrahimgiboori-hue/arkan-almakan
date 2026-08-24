'use client';

import { useEffect } from 'react';
import {
  PRINT_GRID_COLUMNS,
  PRINT_GRID_ROW_MM,
  majorGuideTracks,
  moveTrackBoundary,
  resolveStoredTracks,
  serializeTracks,
  tracksToSpans,
} from '@/lib/print-grid';

function measuredWeights(elements, width) {
  if (!width) return Array.from({length:elements.length},()=>100/elements.length);
  const values = elements.map((el)=>Math.max(1,el.getBoundingClientRect().width));
  const total = values.reduce((s,v)=>s+v,0) || width;
  return values.map((v)=>v/total*100);
}
function tableIdentity(table) {
  if (table.dataset.printGridName) return table.dataset.printGridName;
  return [...table.classList].filter((n)=>!['governed-row-table','row-resizable-table'].includes(n)).sort().join('.') || 'table';
}
function ensureColgroup(table,count) {
  let cg = table.querySelector(':scope > colgroup');
  if (cg) {
    const cols=[...cg.children].filter((n)=>n.tagName==='COL');
    return cols.length===count ? {cg,cols,created:false} : null;
  }
  if (!table.matches('[data-print-editable-columns],.q-table,.q-pay')) return null;
  cg=document.createElement('colgroup');
  for(let i=0;i<count;i+=1) cg.appendChild(document.createElement('col'));
  table.insertBefore(cg,table.firstChild);
  return {cg,cols:[...cg.children],created:true};
}
function applyTracks(table,cols,tracks){
  const spans=tracksToSpans(tracks,cols.length);
  table.style.tableLayout='fixed';
  cols.forEach((col,i)=>{col.style.width=`${(spans[i]/PRINT_GRID_COLUMNS)*100}%`;});
  table.dataset.printGridTracks=tracks.join(',');
}
function addBoundary({cell,isLtr,index,tracks,count,width,table,cols,key,defaults,setGridLayout}){
  cell.style.position='relative';
  const h=document.createElement('span');
  h.className=`paged-grid-boundary no-print ${isLtr?'ltr':'rtl'}`;
  h.title='اسحب الحد لضبط عرض العمود على الشبكة';
  cell.appendChild(h);
  const down=(event)=>{
    event.preventDefault();event.stopPropagation();
    const startX=event.clientX; const start=[...tracks]; const trackWidth=(width||1)/PRINT_GRID_COLUMNS; const guides=majorGuideTracks();
    const move=(e)=>{
      const delta=Math.round((e.clientX-startX)/trackWidth);
      const desired=start[index]+(isLtr?delta:-delta);
      const next=moveTrackBoundary({tracks:start,boundaryIndex:index,desiredTrack:desired,count,guides});
      applyTracks(table,cols,next); setGridLayout(key,serializeTracks(next,count));
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  const dbl=(e)=>{e.preventDefault();e.stopPropagation();const reset=resolveStoredTracks(null,defaults,count);applyTracks(table,cols,reset);setGridLayout(key,null);};
  h.addEventListener('pointerdown',down);h.addEventListener('dblclick',dbl);
  return ()=>{h.removeEventListener('pointerdown',down);h.removeEventListener('dblclick',dbl);h.remove();};
}
function addHeight({block,key,stored,setRowHeight}){
  block.style.position='relative';
  const h=document.createElement('span');h.className='paged-grid-height no-print';h.title='اسحب لضبط ارتفاع العنصر';block.appendChild(h);
  const down=(event)=>{
    event.preventDefault();event.stopPropagation();const startY=event.clientY;const pxPerUnit=PRINT_GRID_ROW_MM*(96/25.4);const natural=Math.max(2,Math.ceil(block.getBoundingClientRect().height/pxPerUnit));const start=Number(stored)||natural;
    const move=(e)=>{const units=Math.max(2,start+Math.round((e.clientY-startY)/pxPerUnit));block.style.minHeight=`${units*PRINT_GRID_ROW_MM}mm`;setRowHeight(key,units);};
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  const dbl=(e)=>{e.preventDefault();e.stopPropagation();block.style.removeProperty('min-height');setRowHeight(key,null);};
  h.addEventListener('pointerdown',down);h.addEventListener('dblclick',dbl);return()=>{h.removeEventListener('pointerdown',down);h.removeEventListener('dblclick',dbl);h.remove();};
}

export default function PagedTableGridEditor({editing,gridLayouts,rowHeights,setGridLayout,setRowHeight,documentKey,pageCount}){
  useEffect(()=>{
    const cleanup=[];
    const tables=[...document.querySelectorAll('.constitution-paged-pages .print-constitution table')];
    tables.forEach((table)=>{
      const row=table.tHead?.rows?.[0]; const cells=row?[...row.cells]:[];
      if(cells.length<2 || !cells.every((c)=>Number(c.colSpan||1)===1)) return;
      const ensured=ensureColgroup(table,cells.length); if(!ensured) return;
      const {cg,cols,created}=ensured; const key=`${documentKey}:${tableIdentity(table)}:cells:${cells.length}`; const defaults=measuredWeights(cells,table.getBoundingClientRect().width); const tracks=resolveStoredTracks(gridLayouts?.[key],defaults,cells.length); applyTracks(table,cols,tracks);
      if(editing){const isLtr=window.getComputedStyle(table).direction==='ltr';cells.forEach((cell,index)=>{if(index<cells.length-1)cleanup.push(addBoundary({cell,isLtr,index,tracks,count:cells.length,width:table.getBoundingClientRect().width,table,cols,key,defaults,setGridLayout}));});}
      if(created) cleanup.push(()=>cg.remove());
    });
    const blocks=[...document.querySelectorAll('.constitution-paged-pages .print-constitution .q-meta,.constitution-paged-pages .print-constitution .q-intro,.constitution-paged-pages .print-constitution .q-block.pay,.constitution-paged-pages .print-constitution .q-block.terms,.constitution-paged-pages .print-constitution .q-foot')];
    blocks.forEach((block,index)=>{const name=block.dataset.printGridName||[...block.classList].sort().join('.')||`block-${index}`;const key=`${documentKey}:${name}:height`;if(rowHeights?.[key])block.style.minHeight=`${Number(rowHeights[key])*PRINT_GRID_ROW_MM}mm`;else block.style.removeProperty('min-height');if(editing)cleanup.push(addHeight({block,key,stored:rowHeights?.[key],setRowHeight}));});
    return()=>cleanup.forEach((fn)=>fn());
  },[documentKey,editing,gridLayouts,pageCount,rowHeights,setGridLayout,setRowHeight]);
  return <style jsx global>{`
    .paged-grid-boundary{position:absolute;top:-2px;bottom:-2px;width:18px;z-index:35;cursor:col-resize;background:transparent;touch-action:none}.paged-grid-boundary.ltr{right:-9px}.paged-grid-boundary.rtl{left:-9px}.paged-grid-boundary::after{content:'';position:absolute;top:0;bottom:0;left:8.5px;border-left:1px dashed rgba(139,51,50,.6)}.paged-grid-boundary:hover::after{border-left:2px solid rgba(139,51,50,.95)}.paged-grid-height{position:absolute;right:0;left:0;bottom:-7px;height:14px;z-index:34;cursor:row-resize;touch-action:none}.paged-grid-height::after{content:'';position:absolute;right:0;left:0;top:6px;border-top:1px dashed rgba(139,51,50,.45)}.paged-grid-height:hover::after{border-top:2px solid rgba(139,51,50,.9)}@media print{.paged-grid-boundary,.paged-grid-height{display:none!important}}
  `}</style>;
}
