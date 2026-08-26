import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['app', 'components', 'lib'];
const sourceExt = new Set(['.js', '.mjs', '.jsx', '.ts', '.tsx', '.css']);
const duplicatePattern = / \(\d+\)\.[^.]+$/;
const violations = [];
const warnings = [];

// ملفات موروثة معروفة نحتفظ بها مؤقتاً إلى أن يثبت أنها غير مستوردة.
// أي نسخة مرقمة جديدة خارج هذه القائمة تعتبر مخالفة فورية.
const legacyDuplicateAllowlist = new Set([
  'PartyCards (1).js',
  'PartyCards (2).js',
  'page (1).js',
  'form-engine (1).js',
  'components/DocumentForm (1).js',
  'components/HelpButton (1).js',
]);

const requiredProjectOperationContextConsumers = [
  'app/dashboard/projects/[id]/operations/attendance-workspace.js',
  'app/dashboard/projects/[id]/operations/labor/page.js',
  'app/dashboard/projects/[id]/operations/tool-shell.js',
  'app/dashboard/projects/[id]/operations/movements/page.js',
  'app/dashboard/projects/[id]/operations/custody/page.js',
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return sourceExt.has(path.extname(entry.name)) ? [full] : [];
  });
}

function registerDuplicate(rel) {
  if (legacyDuplicateAllowlist.has(rel)) {
    warnings.push(`${rel}: known legacy duplicate pending safe removal`);
  } else {
    violations.push(`${rel}: new numbered duplicate source file`);
  }
}

function hasDirectItemExecutionWrite(text) {
  // item_execution is governed by RPC command gateways. Reading is allowed; client-side
  // insert/update/upsert/delete is not. Keep the window bounded so unrelated calls later
  // in a large file do not create false positives.
  return /\.from\(\s*['"]item_execution['"]\s*\)[\s\S]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/m.test(text);
}

for (const scope of scanRoots) {
  for (const file of walk(path.join(root, scope))) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (duplicatePattern.test(rel)) {
      registerDuplicate(rel);
      continue;
    }
    if (rel === 'lib/system-constitution.js' || rel === 'lib/quote-calc.js') continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/vat_rate\s*\?\?\s*0\.15|vatRate\s*[:=]\s*0\.15/.test(text)) {
      violations.push(`${rel}: hard-coded VAT rate; use SYSTEM.vatRate`);
    }
    if (/monthly_salary\s*\/\s*30|monthlySalary\s*\/\s*30/.test(text)) {
      violations.push(`${rel}: local salary daily-rate calculation; use constitution helper`);
    }
    if (/\bATTEND_CYCLE\s*=/.test(text) && rel !== 'lib/timesheet.js') {
      violations.push(`${rel}: local attendance cycle; use lib/timesheet.js`);
    }
    if (hasDirectItemExecutionWrite(text)) {
      violations.push(`${rel}: direct item_execution write; use constitutional execution RPC gateway`);
    }
  }
}

// «الوحدة الدستورية بلا مستهلك ليست دستورًا»: كل أدوات التشغيل التي تغيّر أو
// تسجل يومًا/مقاولًا يجب أن تستهلك سياق المشروع نفسه. هذا الفحص يمنع عودة
// مجموعتين من localStorage تمحو إحداهما اختيار الأخرى.
for (const rel of requiredProjectOperationContextConsumers) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    violations.push(`${rel}: required project operation context consumer is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (!text.includes('useProjectOperationContext')) {
    violations.push(`${rel}: project operation screen bypasses shared useProjectOperationContext`);
  }
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && duplicatePattern.test(entry.name)) registerDuplicate(entry.name);
}

if (warnings.length) {
  console.warn('\nV2 constitution audit legacy warnings:\n');
  for (const item of warnings) console.warn(`- ${item}`);
}

if (violations.length) {
  console.error('\nV2 constitution audit found blocking violations:\n');
  for (const item of violations) console.error(`- ${item}`);
  console.error(`\nBlocking total: ${violations.length}`);
  process.exit(1);
}

console.log(`V2 constitution audit passed${warnings.length ? ` with ${warnings.length} legacy warning(s)` : ''}.`);
