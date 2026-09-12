import fs from 'node:fs';
import path from 'node:path';
import {
  DOCUMENT_BODY_GRID,
  documentGridRowsForMm,
  documentGridRowsForPx,
  documentGridSpanMm,
} from '../lib/document-body-grid.mjs';

const root=process.cwd();
const failures=[];
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const fail=(message)=>failures.push(message);

const files={
  grid:'lib/print-grid.js',
  contract:'lib/document-body-grid.mjs',
  body:'components/print/DocumentContentRoot.js',
  frame:'components/print/ConstitutionPrintFrame.js',
  generic:'app/print/[id]/page.js',
  hardening:'app/print-captain-hardening.css',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.grid)){
  const source=read(files.grid);
  if(!source.includes('PRINT_GRID_COLUMNS = PRINT_GRID_MAJOR_COLUMNS * PRINT_GRID_SUBDIVISIONS'))fail('print grid must derive the 48-column body from one shared definition.');
  if(!source.includes('PRINT_GRID_ROW_MM = 2'))fail('print grid base row must remain exactly 2 mm.');
}

if(exists(files.contract)){
  const source=read(files.contract);
  for(const required of ['owner:\'DocumentContentRoot\'','continuousBody:true','baseRowsImmutable:true','visibleBlocksOccupyRowSpans:true','dialogsOutsideBody:true','PRINT_GRID_COLUMNS','PRINT_GRID_ROW_MM']){
    if(!source.includes(required))fail(`document body contract missing: ${required}`);
  }
  for(const forbidden of ['const PRINT_GRID_COLUMNS = 48','const PRINT_GRID_ROW_MM = 2'])if(source.includes(forbidden))fail(`document body contract duplicated a print-grid constant: ${forbidden}`);
}

if(exists(files.body)){
  const source=read(files.body);
  for(const required of [
    'data-document-content-body="single-continuous-grid"',
    'data-document-base-rows="immutable"',
    'data-document-dialogs="outside-body"',
    'gridTemplateColumns:`repeat(${DOCUMENT_BODY_GRID.columns}',
    'gridAutoRows:`${DOCUMENT_BODY_GRID.rowMm}mm`',
    'documentGridRowsForPx',
    'data-document-visible-block="true"',
    'quantizeLogicalRows(root)',
    'normalizeLegacyVisibleGrids(root)',
    'normalizeCompactMetadata(root)',
    'COMPACT_METADATA_TABLES',
    "rows.length<4",
    "gridTemplateColumns='repeat(2,minmax(0,1fr))'",
    "row.style.gridColumn=metadataRowIsWide(row)?'1 / -1':'auto'",
    'enforceHeaderContrast(root)',
    'MIN_READABLE_CONTRAST=4.5',
    'onLayoutSettled',
  ])if(!source.includes(required))fail(`DocumentContentRoot missing runtime contract: ${required}`);
  if(source.includes('@media print'))fail('DocumentContentRoot may not use print-only geometry; preview and print must share one body geometry.');
}

if(exists(files.frame)){
  const source=read(files.frame);
  if(!source.includes("@/components/print/DocumentContentRoot"))fail('ConstitutionPrintFrame must own the shared DocumentContentRoot bridge.');
  if(!source.includes('governedContentBody'))fail('ConstitutionPrintFrame must normalize print content through one governed body.');
  if(!source.includes('typeof root.type===\'string\''))fail('DOM document roots must be promoted into DocumentContentRoot before Captain pagination.');
  if(!source.includes('onLayoutSettled={onLayoutSettled}'))fail('Captain bridge must repaginate after fixed-grid spans settle.');
}

if(exists(files.generic)){
  const source=read(files.generic);
  if(!source.includes('className="governed-document-sheet"'))fail('generic document must expose one content root to the shared frame.');
  if(!source.includes('toolbar no-print'))fail('generic document controls must remain outside the printed document body.');
}

if(exists(files.hardening)){
  const source=read(files.hardening);
  for(const required of [
    ".document-content-body > .document-visible-block > *",
    'margin-bottom: 2mm !important',
    "[data-print-contrast-tone='light-text']",
    "[data-print-contrast-tone='dark-text']",
    '.print-route-root .amounts th',
    '.print-route-root .pc-head',
    '.print-route-root .pt-head',
    '.print-route-root .report-items-title',
  ])if(!source.includes(required))fail(`Captain hardening missing visible print law: ${required}`);
  const firstMediaPrint=source.indexOf('@media print');
  const rhythmIndex=source.indexOf('.document-content-body > .document-visible-block > *');
  const contrastIndex=source.indexOf("[data-print-contrast-tone='light-text']");
  if(firstMediaPrint>=0&&(rhythmIndex>firstMediaPrint||contrastIndex>firstMediaPrint)){
    fail('document rhythm and adaptive contrast must apply before @media print so preview and print geometry remain identical.');
  }
}

if(DOCUMENT_BODY_GRID.columns!==48)fail(`document body must have 48 logical columns, got ${DOCUMENT_BODY_GRID.columns}.`);
if(DOCUMENT_BODY_GRID.rowMm!==2)fail(`document body base row must be 2 mm, got ${DOCUMENT_BODY_GRID.rowMm}.`);
if(documentGridRowsForMm(6.1)!==4)fail('6.1 mm content must occupy four fixed 2 mm rows, not stretch a row.');
if(documentGridSpanMm(4)!==8)fail('four logical rows must span exactly 8 mm.');
const pxPerMm=96/25.4;
if(documentGridRowsForPx(12*pxPerMm,pxPerMm)!==6)fail('pixel measurement must quantize to fixed 2 mm row spans.');

if(failures.length){
  console.error('\nDOCUMENT BODY GRID AUDIT FAILED\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Document body grid audit passed: one continuous 48-column body, fixed 2 mm rows, two-column metadata, 2 mm inter-block rhythm, visible adaptive contrast, and Captain repagination after grid settlement are locked.');
