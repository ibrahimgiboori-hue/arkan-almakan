import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const printRoot = path.join(root, 'app', 'print');
const centralFiles = new Set([
  path.normalize('app/print/print-system.css'),
  path.normalize('app/print/print-constitution.css'),
]);

const forbidden = [
  { re:/@page\b/i, label:'تعريف @page محلي' },
  { re:/\bsize\s*:\s*A4\b/i, label:'تعريف حجم A4 محلي' },
  { re:/(^|[\s,{])html\s*,\s*body\s*\{/i, label:'تعريف html/body للطباعة محليًا' },
  { re:/\.print-page\s*\{/i, label:'إعادة تعريف هندسة .print-page' },
  { re:/\.constitution-paged-sheet\s*\{/i, label:'إعادة تعريف هندسة الصفحة متعددة الصفحات' },
  { re:/\bstamp_image_path\b/i, label:'قراءة ملف الختم خارج طبقة PrintMarks الموحدة' },
  { re:/\bsignature_image_path\b/i, label:'قراءة ملف التوقيع خارج طبقة PrintMarks الموحدة' },
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
  for (const rule of forbidden) {
    if (rule.re.test(content)) violations.push(`${rel}: ${rule.label}`);
  }
}

const layoutPath = path.join(printRoot, 'layout.js');
if (fs.existsSync(layoutPath)) {
  const layout = fs.readFileSync(layoutPath, 'utf8');
  if (!layout.includes("import './print-constitution.css'")) {
    violations.push('app/print/layout.js: نقطة الدخول ليست print-constitution.css');
  }
  for (const legacy of ['procedure-system.css','print-constitution-hardening.css']) {
    if (layout.includes(legacy)) violations.push(`app/print/layout.js: استيراد طبقة طباعة قديمة ${legacy}`);
  }
}

if (violations.length) {
  console.error('\nPRINT CONSTITUTION AUDIT FAILED');
  console.error('صفحات المحتوى لا تملك هندسة الورق أو أصول الهوية. انقل القاعدة إلى دستور الطباعة وPrintMarks المركزيين.\n');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Print constitution audit passed (${candidates.length} print source files checked).`);
