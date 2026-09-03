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
import BoundaryBoxEditor from '@/components/print/BoundaryBoxEditor';

const MM_TO_CSS_PX = 96 / 25.4;
const px = (value) => Number.parseFloat(value) || 0;

function measuredWeights(elements,width){
  if(!elements.length)return [];
  if(!width)return Array.from({length:elements.length},()=>100/elements.length);
  const values=elements.map((el)=>Math.max(1,el.getBoundingClientRect().width));
  const total=values.reduce((s,v)=>s+v,0)||width;
  return values.map((v)=>v/total*100);
}

function classIdentity(element,ignored=[]){
  return [...element.classList]
    .filter((name)=>!ignored.includes(name)&&!name.startsWith('print-layout-')&&!name.startsWith('paged-grid-'))
    .sort()
    .join('.');
}

function tableIdentity(table){
  if(table.dataset.printGridName)return table.dataset.printGridName;
  const classes=classIdentity(table,['governed-row-table','row-resizable-table']);
  const header=[...(table.tHead?.rows||[])]
    .flatMap((row)=>[...row.cells])
    .map((cell)=>String(cell.textContent||'').trim().replace(/\s+/g,' ').slice(0,36))
    .filter(Boolean)
    .join('|');
  return [classes||'table',header].filter(Boolean).join(':').slice(0,320);
}

function gridIdentity(row){
  if(row.dataset.printGridName)return row.dataset.printGridName;
  return classIdentity(row)||'grid-row';
}

function logicalColumnCount(table){
  const existing=[...(table.querySelector(':scope > colgroup')?.children||[])].filter((node)=>node.tagName==='COL');
  if(existing.length)return existing.length;
  let count=0;
  for(const row of table.rows||[]){
    if([...row.cells].some((cell)=>Number(cell.rowSpan||1)>1))continue;
    count=Math.max(count,[...row.cells].reduce((sum,cell)=>sum+Math.max(1,Number(cell.colSpan||1)),0));
  }
  return count;
}

function ensureColgroup(table,count){
  let cg=table.querySelector(':scope > colgroup');
  if(cg){
    const cols=[...cg.children].filter((node)=>node.tagName==='COL');
    return cols.length===count?{cg,cols,created:false}:null;
  }
  if(table.dataset.printColumnsLocked==='true'||table.dataset.printBoundaryLocked==='true')return null;
  cg=document.createElement('colgroup');
  for(let index=0;index<count;index+=1)cg.appendChild(document.createElement('col'));
  table.insertBefore(cg,table.firstChild);
  return {cg,cols:[...cg.children],created:true};
}

function measuredColumnWeights(table,cols,count){
  const colWidths=cols.map((col)=>col.getBoundingClientRect().width);
  if(colWidths.every((width)=>width>0))return measuredWeights(cols,table.getBoundingClientRect().width);

  for(const row of table.rows||[]){
    if([...row.cells].some((cell)=>Number(cell.rowSpan||1)>1))continue;
    const total=[...row.cells].reduce((sum,cell)=>sum+Math.max(1,Number(cell.colSpan||1)),0);
    if(total!==count)continue;
    const logical=[];
    for(const cell of row.cells){
      const span=Math.max(1,Number(cell.colSpan||1));
      const width=Math.max(1,cell.getBoundingClientRect().width)/span;
      for(let index=0;index<span;index+=1)logical.push({getBoundingClientRect:()=>({width})});
    }
    return measuredWeights(logical,table.getBoundingClientRect().width);
  }
  return Array.from({length:count},()=>100/count);
}

function applyTable(table,cols,tracks){
  const spans=tracksToSpans(tracks,cols.length);
  table.style.tableLayout='fixed';
  cols.forEach((col,index)=>{col.style.width=`${(spans[index]/PRINT_GRID_COLUMNS)*100}%`;});
  table.dataset.printGridTracks=tracks.join(',');
}

function applyGrid(row,cells,tracks){
  const spans=tracksToSpans(tracks,cells.length);
  row.style.gridTemplateColumns=spans.map((span)=>`${span}fr`).join(' ');
  row.dataset.printGridTracks=tracks.join(',');
}

