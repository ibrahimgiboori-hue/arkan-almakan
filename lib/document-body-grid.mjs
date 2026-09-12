import { PRINT_GRID_COLUMNS, PRINT_GRID_ROW_MM } from './print-grid.js';

export const DOCUMENT_BODY_GRID_SCHEMA_VERSION = 1;

export const DOCUMENT_BODY_GRID = Object.freeze({
  owner:'DocumentContentRoot',
  columns:PRINT_GRID_COLUMNS,
  rowMm:PRINT_GRID_ROW_MM,
  continuousBody:true,
  baseRowsImmutable:true,
  visibleBlocksOccupyRowSpans:true,
  dialogsOutsideBody:true,
});

export function documentGridRowsForMm(mm,minRows=1){
  const value=Math.max(0,Number(mm)||0);
  return Math.max(minRows,Math.ceil(value/PRINT_GRID_ROW_MM));
}

export function documentGridRowsForPx(px,pxPerMm=96/25.4,minRows=1){
  const mm=(Math.max(0,Number(px)||0))/Math.max(0.0001,Number(pxPerMm)||96/25.4);
  return documentGridRowsForMm(mm,minRows);
}

export function documentGridSpanMm(rows){
  return Math.max(1,Math.ceil(Number(rows)||1))*PRINT_GRID_ROW_MM;
}

export function documentGridSnapMm(mm,minRows=0){
  const value=Math.max(0,Number(mm)||0);
  if(value===0&&minRows===0)return 0;
  return documentGridSpanMm(documentGridRowsForMm(value,Math.max(1,minRows)));
}
