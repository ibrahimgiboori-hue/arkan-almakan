import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

function requireText(file, needles) {
  if (!exists(file)) {
    failures.push(`${file}: الملف مفقود.`);
    return '';
  }
  const text = read(file);
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${file}: مفقود الثابت البنيوي ${needle}`);
  }
  return text;
}

const layout = requireText('app/dashboard/layout.js', [
  "import './raw-tokens.css'",
  "import './arkan-skin-v1.css'",
  "import './arkan-dashboard-geometry-v2.css'",
  'data-work-kernel="operational-notebook-v1"',
  'data-navigation-shell="contextual-slide-v2"',
  'data-work-sheet-mount="true"',
  'data-geometry-owner="arkan-dashboard-v2"',
  'className="workSheetMount"',
  'ContextualDashboardNavigation',
]);

const geometry = requireText('app/dashboard/arkan-dashboard-geometry-v2.css', [
  'ARKAN DASHBOARD GEOMETRY V2',
  '.rawDashboardContent > .workSheetMount',
  '.appNavHotZone',
  '.appContextNav',
  ".appContextNav[data-open='true']",
  '.appNavTopLine',
  '.appNavBottomActions',
  '.appNavAccountMenu',
  '.appNavAccountMenuBody',
  '.appNavGrandchildTabs',
  '.appNavGrandchildGroupTitle',
  '.appNavMirrorPortal',
  "[data-work-form-grid='true'] [data-work-field='true']",
  "[data-field-mode='generated']",
  "[data-field-mode='linked']",
  "[data-field-mode='calculated']",
  'scrollbar-gutter: stable both-edges',
  "@media (prefers-reduced-motion: reduce)",
]);

const forbiddenGeometry = [
  'app/dashboard/raw-phase.css',
  'app/dashboard/transaction-underwear.css',
  'app/dashboard/app-shell-v2.css',
  'app/dashboard/app-body-v3.css',
  'app/dashboard/living-navigation.css',
  'app/dashboard/body-resuscitation.css',
  'app/dashboard/legacy-structure-bridge-v1.css',
  'app/dashboard/navigation-comfort-v1.css',
  'app/dashboard/arkan-field-geometry-v1.css',
  'app/dashboard/arkan-workspace-geometry-v1.css',
  'app/dashboard/work-sheet-kernel.css',
];
for (const file of forbiddenGeometry) {
  if (exists(file)) failures.push(`${file}: هندسة قديمة/منافسة يجب ألا تعود بعد توحيد القبطان.`);
  if (layout.includes(path.basename(file))) failures.push(`app/dashboard/layout.js: عاد تحميل ${path.basename(file)}.`);
}
if (exists('components/ui/RawDashboardNavigation.module.css')) failures.push('RawDashboardNavigation.module.css: هندسة الملاحة القديمة يجب ألا تعود.');
if (exists('components/ui/RawDashboardNavigation.js')) failures.push('RawDashboardNavigation.js: مكوّن الملاحة القديم يجب ألا يعود.');

requireText('lib/navigation-shell-constitution.js', [
  'SHELL_PORTAL_GROUPS',
  "projects: Object.freeze([",
  "workforce: Object.freeze([",
  "finance: Object.freeze([",
  "documents: Object.freeze([",
  "admin: Object.freeze([",
]);

requireText('lib/portal-living-navigation.js', [
  'LIVING_PORTALS',
  'accessiblePortalTools',
  'livingPortalGroups',
  'portalEntryNodes',
  'activePortalGroup',
  'activePortalTool',
  'portalCoverageReport',
]);

const nav = requireText('components/ui/ContextualDashboardNavigation.js', [
  'filterAreasForAccess',
  'projectNavRequirement',
  'portalEntryNodes',
  'entryNodesByArea',
  'entryNodes.map',
  'portalApproachHref',
  'requestWorkSessionNavigation',
  'data-living-branch="single"',
  'data-living-branch-scope="all-portals"',
  'data-navigation-role={navigationRole}',
  'GRANDCHILD_NAVIGATION_EVENT',
  'renderGrandchild',
  'activeGrandchildTab',
  'appNavGrandchildTabs',
  'appNavGrandchildTab',
  'appNavGrandchildGroupTitle',
  'onClick={()=>go(item.href)}',
  'setOpen(true)',
  'appNavDismiss',
  'appNavAccountMenu',
  'تسجيل الخروج',
  'onClick={openNavigation}',
  'className="appContextNav"',
  'FAST_DESKTOP_BACK_WINDOW_MS = 5000',
  'returnToEmployeeDesktop',
]);

if (nav.includes('router.back(')) failures.push('الملاحة السياقية تستخدم تاريخ المتصفح بدل الرجوع الهرمي المحدد.');
if (nav.includes('PORTAL_MANAGEMENT_SECTIONS')) failures.push('الملاحة الجديدة عادت للاعتماد على تجميعات كتالوج البوابات القديم.');
if (nav.includes('GlobalSearch')) failures.push('البحث العام عاد داخل قائمة التنقل رغم فصله عنها.');
if (nav.includes('onPointerEnter={openFromIntent}')) failures.push('الملاحة عادت للفتح التلقائي بالمرور بدل الاستدعاء المقصود بالنقر.');
if (nav.includes("from '@/lib/supabase'")) failures.push('الملاحة بدأت تستعلم عن بيانات الكيانات بدل استقبال انعكاس العضو أو المسرح.');
if (/<button[^>]+className="appNavHonorary"/.test(nav)) failures.push('مرآة السياق تحولت إلى اختصار عمل قابل للضغط.');
if (/area\.key\s*===\s*['\"]projects['\"][\s\S]{0,260}?appNavChildren/.test(nav)) failures.push('الملاحة عادت لرسم فرع المشاريع بسلوك JSX خاص بدل محرك عقد الدخول الواحد.');
if (nav.includes('NAVIGATION_YIELD_EVENT') || /function\s+yieldToWork\s*\(/.test(nav)) failures.push('الملاحة: عاد أمر الإخفاء التلقائي عند عبور عتبة العمل.');
if (!/function\s+go\s*\([^)]*\)\s*\{[\s\S]{0,500}?setOpen\(true\);/.test(nav)) failures.push('الملاحة: اختيار العمل أو الحفيد يجب أن يبقي القائمة موجودة حتى يخفيها المستخدم.');
if (!/<details[^>]+className="appNavAccountMenu"[\s\S]{0,300}?تسجيل الخروج/.test(nav)) failures.push('الملاحة: تسجيل الخروج يجب أن يبقى خلف خطوة الحساب الآمنة.');

if (!geometry.includes(".rawDashboardShell:has(.appContextNav[data-open='true'][data-pinned='true']) .appBodyStage") && !geometry.includes(".rawDashboardShell:has(.appContextNav[data-open='true']) .appBodyStage")) failures.push('سطح المكتب: القبطان الموحد يجب أن يحجز مساحة للقائمة المفتوحة.');

requireText('components/ui/ConstitutionUI.js', [
  "from './WorkSheetKernel'",
  '<WorkSheet',
  '<WorkSheetHeader',
  '<WorkSection',
  '<WorkLedger',
  '<WorkDock',
  'data-work-underwear="transaction-shell-v1"',
  'export function WorkFormGrid',
  'export function WorkField',
  'export function DocumentBody',
  'export function DocumentSection',
]);

requireText('components/ui/RawGrid.js', [
  'data-work-ledger="true"',
  'data-work-dock="true"',
  'data-work-dock-actions="true"',
  'data-work-underwear="transaction-grid-v1"',
  "case 'generated'",
  "case 'linked'",
  "case 'calculated'",
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

console.log('Single visual captain audit passed: arkan-dashboard-geometry-v2 is the only dashboard geometry captain, old geometry cannot return, navigation stays until manual dismissal, and protected account actions stay out of the work path.');