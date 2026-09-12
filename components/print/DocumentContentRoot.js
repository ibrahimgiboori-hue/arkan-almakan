'use client';

import { Children, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DOCUMENT_BODY_GRID,
  DOCUMENT_BODY_GRID_SCHEMA_VERSION,
  documentGridRowsForPx,
  documentGridSpanMm,
} from '@/lib/document-body-grid.mjs';

const CSS_PX_PER_MM=96/25.4;
const INTERACTIVE_SELECTOR='button,input,select,textarea,dialog,[role="dialog"],.no-print';
const LEGACY_VISIBLE_GRIDS='.g-grid,.cards,.footer-row,.pt-wrap,.xlsx-grid';
const LOGICAL_ROW_SELECTOR='tr,.governed-cell-row,[data-print-grid-key]';
const PRINT_HEADER_SELECTOR='th,[data-print-header="true"],.pc-head,.pt-head,.report-items-title';
const MIN_READABLE_CONTRAST=4.5;

function sameSpans(left,right){
  const a=left||[];
  const b=right||[];
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

function naturalOuterHeight(element){
  if(!element)return 0;
  const child=element.firstElementChild;
  if(!child)return element.scrollHeight||element.getBoundingClientRect().height||0;
  const rect=child.getBoundingClientRect();
  const style=window.getComputedStyle(child);
  return rect.height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
}

function quantizeLogicalRows(root){
  const logicalRows=[...new Set([...root.querySelectorAll(LOGICAL_ROW_SELECTOR)])];
  logicalRows.forEach((row)=>{
    if(row.dataset.documentGridQuantized==='true')row.style.removeProperty('height');
    const rect=row.getBoundingClientRect();
    const style=window.getComputedStyle(row);
    const preferredMinPx=parseFloat(style.minHeight)||0;
    const naturalPx=Math.max(rect.height,row.scrollHeight||0,preferredMinPx);
    const rowsUsed=documentGridRowsForPx(naturalPx,CSS_PX_PER_MM,1);
    row.dataset.documentGridRows=String(rowsUsed);
    row.dataset.documentGridQuantized='true';
    row.style.height=`${documentGridSpanMm(rowsUsed)}mm`;
  });
}

function parseLegacySpan(element){
  const computed=window.getComputedStyle(element);
  const values=[element.style.gridColumnEnd,element.style.gridColumn,computed.gridColumnEnd,computed.gridColumn];
  for(const value of values){
    const match=String(value||'').match(/span\s+(\d+)/i);
    if(match)return Number(match[1]);
  }
  return null;
}

function normalizeLegacyVisibleGrids(root){
  const grids=[...root.querySelectorAll(LEGACY_VISIBLE_GRIDS)];
  grids.forEach((grid)=>{
    const children=[...grid.children].filter((child)=>window.getComputedStyle(child).display!=='none');
    const legacySpans=children.map(parseLegacySpan);
    grid.dataset.documentGridColumns=String(DOCUMENT_BODY_GRID.columns);
    grid.style.gridTemplateColumns=`repeat(${DOCUMENT_BODY_GRID.columns},minmax(0,1fr))`;
    grid.style.columnGap='0';

    children.forEach((child,index)=>{
      const legacy=legacySpans[index];
      let span=legacy&&legacy<=12?legacy*4:null;
      if(!span&&grid.classList.contains('pt-wrap')){
        span=grid.classList.contains('single')?24:Math.max(1,Math.floor(DOCUMENT_BODY_GRID.columns/Math.max(1,children.length)));
      }
      if(span){
        child.style.gridColumn=`span ${Math.min(DOCUMENT_BODY_GRID.columns,span)}`;
        child.dataset.documentGridSpan=String(Math.min(DOCUMENT_BODY_GRID.columns,span));
      }
    });
  });
}

function parseRgb(value){
  const match=String(value||'').match(/rgba?\(([^)]+)\)/i);
  if(!match)return null;
  const parts=match[1].split(',').map((part)=>Number.parseFloat(part.trim()));
  if(parts.length<3||parts.slice(0,3).some((part)=>!Number.isFinite(part)))return null;
  return {r:parts[0],g:parts[1],b:parts[2],a:Number.isFinite(parts[3])?parts[3]:1};
}

function channelLuminance(value){
  const c=Math.max(0,Math.min(255,value))/255;
  return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);
}

function luminance(rgb){
  return 0.2126*channelLuminance(rgb.r)+0.7152*channelLuminance(rgb.g)+0.0722*channelLuminance(rgb.b);
}

function contrastRatio(a,b){
  const lighter=Math.max(a,b);
  const darker=Math.min(a,b);
  return (lighter+0.05)/(darker+0.05);
}

