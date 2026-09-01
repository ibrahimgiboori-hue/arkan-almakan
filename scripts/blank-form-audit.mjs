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

requireTokens('app/print/[id]/page.js', [
  'blankForm',
  'blankRows',
  'طباعة نموذج فارغ',
  'طباعة النموذج الفارغ',
  "className={blankForm ? 'blank-form-mode' : ''}",
  'const fields = blankForm',
  'BlankWritingLines',
  'blank={blankForm}',
  'hasRepeatableSection',
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

requireTokens('app/print/layout.js', [
  "import './print-blank-form.css'",
]);

if (violations.length) {
  console.error('\nBLANK FORM CONSTITUTION AUDIT FAILED\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Blank form constitution audit passed: every document template keeps one governed filled/blank print path.');
