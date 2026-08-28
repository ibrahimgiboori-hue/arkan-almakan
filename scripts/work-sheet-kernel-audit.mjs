import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

function requireText(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${file}: مفقود الثابت البنيوي ${needle}`);
  }
}

requireText('app/dashboard/layout.js', [
  "import './raw-tokens.css'",
  "import './raw-phase.css'",
  'data-work-kernel="operational-notebook-v1"',
  'data-work-sheet-mount="true"',
  'className="workSheetMount"',
]);

if (read('app/dashboard/layout.js').includes("work-sheet-kernel.css")) {
  failures.push('app/dashboard/layout.js: أعاد ملف هندسة منافسًا إلى الغلاف العام.');
}

if (exists('app/dashboard/work-sheet-kernel.css')) {
  failures.push('app/dashboard/work-sheet-kernel.css: ملف هندسة قديم يجب ألا يعود بعد توحيد القبطان.');
}

if (exists('components/ui/RawDashboardNavigation.module.css')) {
  failures.push('RawDashboardNavigation.module.css: هندسة الملاحة يجب أن تبقى تحت raw-phase.css فقط.');
}

requireText('app/dashboard/raw-phase.css', [
  '.rawNav {',
  '.rawNavPrimary',
  '.rawNavContext',
  '.rawDashboardContent > .workSheetMount',
  "[data-work-header='true']",
  "[data-work-ledger='true']",
  "[data-work-dock='true']",
  'scrollbar-gutter: stable both-edges',
]);

requireText('components/ui/RawDashboardNavigation.js', [
  'className="rawNav"',
  'className="rawNavPrimary"',
  'className="rawNavContext"',
]);

const nav = read('components/ui/RawDashboardNavigation.js');
if (nav.includes('RawDashboardNavigation.module.css')) failures.push('الملاحة عادت تعتمد CSS Module منافسًا.');
if (nav.includes('useCompactOnScroll')) failures.push('الملاحة عادت تغير ارتفاعها حسب التمرير، وهذا يعيد القفزات.');

requireText('components/ui/ConstitutionUI.js', [
  "from './WorkSheetKernel'",
  '<WorkSheet',
  '<WorkSheetHeader',
  '<WorkSection',
  '<WorkLedger',
  '<WorkDock',
]);

requireText('components/ui/RawGrid.js', [
  'data-work-ledger="true"',
  'data-work-dock="true"',
  'data-work-dock-actions="true"',
]);

requireText('lib/system-constitution.js', [
  'operational-notebook-v1',
  "model: 'one-program-one-notebook'",
  "geometryPolicy: 'single-kernel-for-all-portals-and-tools'",
  'forbidPageLocalGeometryWhenKernelExists: true',
]);

if (failures.length) {
  console.error('\nSingle visual captain audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Single visual captain audit passed.');
