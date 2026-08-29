import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const printRoot = path.join(root, 'app', 'print');
const centralFiles = new Set([
  path.normalize('app/print/print-system.css'),
  path.normalize('app/print/print-constitution.css'),
  path.normalize('app/print/print-office-model.css'),
]);

// /print/[id] is the single generic template renderer. It may still place
// stamp/signature inside an explicit template stampbox until that renderer is
// extracted into components/print. No document-specific page gets this right.
const inlineMarkOwnerFiles = new Set([
  path.normalize('app/print/[id]/page.js'),
]);

const geometryRules = [
  { re:/@page\b/i, label:'تعريف @page محلي' },
  { re:/\bsize\s*:\s*A4\b/i, label:'تعريف حجم A4 محلي' },
  { re:/(^|[\s,{])html\s*,\s*body\s*\{/i, label:'تعريف html/body للطباعة محليًا' },
  { re:/\.print-page\s*\{/i, label:'إعادة تعريف هندسة .print-page' },
  { re:/\.constitution-paged-sheet\s*\{/i, label:'إعادة تعريف هندسة الصفحة متعددة الصفحات' },
];

const markRules = [
  { re:/\bstamp_image_path\b/i, label:'قراءة ملف الختم خارج طبقة الطباعة المركزية' },
  { re:/\bsignature_image_path\b/i, label:'قراءة ملف التوقيع خارج طبقة الطباعة المركزية' },
  { re:/\.print-master-stamp\s*\{/i, label:'تعريف هندسة الختم محليًا خارج دستور الطباعة' },
  { re:/\.print-master-signature\s*\{/i, label:'تعريف هندسة التوقيع محليًا خارج دستور الطباعة' },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes:true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

const candidates = walk(printRoot).filter((file) => /\.(?:js|jsx|ts|tsx|css)$/.test(file));
const violations = [];

for (const file of candidates) {
  const rel = path.normalize(path.relative(root, file));
  if (centralFiles.has(rel)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of geometryRules) {
    if (rule.re.test(content)) violations.push(`${rel}: ${rule.label}`);
  }
  if (!inlineMarkOwnerFiles.has(rel)) {
    for (const rule of markRules) {
      if (rule.re.test(content)) violations.push(`${rel}: ${rule.label}`);
    }
  }
}

const layoutPath = path.join(printRoot, 'layout.js');
if (fs.existsSync(layoutPath)) {
  const layout = fs.readFileSync(layoutPath, 'utf8');
  if (!layout.includes("import './print-constitution.css'")) {
    violations.push('app/print/layout.js: نقطة الدخول ليست print-constitution.css');
  }
  if (!layout.includes("import './print-office-model.css'")) {
    violations.push('app/print/layout.js: نموذج Word + Excel غير مطبق على كل المطبوعات');
  }
  for (const legacy of ['procedure-system.css','print-constitution-hardening.css']) {
    if (layout.includes(legacy)) violations.push(`app/print/layout.js: استيراد طبقة طباعة قديمة ${legacy}`);
  }
}

const officeModelPath = path.join(printRoot, 'print-office-model.css');
if (!fs.existsSync(officeModelPath)) {
  violations.push('app/print/print-office-model.css: نموذج Word + Excel المركزي مفقود');
} else {
  const officeModel = fs.readFileSync(officeModelPath, 'utf8');
  for (const token of [
    '--office-prose-leading',
    '--office-prose-gap',
    '--office-table-leading',
    '.print-prose',
    '.print-data-table',
    'table thead{display:table-header-group}',
    'page-break-inside:avoid!important',
    '[data-print-type="money"]',
  ]) {
    if (!officeModel.includes(token)) violations.push(`print-office-model.css: missing governed Office Model contract ${token}`);
  }
}

if (violations.length) {
  console.error('\nPRINT CONSTITUTION AUDIT FAILED');
  console.error('صفحات المحتوى لا تملك هندسة الورق أو أصول الهوية، ونموذج Word + Excel يجب أن يبقى مركزيًا ومطبقًا على جميع المطبوعات.\n');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Print constitution audit passed (${candidates.length} print source files checked; Word + Excel model active).`);
