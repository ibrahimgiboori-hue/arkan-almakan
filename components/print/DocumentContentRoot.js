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

function quantizeTableRows(root){
  const rows=[...root.querySelectorAll('tr')];
  rows.forEach((row)=>{
    row.style.removeProperty('height');
    const rect=row.getBoundingClientRect();
    const rowsUsed=documentGridRowsForPx(rect.height,CSS_PX_PER_MM,1);
    row.dataset.documentGridRows=String(rowsUsed);
    row.style.height=`${documentGridSpanMm(rowsUsed)}mm`;
  });
}

export default function DocumentContentRoot({
  as:Tag='div',
  className='',
  children,
  rootProps={},
  documentKey='',
}){
  const rootRef=useRef(null);
  const childArray=useMemo(()=>Children.toArray(children),[children]);
  const [spans,setSpans]=useState(()=>childArray.map(()=>1));

  useLayoutEffect(()=>{
    const root=rootRef.current;
    if(!root)return;
    quantizeTableRows(root);
    const wrappers=[...root.querySelectorAll(':scope > [data-document-visible-block="true"]')];
    const next=wrappers.map((wrapper)=>documentGridRowsForPx(naturalOuterHeight(wrapper),CSS_PX_PER_MM,1));
    setSpans((current)=>sameSpans(current,next)?current:next);

    if(process.env.NODE_ENV!=='production'&&root.querySelector(INTERACTIVE_SELECTOR)){
      console.warn('[print] interactive/editor control found inside the governed document body; dialogs and editors must remain outside printed content.');
    }
  },[children,className,documentKey]);

  const safeRootProps={...rootProps};
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
