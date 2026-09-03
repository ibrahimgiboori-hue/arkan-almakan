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

// 3) وظائف المشروع الداخلية تبقى مرتبة ومعروفة حتى لو تغير طريق الوصول إليها.
const dailyIndex = constitution.indexOf("key: 'daily'");
const entryIndex = constitution.indexOf("key: 'entry'");
const readIndex = constitution.indexOf("key: 'read'");
if (!(dailyIndex >= 0 && entryIndex > dailyIndex && readIndex > entryIndex)) {
  failures.push('PROJECT_NAV_GROUPS: الترتيب الدستوري الداخلي يجب أن يبقى العمل اليومي ← التسجيل والإدارة ← المتابعة.');
}
if (constitution.includes("key: 'quote-register'")) {
  failures.push('PROJECT_NAV_GROUPS: سجل عروض الأسعار العام مكرر داخل المشروع؛ يجب أن يبقى له مدخل عام واحد فقط.');
}

// 4) شاشة عمالة المشروع هي سطح الإنشاء الوحيد.
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

// 5) الجسد الجديد هو القشرة الوحيدة، ومحرك الفرع الحي واحد لكل البوابات.
const dashboardLayout = read('app/dashboard/layout.js');
const dashboardHome = read('app/dashboard/page.js');
const contextualNavigation = 'components/ui/ContextualDashboardNavigation.js';
const contextualShellCss = 'app/dashboard/app-shell-v2.css';
const livingCss = 'app/dashboard/living-navigation.css';
const shellConstitution = 'lib/navigation-shell-constitution.js';
const portalLivingModel = 'lib/portal-living-navigation.js';
const approachStage = 'app/dashboard/workspace/[portal]/page.js';
if (!dashboardLayout.includes('ContextualDashboardNavigation')) {
  failures.push('app/dashboard/layout.js: الجسد الجديد غير مركب في ContextualDashboardNavigation.');
}
if (!dashboardLayout.includes('data-navigation-shell="contextual-slide-v2"')) {
  failures.push('app/dashboard/layout.js: وسم الجسد الجديد contextual-slide-v2 مفقود.');
}
if (!dashboardLayout.includes("'./app-shell-v2.css'") || !dashboardLayout.includes("'./living-navigation.css'")) {
  failures.push('app/dashboard/layout.js: أنماط الجسد والملاحة الحية غير مربوطة بالكامل.');
}
if (!exists(contextualNavigation) || !exists(contextualShellCss) || !exists(livingCss) || !exists(shellConstitution) || !exists(portalLivingModel)) {
  failures.push('الجسد الجديد: ملفات الملاحة الحية أو نموذج تغطية البوابات أو الأنماط غير موجودة.');
}
if (dashboardLayout.includes('RawDashboardNavigation')) {
  failures.push('app/dashboard/layout.js: عاد شريط RawDashboardNavigation القديم إلى الجسد الجديد.');
}
if (/WorkPlatformPage|portalSwitcher|PORTAL_COPY|allowedPortals/.test(dashboardHome)) {
  failures.push('app/dashboard/page.js: الرئيسية تعيد إنشاء منصة موازية؛ البوابات ملك القشرة الموحدة فقط.');
}
if (exists(contextualNavigation)) {
  const nav = read(contextualNavigation);
  for (const required of [
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
    'appNavGrandchildPrimary',
    'onClick={openNavigation}',
    'appNavDismiss',
  ]) {
    if (!nav.includes(required)) failures.push(`الجسد الجديد: ${required} يجب أن يبقى جزءًا من الملاحة الموحدة.`);
  }
  if (nav.includes('PORTAL_MANAGEMENT_SECTIONS')) failures.push('الجسد الجديد: عاد لاستخدام تجميعات كتالوج البوابات القديم.');
  if (nav.includes("from '@/lib/supabase'")) failures.push('الملاحة لا يجوز أن تتحول إلى مصدر بيانات موازٍ؛ هوية الابن والحفيد تأتي من العضو أو المسرح.');
  if (nav.includes('GlobalSearch')) failures.push('الجسد الجديد: البحث العام عاد إلى داخل قائمة التنقل.');
  if (nav.includes('OPEN_INTENT_MS') || nav.includes('openFromIntent') || nav.includes('onPointerEnter={openFromIntent}')) {
    failures.push('الجسد الجديد: القائمة عادت للفتح التلقائي بالمرور بدل الاستدعاء المقصود بالنقر.');
  }
  if (/<button[^>]+className="appNavHonorary"/.test(nav)) {
    failures.push('مرآة السياق: العنصر الشرفي غير القابل للضغط عاد كاختصار عمل داخل القائمة.');
  }
  if (/area\.key\s*===\s*['\"]projects['\"][\s\S]{0,260}?appNavChildren/.test(nav)) {
    failures.push('القائمة الموحدة: ما زال فرع المشاريع يُرسم بسلوك JSX خاص بدل محرك عقد الدخول الواحد.');
  }
}

if (exists(shellConstitution)) {
  const shell = read(shellConstitution);
  for (const required of [
    'SHELL_PORTAL_GROUPS',
    "workforce: Object.freeze([",
    "finance: Object.freeze([",
    "documents: Object.freeze([",
    "admin: Object.freeze([",
    "portalSectionHref('workforce','planning')",
    "'/dashboard/operating-budget'",
  ]) {
    if (!shell.includes(required)) failures.push(`تغطية البوابات: مفقود ${required}.`);
  }
}

if (exists(portalLivingModel)) {
  const model = read(portalLivingModel);
  for (const required of [
    'LIVING_PORTALS',
    'accessiblePortalTools',
    'livingPortalGroups',
    'portalEntryNodes',
    'activePortalGroup',
    'activePortalTool',
    'portalCoverageReport',
    'generatedCoverageFallback:true',
  ]) {
    if (!model.includes(required)) failures.push(`نموذج الملاحة العام: مفقود ${required}.`);
  }
}

if (!exists(approachStage)) {
  failures.push('مسرح الاقتراب: app/dashboard/workspace/[portal]/page.js مفقود.');
} else {
  const stage = read(approachStage);
  for (const required of [
    'livingPortalGroups',
    'requestWorkSessionNavigation',
    'data-navigation-stage="portal-group"',
    'data-stage-leadership="stage"',
    'data-living-branch-scope="all-portals"',
    'group.items.map',
  ]) {
    if (!stage.includes(required)) failures.push(`مسرح الاقتراب العام: مفقود ${required}.`);
  }
  if (/WorkPlatformPage|WORK_PLATFORM_|portalSwitcher|PORTAL_COPY|allowedPortals/.test(stage)) {
    failures.push('مسرح الاقتراب: عاد منطق منصة الأعمال القديمة داخل المساحة الكبيرة.');
  }
}

if (exists(livingCss)) {
  const css = read(livingCss);
  if (!css.includes(".rawDashboardShell:has(.appContextNav[data-open='true']) .appBodyStage")) {
    failures.push('سطح المكتب: القائمة المفتوحة يجب أن تحجز مساحتها بدل تغطية المسرح.');
  }
  if (!css.includes('.appNavMirrorPortal') || !css.includes('.appNavMirrorSubject')) {
    failures.push('مرآة السياق: أنماط تبادل القيادة بين القائمة والمسرح مفقودة.');
  }
  if (!css.includes('.appNavGrandchild') || !css.includes('.appNavGrandchildGroupTitle')) {
    failures.push('قائمة الحفيد: أنماط العمل أولاً والسجل عند الطلب مفقودة.');
  }
}

// قائمة الحفيد لا تسرق بيانات الأداة من القشرة؛ العضو نفسه ينشر رفه التاريخي.
const livingNavigation = read('lib/living-navigation.js');
if (!livingNavigation.includes('GRANDCHILD_NAVIGATION_EVENT') || !livingNavigation.includes('workFirstHistoryOnDemand:true')) {
  failures.push('قائمة الحفيد: عقد العمل أولاً/السجل عند الطلب مفقود من DNA.');
}
if (exists('app/dashboard/quotes/layout.js')) {
  const quoteBoundary = read('app/dashboard/quotes/layout.js');
  for (const required of ['publishGrandchildNavigationContext', "classification:'client'", "historyLabel:'السجل حسب العميل'"]) {
    if (!quoteBoundary.includes(required)) failures.push(`عروض الأسعار: قائمة الحفيد مفقود منها ${required}.`);
  }
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

console.log('Navigation cleanliness audit passed: one entry-node engine spans every portal; grandchild lists serve the current tool with work first and history on demand, while legacy business journeys remain intact.');
