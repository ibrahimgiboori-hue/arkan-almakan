import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const violations = [];

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    violations.push(`${rel}: الملف مفقود`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function requireTokens(rel, tokens) {
  const content = read(rel);
  for (const token of tokens) {
    if (!content.includes(token)) violations.push(`${rel}: missing blank-form contract ${token}`);
  }
}

function forbidTokens(rel, tokens) {
  const content = read(rel);
  for (const token of tokens) {
    if (content.includes(token)) violations.push(`${rel}: forbidden fixed journey contract ${token}`);
  }
}

requireTokens('app/print/[id]/page.js', [
  'blankForm',
  'blankRows',
  'blankStatusRows',
  'طباعة نموذج فارغ',
  'طباعة النموذج الفارغ',
  "className={blankForm ? 'blank-form-mode' : ''}",
  'const fields = blankForm',
  'BlankWritingLines',
  'blank={blankForm}',
  'hasRepeatableSection',
  'ProjectReportJourneyPrint',
]);

requireTokens('components/print/ProjectReportJourneyPrint.js', [
  'operational_lines',
  'generatedSummary',
  'generatedConclusion',
  '_report_sections',
  'blankStatusRows',
  'report-operational-label',
]);

requireTokens('components/documents/ProjectReportJourneyEditor.js', [
  'operational_lines',
  'اكتب عنوان السطر',
  'إضافة سطر',
  'عنوان القسم',
  'إضافة قسم',
]);

requireTokens('components/documents/ProjectReportDocumentForm.js', [
  'GENERATED_KEYS',
  '_report_sections',
  'ProjectReportJourneyEditor',
]);

forbidTokens('app/print/[id]/page.js', [
  'PROJECT_REPORT_OPERATIONAL_FIELDS',
]);

requireTokens('components/PartiesPrint.js', [
  'blank = false',
  'blank-party-value',
  'blank-writing-lines',
]);

requireTokens('app/print/print-blank-form.css', [
  '.blank-form-mode .blank-write-line',
  '.blank-form-mode .blank-writing-lines',
  '.blank-form-mode .report-item-block',
  'page-break-inside:avoid',
]);

requireTokens('app/print/print-report-paper-form.css', [
  '.report-metric-label',
  'border-bottom:.24mm solid #CDBABA',
  '.report-metric-value',
  '.report-operational-row',
  'grid-template-columns:32mm minmax(0,1fr)',
]);

requireTokens('app/print/layout.js', [
  "import './print-blank-form.css'",
  "import './print-report-paper-form.css'",
]);

if (violations.length) {
  console.error('\nBLANK FORM CONSTITUTION AUDIT FAILED\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Blank form constitution audit passed: filled and blank documents share one print path, project report titles remain flexible, numeric labels are separated from write-in values, and summaries remain generated.');
