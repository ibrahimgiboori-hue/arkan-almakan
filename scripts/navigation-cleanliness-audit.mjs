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

// 3) بوابة المشاريع مرتبة حسب العمل: اليوم، ثم التسجيل والإدارة، ثم المتابعة.
const dailyIndex = constitution.indexOf("key: 'daily'");
const entryIndex = constitution.indexOf("key: 'entry'");
const readIndex = constitution.indexOf("key: 'read'");
if (!(dailyIndex >= 0 && entryIndex > dailyIndex && readIndex > entryIndex)) {
  failures.push('PROJECT_NAV_GROUPS: الترتيب الدستوري يجب أن يبقى العمل اليومي ← التسجيل والإدارة ← المتابعة.');
}
if (constitution.includes("key: 'quote-register'")) {
  failures.push('PROJECT_NAV_GROUPS: سجل عروض الأسعار العام مكرر داخل المشروع؛ يجب أن يبقى له مدخل عام واحد فقط.');
}

// 4) العامل يُنشأ في سجل المقاول فقط؛ شاشة المشروع تسند عاملًا موجودًا ولا تنشئ ملف عامل جديدًا.
const projectLabor = read('app/dashboard/projects/[id]/operations/labor/page.js');
if (projectLabor.includes('fn_quick_add_workers') || projectLabor.includes('QUICK ADD')) {
  failures.push('عمالة المشروع: عاد مسار إنشاء العمالة السريع داخل المشروع.');
}
if (!projectLabor.includes('fn_assign_existing_laborer')) {
  failures.push('عمالة المشروع: يجب أن تستخدم الإسناد الصريح للعامل الموجود.');
}
if (/from\(['"]laborers['"]\)\.insert|from\(['"]laborers['"]\)[\s\S]{0,160}\.insert/.test(projectLabor)) {
  failures.push('عمالة المشروع: لا يجوز إنشاء سجل laborers من داخل المشروع.');
}

// 5) لا توجد «منصة أعمال» موازية. الشريط الحالي هو القشرة الوحيدة، والتجميع داخله فقط.
const dashboardLayout = read('app/dashboard/layout.js');
const dashboardHome = read('app/dashboard/page.js');
if (!dashboardLayout.includes('RawDashboardNavigation')) {
  failures.push('app/dashboard/layout.js: الملاحة العليا غير مركبة في RawDashboardNavigation.');
}
if (/WorkPlatformPage|portalSwitcher|PORTAL_COPY|allowedPortals/.test(dashboardHome)) {
  failures.push('app/dashboard/page.js: الرئيسية تعيد إنشاء منصة موازية؛ البوابات ملك الشريط العلوي فقط.');
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

// 6) مصدر المعاملة يعرض حالة الاعتماد فقط؛ القرار له مركز واحد.
const guidance = read('components/approval/ApprovalGuidanceRow.js');
for (const forbidden of ['طلب إجراء', 'استفسار عن المعاملة', 'فتح أعمالي']) {
  if (guidance.includes(forbidden)) failures.push(`ApprovalGuidanceRow: أعاد إجراء «${forbidden}» إلى شاشة المصدر.`);
}

// 7) المسار القديم للاعتمادات يبقى تحويل توافق فقط إلى المسار الوحيد.
const legacyApprovals = read('app/dashboard/my-work/approvals/page.js');
if (!legacyApprovals.includes("redirect('/dashboard/approvals')")) {
  failures.push('المسار القديم my-work/approvals لا يتحول إلى /dashboard/approvals.');
}

if (failures.length) {
  console.error('\nNavigation cleanliness audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Navigation cleanliness audit passed.');
