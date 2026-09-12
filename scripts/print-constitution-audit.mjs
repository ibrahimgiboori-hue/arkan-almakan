import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const printRoot=path.join(root,'app','print');
const printComponentsRoot=path.join(root,'components','print');
const violations=[];

function walk(dir){
  if(!fs.existsSync(dir))return[];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}
function rel(file){return path.normalize(path.relative(root,file));}
function read(relative){
  const full=path.join(root,relative);
  if(!fs.existsSync(full)){violations.push(`${relative}: الملف مفقود`);return'';}
  return fs.readFileSync(full,'utf8');
}
function requireTokens(relative,tokens){
  const text=read(relative);
  for(const token of tokens)if(!text.includes(token))violations.push(`${relative}: missing governed print contract ${token}`);
  return text;
}
function forbidTokens(relative,tokens){
  const text=read(relative);
  for(const token of tokens)if(text.includes(token))violations.push(`${relative}: بقايا متقاعدة ممنوعة (${token})`);
  return text;
}

const printFiles=walk(printRoot).filter((file)=>/\.(?:js|jsx|ts|tsx|css)$/.test(file));
const printComponentFiles=walk(printComponentsRoot).filter((file)=>/\.(?:js|jsx|ts|tsx)$/.test(file));

for(const retired of [
  'app/print/print-system.css',
  'app/print/employees/emp-report.css',
  'components/print/PrintFrame.js',
  'lib/quote-pagination.mjs',
  'tests/quote-pagination.test.mjs',
]){
  if(fs.existsSync(path.join(root,retired)))violations.push(`${retired}: ملف متقاعد عاد بعد الإحلال`);
}

const retiredRuntimeTokens=[
  'paginateRows','positiveRowCap','autoPaginate','showLetterhead','margin_top_mm','margin_bottom_mm','margin_side_mm',
  'stamp_x_mm','stamp_y_mm','sign_x_mm','sign_y_mm','letterhead_top_mm','letterhead_bottom_mm','safeBottomMm',
];
for(const file of [...printFiles,...printComponentFiles]){
  const relative=rel(file);
  const text=fs.readFileSync(file,'utf8');
  for(const token of retiredRuntimeTokens){
    if(text.includes(token))violations.push(`${relative}: API/إعداد طباعة متقاعد ما زال حيًا (${token})`);
  }
}