function resolvedBackground(element,root){
  let current=element;
  while(current&&current!==root.parentElement){
    const rgb=parseRgb(window.getComputedStyle(current).backgroundColor);
    if(rgb&&rgb.a>0.02)return rgb;
    if(current===root)break;
    current=current.parentElement;
  }
  return {r:255,g:255,b:255,a:1};
}

function enforceTextColor(element,color,tone){
  element.style.setProperty('color',color,'important');
  element.dataset.printContrast='auto';
  element.dataset.printContrastTone=tone;
  [...element.querySelectorAll('*')].forEach((child)=>{
    child.style.setProperty('color','inherit','important');
  });
}

function enforceHeaderContrast(root){
  [...root.querySelectorAll(PRINT_HEADER_SELECTOR)].forEach((header)=>{
    const background=resolvedBackground(header,root);
    const bgLum=luminance(background);
    const current=parseRgb(window.getComputedStyle(header).color);
    const currentContrast=current?contrastRatio(luminance(current),bgLum):0;

    // الخلفية البيضاء/الفاتحة تحتفظ باللون الأصلي إذا كان مقروءًا أصلًا.
    // عند ضعف التباين فقط نختار اللون الأعلى تباينًا؛ لذلك العنابي يحصل على أبيض،
    // بينما الرأس الأبيض يمكن أن يحتفظ بالعنابي أو أي لون داكن مقروء.
    if(current&&currentContrast>=MIN_READABLE_CONTRAST){
      header.dataset.printContrast='preserved';
      header.dataset.printContrastRatio=currentContrast.toFixed(2);
      return;
    }

    const whiteContrast=contrastRatio(1,bgLum);
    const darkColor={r:34,g:34,b:34};
    const darkContrast=contrastRatio(luminance(darkColor),bgLum);
    const useWhite=whiteContrast>=darkContrast;
    const color=useWhite?'#FFFFFF':'#222222';
    enforceTextColor(header,color,useWhite?'light-text':'dark-text');
    header.dataset.printContrastRatio=Math.max(whiteContrast,darkContrast).toFixed(2);
  });
}

export default function DocumentContentRoot({
  as:Tag='div',
  className='',
  children,
  rootProps={},
  documentKey='',
  ...rest
}){
  const rootRef=useRef(null);
  const childArray=useMemo(()=>Children.toArray(children),[children]);
  const [spans,setSpans]=useState(()=>childArray.map(()=>1));

  useLayoutEffect(()=>{
    const root=rootRef.current;
    if(!root)return;
    normalizeLegacyVisibleGrids(root);
    quantizeLogicalRows(root);
    enforceHeaderContrast(root);
    const wrappers=[...root.querySelectorAll(':scope > [data-document-visible-block="true"]')];
    const next=wrappers.map((wrapper)=>documentGridRowsForPx(naturalOuterHeight(wrapper),CSS_PX_PER_MM,1));
    setSpans((current)=>sameSpans(current,next)?current:next);

    if(process.env.NODE_ENV!=='production'&&root.querySelector(INTERACTIVE_SELECTOR)){
      console.warn('[print] interactive/editor control found inside the governed document body; dialogs and editors must remain outside printed content.');
    }
  },[children,className,documentKey]);

  const safeRootProps={...rootProps,...rest};
  delete safeRootProps.children;
  delete safeRootProps.className;

  return (
    <Tag
      {...safeRootProps}
      ref={rootRef}
      className={`document-content-body ${className}`.trim()}
      data-document-content-body="single-continuous-grid"
      data-document-grid-schema={DOCUMENT_BODY_GRID_SCHEMA_VERSION}
      data-document-grid-columns={DOCUMENT_BODY_GRID.columns}
      data-document-grid-row-mm={DOCUMENT_BODY_GRID.rowMm}
      data-document-base-rows="immutable"
      data-document-dialogs="outside-body"
      data-document-key={documentKey||undefined}
      style={{
        ...(safeRootProps.style||{}),
        display:'grid',
        gridTemplateColumns:`repeat(${DOCUMENT_BODY_GRID.columns},minmax(0,1fr))`,
        gridAutoRows:`${DOCUMENT_BODY_GRID.rowMm}mm`,
        gridAutoFlow:'row',
        gap:0,
        alignItems:'start',
        minWidth:0,
      }}
    >
      {childArray.map((child,index)=>(
        <div
          key={child?.key??`document-block-${index}`}
          className="document-visible-block"
          data-document-visible-block="true"
          data-document-block-index={index}
          data-document-row-span={spans[index]||1}
          style={{
            gridColumn:'1 / -1',
            gridRow:`span ${spans[index]||1}`,
            height:`${documentGridSpanMm(spans[index]||1)}mm`,
            minWidth:0,
            minHeight:0,
            overflow:'visible',
            display:'flow-root',
          }}
        >{child}</div>
      ))}
    </Tag>
  );
}
