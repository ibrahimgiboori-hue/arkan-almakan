import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

function walk(relative, files = []) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return files;
  for (const entry of fs.readdirSync(absolute, { withFileTypes:true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child, files);
    else if (/\.(?:js|jsx|mjs)$/.test(entry.name)) files.push(child);
  }
  return files;
}

// 1) الرجوع التشغيلي لا يعتمد على تاريخ المتصفح.
for (const file of [...walk('app/dashboard'), ...walk('components')]) {
  const text = read(file);
  if (/\brouter\.back\s*\(/.test(text)) failures.push(`${file}: يستخدم router.back() بدل الرجوع الهرمي المحدد.`);
}

// 2) الدستور المرئي لا يحتوي أدوات إنشاء ولا رابطًا ظاهرًا مكررًا.
const constitution = read('lib/app-constitution.js');
const areasMatch = constitution.match(/export const AREAS = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
if (!areasMatch) {
  failures.push('lib/app-constitution.js: تعذر قراءة AREAS.');
} else {
  const seen = new Map();
  const lines = areasMatch[1].split('\n');
  for (const line of lines) {
    const href = line.match(/href:\s*'([^']+)'/)?.[1];
    if (!href || /hidden:\s*true|legacy:\s*true/.test(line)) continue;
    if (/\/(?:new|create)\/?$/.test(href)) failures.push(`AREAS: مسار الإنشاء ${href} ظاهر كأداة مستقلة.`);
    if (seen.has(href)) failures.push(`AREAS: الرابط ${href} مكرر في الملاحة الظاهرة.`);
    else seen.set(href, true);
  }
}

// 3) داخل المشروع تظهر العوالم كلها في قائمة واحدة مسطحة وواضحة، بلا قوائم متداخلة أو Accordion إجباري.
const projectNavMatch = constitution.match(/export const PROJECT_NAV_GROUPS = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
const projectNavText = projectNavMatch?.[1] || '';
if (!projectNavText) failures.push('PROJECT_NAV_GROUPS: تعذر قراءة دستور ملاحة المشروع.');
const projectGroupKeys = ['status','operations','contract','finance','documents'];
const projectGroupIndexes = projectGroupKeys.map((key) => projectNavText.indexOf(`key: '${key}'`));
if (projectGroupIndexes.some((index) => index < 0) || projectGroupIndexes.some((index, i) => i > 0 && index <= projectGroupIndexes[i - 1])) {
  failures.push('PROJECT_NAV_GROUPS: الترتيب الدستوري يجب أن يبقى موقف المشروع ← التشغيل ← العقد والنطاق ← المال والمستخلصات ← المستندات والمتابعة.');
}
for (const label of ['موقف المشروع','التشغيل','العقد والنطاق','المال والمستخلصات','المستندات والمتابعة']) {
  if (!projectNavText.includes(`label: '${label}'`)) failures.push(`PROJECT_NAV_GROUPS: مفقود عالم المشروع «${label}».`);
}
if (projectNavText.includes("key: 'quote-register'")) {
  failures.push('PROJECT_NAV_GROUPS: سجل عروض الأسعار العام مكرر داخل المشروع؛ يجب أن يبقى له مدخل عام واحد فقط.');
}
const contextualNav = read('components/ui/ContextualDashboardNavigation.js');
for (const required of [
  'data-project-navigation="all-groups-visible"',
  'projectGroups',
  'activeProjectKey',
  'appNavRail',
  'appContextNav',
  'appNavMobileTrigger',
  'CONTEXT_COLLAPSED_STORAGE_KEY',
  'خارج المشروع',
  'كل المشاريع',
  'كل البوابات',
]) {
  if (!contextualNav.includes(required)) failures.push(`الملاحة الموحدة: مفقود ${required}`);
}
for (const forbidden of ['single-open-accordion','expandedProjectGroupKey','toggleProjectGroup','appNavHotZone','onPointerEnter={openFromIntent}']) {
  if (contextualNav.includes(forbidden)) failures.push(`الملاحة الموحدة: عاد السلوك القديم ${forbidden}.`);
}

// 4) شاشة عمالة المشروع هي سطح الإنشاء الوحيد: المشروع + المقاول + تاريخ الإسناد سياق واحد.
const projectLabor = read('app/dashboard/projects/[id]/operations/labor/page.js');
if (!projectLabor.includes('fn_quick_add_workers') || !projectLabor.includes('data-canonical-labor-create-form')) {
  failures.push('عمالة المشروع: يجب أن تبقى شاشة المشروع هي مسار إنشاء العمالة وإسنادها الموحد.');
}
if (!projectLabor.includes('fn_assign_existing_laborer')) {
  failures.push('عمالة المشروع: يجب أن تستخدم الإسناد الصريح للعامل الموجود.');
}
if (/from\(['"]laborers['"]\)\.insert|from\(['"]laborers['"]\)[\s\S]{0,160}\.insert/.test(projectLabor)) {
  failures.push('عمالة المشروع: لا يجوز تجاوز محرك العمالة الموحد بإنشاء laborers مباشرة من الواجهة.');
}
const contractorLabor = read('app/dashboard/contractors/[id]/labor/page.js');
if (!contractorLabor.includes('data-retired-labor-entry="contractor-level"')) {
  failures.push('عمالة المقاول: المسار القديم يجب أن يبقى بوابة اختيار مشروع فقط بلا إنشاء موازٍ.');
}
if (/\.insert\s*\(|fn_quick_add_workers|buildLaborerSavePayload/.test(contractorLabor)) {
  failures.push('عمالة المقاول: عاد منطق إنشاء عمالة خارج شاشة المشروع.');
}

// 5) الملاحة الأساسية ظاهرة على الكمبيوتر: شريط بوابات ثابت + لوحة سياق واحدة، وعلى الهاتف Drawer من نفس المصدر.
const dashboardLayout = read('app/dashboard/layout.js');
const dashboardHome = read('app/dashboard/page.js');
const contextualNavigation = 'components/ui/ContextualDashboardNavigation.js';
const contextualShellCss = 'app/dashboard/ui-shell-skin.css';
const shellConstitution = 'lib/navigation-shell-constitution.js';
if (!dashboardLayout.includes('ContextualDashboardNavigation')) {
  failures.push('app/dashboard/layout.js: الملاحة الموحدة غير مركبة.');
}
if (!dashboardLayout.includes("'./ui-shell-skin.css'")) {
  failures.push('app/dashboard/layout.js: جلد الغلاف القابل للاستبدال ui-shell-skin.css غير مربوط.');
}
if (!exists(contextualNavigation) || !exists(contextualShellCss) || !exists(shellConstitution)) {
  failures.push('الملاحة: ملفات الملاحة أو دستور تجميعاتها أو جلد الغلاف غير موجودة.');
}
if (exists('app/dashboard/app-shell-v2.css')) {
  failures.push('الملاحة: app-shell-v2.css عاد بعد ترقيته إلى ui-shell-skin.css.');
}
if (dashboardLayout.includes('RawDashboardNavigation')) {
  failures.push('app/dashboard/layout.js: عاد شريط RawDashboardNavigation القديم.');
}
if (/WorkPlatformPage|portalSwitcher|PORTAL_COPY|allowedPortals/.test(dashboardHome)) {
  failures.push('app/dashboard/page.js: الرئيسية تعيد إنشاء منصة موازية؛ البوابات ملك الملاحة الموحدة فقط.');
}
if (exists(contextualNavigation)) {
  const nav = read(contextualNavigation);
  for (const required of ['filterAreasForAccess', 'projectNavRequirement', 'SHELL_PORTAL_GROUPS', 'choosePortal', 'appNavRail', 'appContextNav']) {
    if (!nav.includes(required)) failures.push(`الملاحة: ${required} يجب أن يبقى جزءًا من القبطان الموحد.`);
  }
  if (nav.includes('PORTAL_MANAGEMENT_SECTIONS')) failures.push('الملاحة: عاد لاستخدام تجميعات كتالوج البوابات القديم مباشرة.');
  if (nav.includes('GlobalSearch')) failures.push('الملاحة: البحث العام عاد إلى داخل القائمة بدل بقائه مسارًا سريعًا مستقلًا.');
  if (nav.includes('OPEN_INTENT_MS') || nav.includes('openFromIntent') || nav.includes('onPointerEnter')) {
    failures.push('الملاحة: عادت للفتح التلقائي بالمرور؛ الفتح يجب أن يكون مقصودًا بالنقر فقط.');
  }
}
if (exists(contextualShellCss)) {
  const shell = read(contextualShellCss);
  for (const required of ['.appNavRail', '.appContextNav', '.appNavMobileTrigger', "[data-mobile-open='true']"]) {
    if (!shell.includes(required)) failures.push(`جلد الملاحة: مفقود ${required}`);
  }
  if (shell.includes('.appNavHotZone')) failures.push('جلد الملاحة: عاد Hot Zone المخفي بعد اعتماد الشريط المرئي الثابت.');
}
if (exists(shellConstitution) && !read(shellConstitution).includes('SHELL_PORTAL_GROUPS')) {
  failures.push('الملاحة: دستور تجميعات الملاحة المستقل غير مكتمل.');
}

// 6) حدود البوابات مستقلة: صلاحية داخلية لا تفتح بوابة أخرى كاملة.
if (/documents:\s*[^\n]*system\.approvals\.view/.test(dashboardLayout)) {
  failures.push('صلاحيات البوابات: system.approvals.view لا يجوز أن تفتح بوابة المستندات.');
}
if (/admin:\s*[^\n]*module_key\s*===\s*['"]system['"]/.test(dashboardLayout)) {
  failures.push('صلاحيات البوابات: module system لا يجوز أن يفتح بوابة الإدارة كاملة.');
}
if (!/documents:\s*fullAdmin\s*\|\|\s*capabilities\.some\(\(item\)\s*=>\s*item\.module_key\s*===\s*['"]documents['"]\)/.test(dashboardLayout)) {
  failures.push('صلاحيات البوابات: بوابة المستندات يجب أن تعتمد على صلاحيات documents الأصلية فقط.');
}

const deadPlatformFiles = [
  'app/dashboard/workspace/page.js',
  'app/dashboard/workspace/[portal]/page.js',
  'app/dashboard/workspace/[portal]/scope/[id]/page.js',
  'app/dashboard/workspace/PortalActionMetrics.js',
  'app/dashboard/workspace/unified-workspace.module.css',
  'app/dashboard/workspace/workspace.module.css',
  'lib/work-platform-constitution.js',
  'lib/program-links.js',
];
for (const file of deadPlatformFiles) {
  if (exists(file)) failures.push(`${file}: بقايا منصة الأعمال القديمة يجب حذفها، لا تعطيلها.`);
}

for (const file of [...walk('app/dashboard'), ...walk('components'), ...walk('lib')]) {
  const text = read(file);
  if (/\bWorkPlatformPage\b|\bWORK_PLATFORM_[A-Z0-9_]+\b/.test(text)) {
    failures.push(`${file}: يعيد منطق منصة الأعمال القديمة خارج الملاحة الموحدة.`);
  }
}

// 7) التوجيه العام لا يصنع سطح عمل ثانياً داخل مصدر المعاملة.
const guidance = read('components/approval/ApprovalGuidanceRow.js');
for (const forbidden of ['طلب إجراء', 'استفسار عن المعاملة', 'فتح أعمالي']) {
  if (guidance.includes(forbidden)) failures.push(`ApprovalGuidanceRow: أعاد إجراء «${forbidden}» إلى شاشة المصدر.`);
}

// 8) المسار القديم للاعتمادات يبقى تحويل توافق فقط إلى المسار الوحيد.
const legacyApprovals = read('app/dashboard/my-work/approvals/page.js');
if (!legacyApprovals.includes("redirect('/dashboard/approvals')")) {
  failures.push('المسار القديم my-work/approvals لا يتحول إلى /dashboard/approvals.');
}

// 9) المعاملة ذات الرحلة الأصلية تملك أفعالها من أ إلى ي؛ الصناديق العامة مجرد مداخل إليها.
const claimsJourney = read('components/ProjClaims.js');
const approvalsInbox = read('app/dashboard/approvals/page.js');
if (!claimsJourney.includes('fn_claim_collect_to_treasury')) {
  failures.push('رحلة المستخلص: التحصيل يجب أن يُنفذ من نفس رحلة المستخلص ويُرحّل للخزينة من الخلف.');
}
if (/p_to\s*:\s*['"]collected['"]/.test(claimsJourney)) {
  failures.push('رحلة المستخلص: عاد مسار تغيير الحالة إلى collected مباشرة بدل محرك الخزينة الواحد.');
}
if (!claimsJourney.includes('fn_approval_decide') || !claimsJourney.includes('record_claim_client_submission')) {
  failures.push('رحلة المستخلص: الاعتماد الداخلي والتقديم للعميل يجب أن يبقيا داخل نفس الرحلة.');
}
if (!approvalsInbox.includes("transaction_type==='progress_claim'") || !approvalsInbox.includes('view=claims&claim=')) {
  failures.push('صندوق الاعتمادات: المستخلص يجب أن يعيد المستخدم إلى رحلته الأصلية بدل إنشاء قرار موازٍ.');
}
if (!/if\(!selectedId\|\|isClaim\)return/.test(approvalsInbox)) {
  failures.push('صندوق الاعتمادات: لا يجوز تنفيذ قرار progress_claim من سطح الاعتمادات العام.');
}

if (failures.length) {
  console.error('\nNavigation cleanliness audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Navigation cleanliness audit passed: desktop uses a visible portal rail plus one flat context panel; mobile uses the same map in a right drawer; no hover-open or hidden edge menu remains.');