for(const file of printFiles){
  const relative=rel(file);
  const text=fs.readFileSync(file,'utf8');
  if(/@page\b/i.test(text))violations.push(`${relative}: @page خارج القبطان`);
  if(/\bsize\s*:\s*A4\b/i.test(text))violations.push(`${relative}: حجم A4 محلي خارج القبطان`);
  if(/(^|[\s,{])html\s*,\s*body\s*\{/i.test(text))violations.push(`${relative}: html/body عالمي داخل طبقة طباعة`);
  if(/\.constitution-paged-sheet\s*\{/i.test(text))violations.push(`${relative}: إعادة تعريف هندسة صفحة القبطان`);
  if(/\.print-page\s*\{/i.test(text))violations.push(`${relative}: إعادة تعريف هندسة .print-page`);
}

for(const file of printFiles.filter((file)=>/\.(?:js|jsx|ts|tsx)$/.test(file))){
  const relative=rel(file);
  const text=fs.readFileSync(file,'utf8');
  if(/\bstamp_image_path\b/.test(text))violations.push(`${relative}: الختم يجب أن يمر عبر PrintMark/PrintMarks`);
  if(/\bsignature_image_path\b/.test(text))violations.push(`${relative}: التوقيع يجب أن يمر عبر PrintMark/PrintMarks`);
}

const governance=requireTokens('lib/print-governance.js',[
  "PRINT_GOVERNANCE_VERSION = '3.2'","GOVERNED: 'governed'",'PRINT_WORD_STANDARD','bodyMarginMm:25.4','headerFromEdgeMm:12.7','footerFromEdgeMm:12.7',
  'ARKAN_LETTERHEAD_PROFILE','portraitTopArtworkMm:34.23','portraitBottomArtworkMm:19.13','PRINT_LINE_FLOW_POLICY',"owner:'ConstitutionPagedFrame'", "measurementUnit:'visual-line-box'",
  'PRINT_LETTERHEAD_SOURCE','PRINT_PAPER_ROTATION','PRINT_FLOW_BOUNDARY','PRINT_FLOW_KIND',"REPEATABLE_TABLE: 'repeatable-table'",'claim_documents','quotation','employee_report','timesheet_report','expense_report','board_report','generic_document',
]);
for(const forbidden of ['MIGRATING','LEGACY','recruitment_offer_public','recruitment_contract_public','pagination:Object.freeze','paginateRows','positiveRowCap']){
  if(governance.includes(forbidden))violations.push(`lib/print-governance.js: سجل الهجرة لم يُغلق (${forbidden})`);
}

requireTokens('lib/report-preparation.js',[
  'filter-sort-group-before-print-v1',"owner:'report-definition'", "sourceMutation:'forbidden'", "grouping:'semantic-sections-not-physical-pages'", "captainRole:'pagination-only'",'reportCreatesTruth:false','prepareReportRows','groupPreparedReportRows',
]);

const layout=requireTokens('app/print/layout.js',["import './print-constitution.css'","import './print-office-model.css'",'print-route-root','PrintGovernanceBoundary']);
if(layout.includes('print-system.css'))violations.push('app/print/layout.js: استيراد print-system.css المتقاعد');

requireTokens('app/print/print-constitution.css',[
  'ARKAN PRINT CONSTITUTION v3.2','.print-route-root','.print-constitution table','--arkan-print-table-head-text:#111','.print-constitution thead th','-webkit-text-fill-color:var(--arkan-print-table-head-text)!important','.print-signoff-block','.procedure-stage-grid',
]);
requireTokens('app/print/print-office-model.css',[
  'ARKAN PRINT OFFICE MODEL v2','--office-prose-leading','--office-table-leading','.print-constitution .xlsx-grid','.print-family-projects-finance .project-finance-document','.print-constitution .governed-document-sheet','[data-print-type="money"]',
]);

const wrapper=requireTokens('components/print/ConstitutionPrintFrame.js',['ConstitutionPagedFrame','expandCaptainFlowBlocks','showPageNumbers={false}']);
for(const forbidden of ['contentTopMm','contentBottomMm','contentSideMm','contentLeftMm','contentRightMm','getPrintLayoutPolicy']){
  if(wrapper.includes(forbidden))violations.push(`ConstitutionPrintFrame.js: wrapper ما زال يملك/يمرر هندسة (${forbidden})`);
}

const paged=requireTokens('components/print/ConstitutionPagedFrame.js',[
  'CAPTAIN_GEOMETRY_SCHEMA = 6','PRINT_LETTERHEAD_SOURCE','PRINT_PAPER_ROTATION','data-print-letterhead-source','data-print-paper-rotation','data-print-geometry-schema','data-print-line-seams="visual-line-box"','measuredLineBands(','visualLineSeams(','chooseVisualLineBreak(','measuredRowSlice(','letterheadTop + headerClearanceMm','letterheadBottom + footerClearanceMm','sideReservedLetterhead','rotatedDigitalMaster',"@page{size:A4 ${orientation};margin:0}",
]);
for(const forbidden of ['cfg?.letterhead_top_mm','cfg?.letterhead_bottom_mm','safeBottomMm','NORMAL_TOP_MM','NORMAL_BOTTOM_MM','setFlowPagination','samePagination']){
  if(paged.includes(forbidden))violations.push(`ConstitutionPagedFrame.js: بقايا محرك/هندسة قديمة (${forbidden})`);
}

const governedRoutes={
  'app/print/operating-budget/page.js':['ConstitutionPrintFrame','data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}'],
  'app/print/payroll/[id]/page.js':['ConstitutionPrintFrame','data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}'],
  'app/print/expenses/page.js':['ConstitutionPrintFrame','data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}'],
  'app/print/employees/page.js':['ConstitutionPrintFrame','data-print-flow="repeatable-table"'],
  'app/print/timesheet/page.js':['ConstitutionPrintFrame','data-print-flow="repeatable-table"'],
  'app/print/timesheet/blank/page.js':['ConstitutionPrintFrame','data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}'],
  'app/print/board/page.js':['ConstitutionPrintFrame','data-print-flow="repeatable-table"'],
  'app/print/quote/[id]/page.js':['ConstitutionPrintFrame','data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}'],
  'app/print/[id]/page.js':['ConstitutionPrintFrame','buildCleanDocumentBlocks','resolveCleanSections'],
};
for(const [relative,tokens] of Object.entries(governedRoutes))requireTokens(relative,tokens);

/* Clean-room generic document contract: the route owns data loading only. */
const generic=forbidTokens('app/print/[id]/page.js',[
  "./print.css",'PartiesPrint','ProjectReportJourneyPrint','PrintMark','PRINT_FLOW_KIND',
  'governed-document-sheet','title-block','card-doc','card-head','plain-card','pc-head','pc-k','pc-v','amounts','sigtable','footer-row',
  'margin_top_mm','margin_bottom_mm','margin_side_mm','contentTopMm','contentBottomMm','contentSideMm','stamp_image_path','signature_image_path',
]);
if(!generic.includes("from '@/components/print/forms-v2/CleanDocumentFlow'"))violations.push('app/print/[id]/page.js: المسار العام لا يستخدم محرك النماذج النظيف');

const cleanFlow=requireTokens('components/print/forms-v2/CleanDocumentFlow.js',[
  "CLEAN_DOCUMENT_SCHEMA = 'clean-document-v2'",'data-clean-document={CLEAN_DOCUMENT_SCHEMA}','data-print-role="title-row"','data-print-role="constant-column"',
  'PRINT_FLOW_KIND.REPEATABLE_TABLE','PrintMark','resolveCleanSections','buildCleanDocumentBlocks','CAT_PROCUREMENT_ASSETS_ASSET_HANDOVER','Acknowledgement & Undertaking',
]);
for(const forbidden of [
  "from '@/components/PartiesPrint'","from '@/components/print/ProjectReportJourneyPrint'",'governed-document-sheet','title-block','card-doc','card-head','plain-card','pc-head','pc-k','pc-v','amounts','sigtable','footer-row',
]){
  if(cleanFlow.includes(forbidden))violations.push(`CleanDocumentFlow.js: محرك النماذج الجديد ورث تصميمًا قديمًا (${forbidden})`);
}

const cleanSkin=requireTokens('components/print/forms-v2/CleanDocumentFlow.module.css',[
  'Clean-room document skin','.document {','.pinGrid {','.table {','.signatureGrid {','.partiesGrid {',
]);
for(const forbidden of ['@page','size:A4','.governed-document-sheet','.title-block','.card-doc','.card-head','.plain-card','.pc-head','.pc-k','.pc-v','.amounts','.sigtable','.footer-row']){
  if(cleanSkin.includes(forbidden))violations.push(`CleanDocumentFlow.module.css: الجلد النظيف يحمل اعتمادًا قديمًا/هندسة صفحة (${forbidden})`);
}

requireTokens('components/print/PrintPresentationContext.js',['PrintPresentationProvider','PrintColumnLabel','labels']);
requireTokens('components/print/PagedTableGridEditor.js',['logicalColumnCount','addTableOuterBoundary','paged-grid-boundary','paged-table-row-boundary','.constitution-flow-measure table','BoundaryBoxEditor']);
requireTokens('components/print/PrintMarks.js',['PrintMark','print-master-stamp','print-master-signature']);
requireTokens('components/print/PrintTextAlignmentEditor.js',['PRINT_TEXT_ALIGNMENT_OPTIONS','data-print-text-align']);
requireTokens('components/print/PrintGovernanceBoundary.js',['resolvePrintDocument','PrintTextAlignmentEditor','print-unregistered']);

if(violations.length){
  console.error('\nPRINT CONSTITUTION AUDIT FAILED');
  console.error('القانون: القبطان وحده يملك الورقة والهندسة والتقسيم، ومحرك النماذج النظيف يملك المحتوى الدلالي فقط ولا يرث تصميمات Legacy.\n');
  for(const item of violations)console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Print constitution audit passed (${printFiles.length} print source files checked; generic documents use the isolated clean-room flow and all physical pagination remains Captain-owned).`);