function addBoundary({host,isLtr,index,tracks,count,width,apply,key,defaults,setGridLayout}){
  host.style.position='relative';
  const handle=document.createElement('span');
  handle.className=`paged-grid-boundary no-print ${isLtr?'ltr':'rtl'}`;
  handle.title='اسحب هذا الحد المرئي لتوسيع أو تضييق المجال';
  host.appendChild(handle);
  const down=(event)=>{
    event.preventDefault();event.stopPropagation();
    const startX=event.clientX;
    const start=[...tracks];
    const trackWidth=(width||1)/PRINT_GRID_COLUMNS;
    const guides=majorGuideTracks();
    const move=(moveEvent)=>{
      const delta=Math.round((moveEvent.clientX-startX)/trackWidth);
      const desired=start[index]+(isLtr?delta:-delta);
      const next=moveTrackBoundary({tracks:start,boundaryIndex:index,desiredTrack:desired,count,guides});
      apply(next);
      setGridLayout(key,serializeTracks(next,count));
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  const dbl=(event)=>{
    event.preventDefault();event.stopPropagation();
    const reset=resolveStoredTracks(null,defaults,count);
    apply(reset);
    setGridLayout(key,null);
  };
  handle.addEventListener('pointerdown',down);
  handle.addEventListener('dblclick',dbl);
  return()=>{handle.removeEventListener('pointerdown',down);handle.removeEventListener('dblclick',dbl);handle.remove();};
}

function visibleBottomBoundary(row){
  return [...row.cells].some((cell)=>{
    const style=window.getComputedStyle(cell);
    return px(style.borderBottomWidth)>0&&style.borderBottomStyle!=='none';
  });
}

function rowStructuralIdentity(row,table){
  if(row.dataset.printRowName)return row.dataset.printRowName;
  if(row.dataset.printGridName)return row.dataset.printGridName;
  if(row.dataset.printRowRole)return `role:${row.dataset.printRowRole}`;
  const section=String(row.parentElement?.tagName||'row').toLowerCase();
  const cells=[...row.cells].map((cell)=>{
    const classes=classIdentity(cell);
    const semantic=(cell.tagName==='TH'||/(label|key|head|section|title)/i.test(classes))
      ? String(cell.textContent||'').trim().replace(/\s+/g,' ').slice(0,42)
      : '';
    return `${cell.tagName.toLowerCase()}[c${Math.max(1,Number(cell.colSpan||1))}r${Math.max(1,Number(cell.rowSpan||1))}]${classes?'.'+classes:''}${semantic?':'+semantic:''}`;
  }).join('|');
  return `${section}:${cells}`.slice(0,420);
}

function applyTableRowHeight(row,units){
  if(units){
    row.style.height=`${Number(units)*PRINT_GRID_ROW_MM}mm`;
    row.dataset.printRowHeightUnits=String(units);
  }else{
    row.style.removeProperty('height');
    delete row.dataset.printRowHeightUnits;
  }
}

function addTableRowHeight({table,row,key,stored,setRowHeight}){
  if(!row.cells.length)return()=>{};
  const anchor=row.cells[0];
  anchor.style.position='relative';
  const tableRect=table.getBoundingClientRect();
  const anchorRect=anchor.getBoundingClientRect();
  const handle=document.createElement('span');
  handle.className='paged-table-row-boundary no-print';
  handle.title='اسحب هذا الحد الأفقي لتوسيع أو تضييق الصف';
  handle.style.left=`${tableRect.left-anchorRect.left}px`;
  handle.style.width=`${tableRect.width}px`;
  anchor.appendChild(handle);

  const down=(event)=>{
    event.preventDefault();event.stopPropagation();
    const startY=event.clientY;
    const pxPerUnit=PRINT_GRID_ROW_MM*MM_TO_CSS_PX;
    const rendered=Math.max(1,Math.round(row.getBoundingClientRect().height/pxPerUnit));
    const start=Math.max(1,Number(stored)||rendered);
    const move=(moveEvent)=>{
      const units=Math.max(1,start+Math.round((moveEvent.clientY-startY)/pxPerUnit));
      applyTableRowHeight(row,units);
      setRowHeight(key,units);
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  const dbl=(event)=>{
    event.preventDefault();event.stopPropagation();
    applyTableRowHeight(row,null);
    setRowHeight(key,null);
  };
  handle.addEventListener('pointerdown',down);
  handle.addEventListener('dblclick',dbl);
  return()=>{handle.removeEventListener('pointerdown',down);handle.removeEventListener('dblclick',dbl);handle.remove();};
}

function addHeight({block,key,stored,setRowHeight}){
  block.style.position='relative';
  const handle=document.createElement('span');
  handle.className='paged-grid-height no-print';
  handle.title='اسحب لضبط ارتفاع العنصر';
  block.appendChild(handle);
  const down=(event)=>{
    event.preventDefault();event.stopPropagation();
    const startY=event.clientY;
    const pxPerUnit=PRINT_GRID_ROW_MM*MM_TO_CSS_PX;
    const natural=Math.max(2,Math.ceil(block.getBoundingClientRect().height/pxPerUnit));
    const start=Number(stored)||natural;
    const move=(moveEvent)=>{
      const units=Math.max(2,start+Math.round((moveEvent.clientY-startY)/pxPerUnit));
      block.style.minHeight=`${units*PRINT_GRID_ROW_MM}mm`;
      setRowHeight(key,units);
    };
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  };
  const dbl=(event)=>{
    event.preventDefault();event.stopPropagation();
    block.style.removeProperty('min-height');
    setRowHeight(key,null);
  };
  handle.addEventListener('pointerdown',down);
  handle.addEventListener('dblclick',dbl);
  return()=>{handle.removeEventListener('pointerdown',down);handle.removeEventListener('dblclick',dbl);handle.remove();};
}

export default function PagedTableGridEditor({editing,gridLayouts,rowHeights,setGridLayout,setRowHeight,documentKey,pageCount}){
  useEffect(()=>{
    const cleanup=[];
    const tables=[...document.querySelectorAll('.constitution-paged-pages .print-constitution table')];

    tables.forEach((table)=>{
      if(table.dataset.printBoundaryLocked==='true')return;
      const count=logicalColumnCount(table);
      if(count<2)return;
      const ensured=ensureColgroup(table,count);
      if(!ensured)return;
      const {cg,cols,created}=ensured;
      const key=`${documentKey}:${tableIdentity(table)}:columns:${count}`;
      const defaults=measuredColumnWeights(table,cols,count);
      const tracks=resolveStoredTracks(gridLayouts?.[key],defaults,count);
      applyTable(table,cols,tracks);

      if(editing){
        const isLtr=window.getComputedStyle(table).direction==='ltr';
        const width=table.getBoundingClientRect().width;
        [...table.rows].forEach((row)=>{
          if([...row.cells].some((cell)=>Number(cell.rowSpan||1)>1))return;
          let cursor=0;
          [...row.cells].forEach((cell)=>{
            cursor+=Math.max(1,Number(cell.colSpan||1));
            if(cursor>=count)return;
            cleanup.push(addBoundary({
              host:cell,
              isLtr,
              index:cursor-1,
              tracks,
              count,
              width,
              apply:(next)=>applyTable(table,cols,next),
              key,
              defaults,
              setGridLayout,
            }));
          });
        });
      }

      [...table.rows].forEach((row)=>{
        const rowName=rowStructuralIdentity(row,table);
        const rowKey=`${documentKey}:${tableIdentity(table)}:row:${rowName}:height`;
        if(rowHeights?.[rowKey])applyTableRowHeight(row,Number(rowHeights[rowKey]));
        else applyTableRowHeight(row,null);
        if(editing&&visibleBottomBoundary(row)&&row.dataset.printRowBoundaryLocked!=='true'){
          cleanup.push(addTableRowHeight({table,row,key:rowKey,stored:rowHeights?.[rowKey],setRowHeight}));
        }
      });

      if(created)cleanup.push(()=>cg.remove());
    });

    [...document.querySelectorAll('.constitution-paged-pages .print-constitution [data-print-grid-row],.constitution-paged-pages .print-constitution .q-meta,.constitution-paged-pages .print-constitution .q-foot')].forEach((row)=>{
      const cells=[...row.children].filter((child)=>!child.classList.contains('no-print'));
      if(cells.length<2)return;
      const key=`${documentKey}:${gridIdentity(row)}:cells:${cells.length}`;
      const defaults=measuredWeights(cells,row.getBoundingClientRect().width);
      const tracks=resolveStoredTracks(gridLayouts?.[key],defaults,cells.length);
      applyGrid(row,cells,tracks);
      if(editing){
        const isLtr=window.getComputedStyle(row).direction==='ltr';
        cells.forEach((cell,index)=>{
          if(index<cells.length-1)cleanup.push(addBoundary({host:cell,isLtr,index,tracks,count:cells.length,width:row.getBoundingClientRect().width,apply:(next)=>applyGrid(row,cells,next),key,defaults,setGridLayout}));
        });
      }
    });

    [...document.querySelectorAll('.constitution-paged-pages .print-constitution [data-print-resizable-block],.constitution-paged-pages .print-constitution .q-meta,.constitution-paged-pages .print-constitution .q-intro,.constitution-paged-pages .print-constitution .q-block.pay,.constitution-paged-pages .print-constitution .q-block.terms,.constitution-paged-pages .print-constitution .q-foot,.constitution-paged-pages .print-constitution .q-sum')].forEach((block,index)=>{
      const name=block.dataset.printGridName||classIdentity(block)||`block-${index}`;
      const key=`${documentKey}:${name}:height`;
      if(rowHeights?.[key])block.style.minHeight=`${Number(rowHeights[key])*PRINT_GRID_ROW_MM}mm`;
      else block.style.removeProperty('min-height');
      if(editing)cleanup.push(addHeight({block,key,stored:rowHeights?.[key],setRowHeight}));
    });

    return()=>cleanup.forEach((fn)=>fn());
  },[documentKey,editing,gridLayouts,pageCount,rowHeights,setGridLayout,setRowHeight]);

  return <>
    <BoundaryBoxEditor editing={editing} gridLayouts={gridLayouts} rowHeights={rowHeights} setGridLayout={setGridLayout} setRowHeight={setRowHeight} documentKey={documentKey} rootSelector=".constitution-paged-pages .print-constitution" refreshKey={pageCount}/>
    <style jsx global>{`
      .paged-grid-boundary{position:absolute;top:-3px;bottom:-3px;width:18px;z-index:45;cursor:col-resize;background:transparent;touch-action:none}
      .paged-grid-boundary.ltr{right:-9px}.paged-grid-boundary.rtl{left:-9px}
      .paged-grid-boundary::after{content:'';position:absolute;top:0;bottom:0;left:8.5px;border-left:1px dashed rgba(139,51,50,.72)}
      .paged-grid-boundary:hover::after,.paged-grid-boundary:active::after{border-left:3px solid rgba(139,51,50,1)}
      .paged-table-row-boundary{position:absolute;bottom:-8px;height:16px;z-index:44;cursor:row-resize;background:transparent;touch-action:none}
      .paged-table-row-boundary::after{content:'';position:absolute;left:0;right:0;top:7px;border-top:1px dashed rgba(139,51,50,.68)}
      .paged-table-row-boundary:hover::after,.paged-table-row-boundary:active::after{border-top:3px solid rgba(139,51,50,1)}
      .paged-grid-height{position:absolute;right:0;left:0;bottom:-7px;height:14px;z-index:34;cursor:row-resize;touch-action:none}
      .paged-grid-height::after{content:'';position:absolute;right:0;left:0;top:6px;border-top:1px dashed rgba(139,51,50,.45)}
      .paged-grid-height:hover::after{border-top:2px solid rgba(139,51,50,.9)}
      @media print{.paged-grid-boundary,.paged-table-row-boundary,.paged-grid-height{display:none!important}}
    `}</style>
  </>;
}
