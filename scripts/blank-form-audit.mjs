import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const violations=[];

function read(rel){
  const file=path.join(root,rel);
  if(!fs.existsSync(file)){violations.push(`${rel}: الملف مفقود`);return'';}
  return fs.readFileSync(file,'utf8');
}
function requireTokens(rel,tokens){
  const content=read(rel);
  for(const token of tokens)if(!content.includes(token))violations.push(`${rel}: missing blank-form contract ${token}`);
}
function forbidTokens(rel,tokens){
  const content=read(rel);
  for(const token of tokens)if(content.includes(token))violations.push(`${rel}: forbidden retired/legacy blank-form contract ${token}`);
}

requireTokens('lib/print-empty-value.mjs',[
  'isEmptyPrintValue','printEmptyKind','printEmptyToken',"return '..../..../......'","return '—'",
]);

requireTokens('app/print/[id]/page.js',[
  'blankForm','blankRows','blankStatusRows','hasRepeatableSection','buildCleanDocumentBlocks','CleanPrintToolbar',
  "className={blankForm ? 'clean-blank-form' : ''}",
]);
forbidTokens('app/print/[id]/page.js',[
  'ProjectReportJourneyPrint','PartiesPrint','BlankWritingLines','blank-form-mode','printEmptyKind','printEmptyToken',
]);

requireTokens('components/print/forms-v2/CleanDocumentFlow.js',[
  'isEmptyPrintValue','BlankValue','BlankLines','blankForm','blankRows','blankStatusRows','hasRepeatableSection',
  'طباعة نموذج فارغ','طباعة النموذج الفارغ','ProjectReportFlow','operational_lines','_report_sections',
  'data-clean-document={CLEAN_DOCUMENT_SCHEMA}',
]);
forbidTokens('components/print/forms-v2/CleanDocumentFlow.js',[
  "from '@/components/PartiesPrint'","from '@/components/print/ProjectReportJourneyPrint'",'blank-write-line','blank-writing-lines',
]);

requireTokens('components/print/forms-v2/CleanDocumentFlow.module.css',[
  '.blankValue {','.blankLines {','.blankLines span {','.projectItem {','.operationalRow {',
]);
forbidTokens('components/print/forms-v2/CleanDocumentFlow.module.css',[
  '.blank-form-mode','.blank-write-line','.blank-writing-lines','.report-item-block','.report-operational-row',
]);

requireTokens('components/documents/ProjectReportJourneyEditor.js',[
  'operational_lines','اكتب عنوان السطر','إضافة سطر','عنوان القسم','إضافة قسم',
]);
requireTokens('components/documents/ProjectReportDocumentForm.js',[
  'GENERATED_KEYS','_report_sections','ProjectReportJourneyEditor',
]);

/* Legacy paper CSS may remain for specialized non-generic routes, but it must never own clean-room classes. */
forbidTokens('app/print-captain-hardening.css',['.blank-write-line','.blank-form-mode .amounts th']);

if(violations.length){
  console.error('\nBLANK FORM CONSTITUTION AUDIT FAILED\n');
  for(const violation of violations)console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Blank form constitution audit passed: generic filled and blank documents share the isolated clean flow, empty values remain type-aware, and the old ProjectReport/Parties print skins are not imported by the generic route.');
