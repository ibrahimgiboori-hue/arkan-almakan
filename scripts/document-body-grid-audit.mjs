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
  semantics:'components/print/PrintSemanticRolesRuntime.js',
  workbench:'components/print/PrintContentWorkbench.js',
  layout:'app/layout.js',
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
}

if(exists(files.body)){
  const source=read(files.body);
  for(const required of [
    'data-document-content-body="single-continuous-grid"',
    'data-document-base-rows="immutable"',
    'gridAutoRows:`${DOCUMENT_BODY_GRID.rowMm}mm`',
    'normalizeCompactMetadata(root)',
    'enforceHeaderContrast(root)',
    'onLayoutSettled',
  ])if(!source.includes(required))fail(`DocumentContentRoot missing runtime contract: ${required}`);
  if(source.includes('@media print'))fail('DocumentContentRoot may not use print-only geometry.');
}

if(exists(files.frame)){
  const source=read(files.frame);
  for(const required of [
    "@/components/print/DocumentContentRoot",
    'governedContentBody',
    'onLayoutSettled={onLayoutSettled}',
    'arkan:print-content-layout-changed',
  ])if(!source.includes(required))fail(`ConstitutionPrintFrame missing: ${required}`);
}

if(exists(files.semantics)){
  const source=read(files.semantics);
  for(const required of [
    "TITLE_ROW:'title-row'",
    "CONSTANT_COLUMN:'constant-column'",
    'data.printSemantic',
    'captain-fallback',
    'captain-inference',
    'inferKeyValueTables',
    'applyPrintSemanticRoles',
    "scope.dataset.printSemanticSchema='title-row|constant-column'",
  ])if(!source.includes(required))fail(`PrintSemanticRolesRuntime missing semantic contract: ${required}`);
}

if(exists(files.workbench)){
  const source=read(files.workbench);
  for(const required of [
    'contentWorkbenchProfiles',
    'beforeRows',
    'afterRows',
    'titleRow',
    'constantColumn',
    'PRINT_SEMANTIC_ROLE.TITLE_ROW',
    'PRINT_SEMANTIC_ROLE.CONSTANT_COLUMN',
    'applyPrintSemanticRoles(document)',
    'data-print-semantic',
    'أسطر العناوين',
    'أعمدة الثوابت',
    'حفظ التغييرات',
  ])if(!source.includes(required))fail(`PrintContentWorkbench missing capability: ${required}`);
  for(const retired of ['رؤوس الجداول','عناوين الأقسام','عناوين الحقول / المدخلات']){
    if(source.includes(retired))fail(`retired color taxonomy returned: ${retired}`);
  }
}

if(exists(files.layout)){
  const source=read(files.layout);
  if(!source.includes("@/components/print/PrintSemanticRolesRuntime"))fail('Root layout must load Captain semantic roles runtime.');
  if(!source.includes('<PrintSemanticRolesRuntime />'))fail('Captain semantic roles runtime must be mounted globally.');
  if(!source.includes('<PrintContentWorkbench />'))fail('PrintContentWorkbench must remain mounted outside printed content.');
}

if(exists(files.generic)){
  const source=read(files.generic);
  if(!source.includes('className="governed-document-sheet"'))fail('generic document must expose one governed content root.');
}

if(exists(files.hardening)){
  const source=read(files.hardening);
  for(const required of [
    '.document-content-body > .document-visible-block > *',
    'var(--print-block-gap-before, 0mm)',
    'var(--print-block-gap-after, 2mm)',
    '.print-content-workbench',
  ])if(!source.includes(required))fail(`Captain hardening missing visible print law: ${required}`);
}

if(DOCUMENT_BODY_GRID.columns!==48)fail(`document body must have 48 logical columns, got ${DOCUMENT_BODY_GRID.columns}.`);
if(DOCUMENT_BODY_GRID.rowMm!==2)fail(`document body base row must be 2 mm, got ${DOCUMENT_BODY_GRID.rowMm}.`);
if(documentGridRowsForMm(6.1)!==4)fail('6.1 mm content must occupy four fixed 2 mm rows.');
if(documentGridSpanMm(4)!==8)fail('four logical rows must span exactly 8 mm.');
const pxPerMm=96/25.4;
if(documentGridRowsForPx(12*pxPerMm,pxPerMm)!==6)fail('pixel measurement must quantize to fixed 2 mm row spans.');

if(failures.length){
  console.error('\nDOCUMENT BODY GRID AUDIT FAILED\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Document body grid audit passed: Captain owns one continuous 48-column body, fixed 2 mm rows, semantic title-row/constant-column roles, role-based colors, per-block spacing and automatic repagination.');
