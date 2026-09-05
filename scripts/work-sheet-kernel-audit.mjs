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
  "import './prehydration-legacy-containment.css'",
  "import './ui-skin-foundation.css'",
  "import './ui-component-skin.css'",
  "import './ui-semantic-adapter-skin.css'",
  "import './ui-shell-skin.css'",
  'data-work-kernel="operational-notebook-v1"',
  'data-work-sheet-mount="true"',
  'className="workSheetMount"',
  'ContextualDashboardNavigation',
  'LegacySemanticBridgeRuntime',
]);

const layout = read('app/dashboard/layout.js');
for (const retired of ['work-sheet-kernel.css','raw-phase.css','app-shell-v2.css','legacy-ui-compat.css']) {
  if (layout.includes(retired)) failures.push(`app/dashboard/layout.js: أعاد طبقة متقاعدة ${retired}.`);
}

for (const retiredFile of [
  'app/dashboard/work-sheet-kernel.css',
  'app/dashboard/raw-phase.css',
  'app/dashboard/app-shell-v2.css',
  'app/dashboard/legacy-ui-compat.css',
  'components/ui/constitution-ui.module.css',
  'components/ui/RawDashboardNavigation.module.css',
]) {
  if (exists(retiredFile)) failures.push(`${retiredFile}: طبقة مرئية قديمة يجب ألا تعود.`);
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

requireText('app/dashboard/ui-component-skin.css', [
  'NATIVE COMPONENT SKIN',
  "[data-ui-slot='record-summary']",
  "[data-ui-part='secondary-trigger']",
]);
requireText('app/dashboard/ui-semantic-adapter-skin.css', [
  'SEMANTIC ADAPTER SKIN',
  "[data-ui-role='legacy-card']",
  "[data-ui-role='legacy-action']",
  "[data-ui-role='legacy-shell']",
]);
requireText('app/dashboard/prehydration-legacy-containment.css', [
  'PRE-HYDRATION LEGACY CONTAINMENT',
  'Structural safety only',
  '.shell > .side',
]);
const containment = read('app/dashboard/prehydration-legacy-containment.css');
if (/color\s*:|background\s*:|font-|border(?:-|\s*:)|box-shadow|padding\s*:/.test(containment)) {
  failures.push('prehydration-legacy-containment.css: احتواء ما قبل hydration صار جلدًا مرئيًا منافسًا.');
}

requireText('app/dashboard/ui-shell-skin.css', [
  'NATIVE SHELL SKIN',
  '.appNavRail',
  '.appRailItem',
  '.appContextNav',
  ".appContextNav[data-open='false']",
  '.appNavContextHeader',
  '.appNavContextItem',
  '.appNavMobileTrigger',
  ".appContextNav[data-mobile-open='true']",
  "@media (prefers-reduced-motion: reduce)",
]);
const shellSkin = read('app/dashboard/ui-shell-skin.css');
if (shellSkin.includes('.appNavHotZone')) failures.push('ui-shell-skin.css: عاد Hot Zone المخفي بدل شريط البوابات المرئي.');

requireText('components/ui/LegacySemanticBridgeRuntime.js', [
  "uiSlot('page')",
  "uiSlot('section')",
  "uiSlot('action')",
  "'data-ui-role':'legacy-shell'",
  'MutationObserver',
]);

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
  'CONTEXT_COLLAPSED_STORAGE_KEY',
  'choosePortal',
  'className="appNavRail"',
  'className="appContextNav"',
  'className="appNavMobileTrigger"',
]);

if (exists('components/ui/RawDashboardNavigation.js')) {
  failures.push('RawDashboardNavigation.js: مكوّن الملاحة القديم يجب حذفه بعد انتقال الجسد إلى الملاحة الموحدة.');
}

const nav = read('components/ui/ContextualDashboardNavigation.js');
if (nav.includes('router.back(')) failures.push('الملاحة تستخدم تاريخ المتصفح بدل خريطة النظام.');
if (!nav.includes('CONTEXT_COLLAPSED_STORAGE_KEY')) failures.push('الملاحة فقدت تذكر اختيار المستخدم لطي لوحة السياق.');
if (nav.includes('PORTAL_MANAGEMENT_SECTIONS')) failures.push('الملاحة التنفيذية لا تقرأ كتالوج الإدارة مباشرة؛ يجب أن تمر عبر دستور SHELL_PORTAL_GROUPS.');
if (nav.includes('GlobalSearch')) failures.push('البحث العام عاد داخل قائمة التنقل رغم فصله عنها.');
if (/onPointerEnter|openFromIntent|appNavHotZone|single-open-accordion/.test(nav)) failures.push('الملاحة أعادت سلوكًا مخفيًا أو متداخلًا بدل الشريط الثابت واللوحة الواحدة.');

requireText('components/ui/ConstitutionUI.js', [
  "from './WorkSheetKernel'",
  '<WorkSheet',
  '<WorkSheetHeader',
  '<WorkSection',
  '<WorkLedger',
  '<WorkDock',
  '<progress max="100" value={safeProgress}',
]);
const constitutionUi = read('components/ui/ConstitutionUI.js');
if (constitutionUi.includes('module.css') || /styles\./.test(constitutionUi) || /style=\{\{/.test(constitutionUi)) {
  failures.push('ConstitutionUI: القبطان البنيوي ما زال يحمل جلدًا محليًا بدل الجلد المركزي.');
}

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

console.log('Single visual captain audit passed: one semantic body and one navigation captain remain; desktop has a persistent portal rail plus one context panel, mobile uses the same map as a drawer, and retired visual captains cannot return.');
