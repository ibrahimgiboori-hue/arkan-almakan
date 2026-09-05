import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

function requireText(file, needles) {
  if (!exists(file)) {
    failures.push(`${file}: الملف المطلوب غير موجود.`);
    return;
  }
  const text = read(file);
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${file}: مفقود الثابت البنيوي ${needle}`);
  }
}

requireText('app/dashboard/layout.js', [
  "import './raw-tokens.css'",
  "import './legacy-ui-compat.css'",
  "import './ui-skin-foundation.css'",
  "import './app-shell-v2.css'",
  'data-work-kernel="operational-notebook-v1"',
  'data-navigation-shell="contextual-slide-v2"',
  'data-work-sheet-mount="true"',
  'className="workSheetMount"',
  'ContextualDashboardNavigation',
]);

const layout = read('app/dashboard/layout.js');
if (layout.includes('work-sheet-kernel.css')) {
  failures.push('app/dashboard/layout.js: أعاد ملف هندسة منافسًا إلى الغلاف العام.');
}
if (layout.includes('raw-phase.css')) {
  failures.push('app/dashboard/layout.js: أعاد raw-phase بعد فصل الجلد الدلالي عن حجر التوافق القديم.');
}

if (exists('app/dashboard/work-sheet-kernel.css')) {
  failures.push('app/dashboard/work-sheet-kernel.css: ملف هندسة قديم يجب ألا يعود بعد توحيد القبطان.');
}
if (exists('app/dashboard/raw-phase.css')) {
  failures.push('app/dashboard/raw-phase.css: الدور القديم انتهى؛ لا يجوز إعادة إنشاء المرحلة الخام.');
}
if (exists('components/ui/RawDashboardNavigation.module.css')) {
  failures.push('RawDashboardNavigation.module.css: هندسة الملاحة القديمة يجب ألا تعود.');
}

requireText('app/dashboard/ui-skin-foundation.css', [
  'UI SKIN FOUNDATION — semantic native structure',
  "[data-ui-slot='sheet']",
  "[data-ui-slot='page-header']",
  "[data-ui-slot='section']",
  "[data-ui-slot='ledger']",
  "[data-ui-slot='dock']",
  "[data-ui-role='table']",
  'scrollbar-gutter: stable both-edges',
]);

const semanticFoundation = read('app/dashboard/ui-skin-foundation.css');
if (/\.page-head|\.section:not\(|\.btn:not\(|\.shell\s*>\s*\.side/.test(semanticFoundation)) {
  failures.push('ui-skin-foundation.css: القبطان الدلالي عاد لامتلاك مفردات CSS القديمة.');
}

requireText('app/dashboard/legacy-ui-compat.css', [
  'LEGACY UI COMPATIBILITY — quarantine only',
  '.shell > .side',
  '.page:not([data-ui-slot])',
  '.section:not([data-ui-slot])',
  "table:not([data-ui-role='table'])",
]);
const legacy = read('app/dashboard/legacy-ui-compat.css');
if (/\[data-work-(?:header|section|ledger|dock)=['"]true['"]\]/.test(legacy)) {
  failures.push('legacy-ui-compat.css: حجر التوافق عاد لامتلاك عظام WorkSheet الدلالية.');
}

requireText('app/dashboard/app-shell-v2.css', [
  '.appNavHotZone',
  '.appContextNav',
  ".appContextNav[data-open='true']",
  '.appNavTopLine',
  '.appNavBottomActions',
  "@media (prefers-reduced-motion: reduce)",
]);

// القبطان المرئي واحد، وكتالوج مجموعات البوابات واحد كذلك. المشاريع تحتفظ
// بتجميعها المتخصص، أما البوابات العامة فتُشتق من PORTAL_MANAGEMENT_SECTIONS
// بدل نسخ نفس القوائم يدويًا في دستور الملاحة.
requireText('lib/navigation-shell-constitution.js', [
  'SHELL_PORTAL_GROUPS',
  'PORTAL_MANAGEMENT_SECTIONS',
  'groupsFromManagement',
  "projects: Object.freeze([",
  'workforce: workforceGroups',
  'finance: financeGroups',
  "documents: groupsFromManagement('documents')",
  "admin: groupsFromManagement('admin')",
]);

requireText('components/ui/ContextualDashboardNavigation.js', [
  'filterAreasForAccess',
  'projectNavRequirement',
  'SHELL_PORTAL_GROUPS',
  'onClick={openNavigation}',
  'className="appContextNav"',
]);

if (exists('components/ui/RawDashboardNavigation.js')) {
  failures.push('RawDashboardNavigation.js: مكوّن الملاحة القديم يجب حذفه بعد انتقال الجسد إلى contextual-slide-v2.');
}

const nav = read('components/ui/ContextualDashboardNavigation.js');
if (nav.includes('router.back(')) failures.push('الملاحة السياقية تستخدم تاريخ المتصفح بدل الرجوع الهرمي المحدد.');
if (!nav.includes('PIN_STORAGE_KEY')) failures.push('الملاحة السياقية فقدت خيار إبقاء القائمة مفتوحة.');
if (nav.includes('PORTAL_MANAGEMENT_SECTIONS')) failures.push('الملاحة التنفيذية لا تقرأ كتالوج الإدارة مباشرة؛ يجب أن تمر عبر دستور SHELL_PORTAL_GROUPS.');
if (nav.includes('GlobalSearch')) failures.push('البحث العام عاد داخل قائمة التنقل رغم فصله عنها.');
if (nav.includes('onPointerEnter={openFromIntent}')) failures.push('الملاحة عادت للفتح التلقائي بالمرور بدل الاستدعاء المقصود بالنقر.');

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

console.log('Single visual captain audit passed: WorkSheet geometry is semantic, legacy CSS is quarantined, and navigation remains a separate governed shell.');
