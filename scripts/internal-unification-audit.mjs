import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function requireFile(relative) {
  if (!exists(relative)) failures.push(`${relative}: الملف المطلوب غير موجود.`);
}

function requireText(relative, needles) {
  requireFile(relative);
  if (!exists(relative)) return '';
  const text = read(relative);
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${relative}: مفقود ${needle}`);
  }
  return text;
}

function walk(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  const output = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes:true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...walk(next));
    else output.push(next.replaceAll('\\', '/'));
  }
  return output;
}

for (const file of [
  'lib/architecture/layers.mjs',
  'lib/architecture/legacy-ledger.mjs',
  'lib/ui-skin-keys.js',
  'lib/ui-skin-registry.js',
  'app/ui-active-skin.css',
  'app/dashboard/ui-active-dashboard-skin.css',
  'components/ui/ActiveUISkinRuntime.js',
  'components/ui/ActiveDashboardSkinRuntime.js',
  'lib/core/capabilities.js',
  'lib/core/dashboard-access.js',
  'lib/core/dashboard-session.js',
  'lib/adapters/dashboard-bootstrap-supabase.js',
]) requireFile(file);

requireText('lib/architecture/layers.mjs', [
  "mustNotKnow:Object.freeze(['react','next','css','dom','supabase','screen-skin','print-skin'])",
  'core-survives-a-complete-screen-redesign',
  'legacy-patches-may-be-absorbed-but-may-not-grow',
]);
requireText('lib/architecture/legacy-ledger.mjs', [
  "principle:'absorb-value-delete-patch-never-clone-it'",
  'components/ui/LegacySemanticBridgeRuntime.js',
  'app/dashboard/raw-tokens.css',
  'app/dashboard/prehydration-legacy-containment.css',
]);
requireText('lib/ui-skin-manifest.js', [
  "root:'app/ui-active-skin.css'",
  "dashboard:'app/dashboard/ui-active-dashboard-skin.css'",
  "rootRuntime:'components/ui/ActiveUISkinRuntime.js'",
  "dashboardRuntime:'components/ui/ActiveDashboardSkinRuntime.js'",
]);

const rootEntry = requireText('app/ui-active-skin.css', [
  "@import './ui-skin-tokens.css'",
  "@import './ui-external-skin.css'",
  "@import './ui-signature-skin.css'",
  "@import './ui-signature-tailoring.css'",
  "@import './ui-signature-photo-skin.css'",
  "@import './ui-signature-app-scenes.css'",
  "@import './ui-signature-project-scenes.css'",
  "@import './ui-signature-project-surface-contrast.css'",
]);
const rootOrder = [
  'ui-skin-tokens.css','ui-external-skin.css','ui-signature-skin.css','ui-signature-tailoring.css',
  'ui-signature-photo-skin.css','ui-signature-app-scenes.css','ui-signature-project-scenes.css','ui-signature-project-surface-contrast.css',
];
for (let i = 1; i < rootOrder.length; i += 1) {
  if (rootEntry.indexOf(rootOrder[i - 1]) > rootEntry.indexOf(rootOrder[i])) {
    failures.push(`app/ui-active-skin.css: ترتيب طبقات التوكسيدو تغير بين ${rootOrder[i - 1]} و ${rootOrder[i]}.`);
  }
}

const dashboardEntry = requireText('app/dashboard/ui-active-dashboard-skin.css', [
  "@import './raw-tokens.css'",
  "@import './prehydration-legacy-containment.css'",
  "@import './ui-skin-foundation.css'",
  "@import './ui-component-skin.css'",
  "@import './ui-semantic-adapter-skin.css'",
  "@import './ui-shell-skin.css'",
  "@import './ui-experience-skin.css'",
  "@import './ui-skin-contract.css'",
]);
const dashboardOrder = [
  'raw-tokens.css','prehydration-legacy-containment.css','ui-skin-foundation.css','ui-component-skin.css',
  'ui-semantic-adapter-skin.css','ui-shell-skin.css','ui-experience-skin.css','ui-skin-contract.css',
];
for (let i = 1; i < dashboardOrder.length; i += 1) {
  if (dashboardEntry.indexOf(dashboardOrder[i - 1]) > dashboardEntry.indexOf(dashboardOrder[i])) {
    failures.push(`app/dashboard/ui-active-dashboard-skin.css: ترتيب الطبقات تغير بين ${dashboardOrder[i - 1]} و ${dashboardOrder[i]}.`);
  }
}

const rootLayout = requireText('app/layout.js', [
  "import './globals.css'",
  "import './ui-active-skin.css'",
  "import ActiveUISkinRuntime from '@/components/ui/ActiveUISkinRuntime'",
  '<ActiveUISkinRuntime />',
]);
for (const forbidden of ['ui-signature-', 'SignatureAppSceneRuntime', 'SignatureProjectSceneRuntime']) {
  if (rootLayout.includes(forbidden)) failures.push(`app/layout.js: RootLayout يعرف تفصيل بدلة محظورًا: ${forbidden}`);
}

const dashboardLayout = requireText('app/dashboard/layout.js', [
  "import './ui-active-dashboard-skin.css'",
  "import ActiveDashboardSkinRuntime from '@/components/ui/ActiveDashboardSkinRuntime'",
  'loadDashboardBootstrapSnapshot',
  'composeDashboardSession',
  '<ActiveDashboardSkinRuntime>',
]);
for (const forbidden of [
  'UISkinBridgeRuntime','LegacySemanticBridgeRuntime','PortalExperienceRuntime',
  "import './raw-tokens.css'","import './ui-skin-foundation.css'","import './ui-shell-skin.css'",
  ".from('app_users')", ".from('v_my_capabilities')", ".rpc('fn_is_primary_user')",
]) {
  if (dashboardLayout.includes(forbidden)) failures.push(`app/dashboard/layout.js: تسرب تفصيل داخلي إلى الغلاف: ${forbidden}`);
}

requireText('components/ui/ActiveUISkinRuntime.js', [
  'uiSkinUsesRuntime',
  "'signature-scenes'",
  '<SignatureAppSceneRuntime />',
  '<SignatureProjectSceneRuntime />',
]);
requireText('components/ui/ActiveDashboardSkinRuntime.js', [
  '<UISkinBridgeRuntime>',
  '<LegacySemanticBridgeRuntime>',
  '<PortalExperienceRuntime>',
]);

const coreForbidden = [
  /from\s+['"]react['"]/, /from\s+['"]next\//, /\.css['"]/, /@\/components\//,
  /@\/app\//, /@supabase\//, /\bsupabase\b/i, /data-ui-/, /ui-signature/i,
];
for (const file of walk('lib/core').filter((item) => /\.(?:js|mjs)$/.test(item))) {
  const text = read(file);
  for (const pattern of coreForbidden) {
    if (pattern.test(text)) failures.push(`${file}: طبقة core تعرف تفصيلًا ممنوعًا (${pattern}).`);
  }
}

for (const file of walk('lib/adapters').filter((item) => /\.(?:js|mjs)$/.test(item))) {
  const text = read(file);
  for (const pattern of [/@\/components\//, /@\/app\//, /\.css['"]/, /data-ui-/, /ui-signature/i]) {
    if (pattern.test(text)) failures.push(`${file}: محول البنية التحتية تسرب إلى العرض (${pattern}).`);
  }
}

// Critical business-rule modules are treated as core even while legacy folder names remain.
// The UI may call these rules, but the rules must never know React, Next, Supabase or the DOM.
const governedBusinessRuleModules = [
  'lib/attendance/external-payroll.js',
];
const businessRuleForbidden = [
  /from\s+['"]react['"]/, /from\s+['"]next\//, /@supabase\//, /@\/lib\/supabase/,
  /@\/components\//, /@\/app\//, /\.css['"]/, /\bwindow\b/, /\bdocument\b/,
  /\.from\s*\(/, /\.rpc\s*\(/,
];
for (const file of governedBusinessRuleModules) {
  requireFile(file);
  if (!exists(file)) continue;
  const text = read(file);
  for (const pattern of businessRuleForbidden) {
    if (pattern.test(text)) failures.push(`${file}: محرك قاعدة أعمال يعرف تفصيل عرض/بنية تحتية ممنوعًا (${pattern}).`);
  }
}

const payrollEngine = requireText('lib/attendance/external-payroll.js', [
  'export function resolveEmployeeSocialInsuranceRate',
  'export function salaryBreakdown',
  'export function calculateExternalPayroll',
  'include_overtime',
  'include_time_shortage',
]);
const payrollWorkspace = requireText('components/attendance/ExternalPayrollWorkspace.js', [
  "from '@/lib/attendance/external-payroll'",
  'calculateExternalPayroll',
  'salaryBreakdown',
]);
for (const forbidden of [
  /referenceNet\s*\/\s*divisorDays/,
  /gosiEmployeeRate\s*\/\s*100/,
  /netMinutes\s*\/\s*60/,
]) {
  if (forbidden.test(payrollWorkspace)) failures.push(`components/attendance/ExternalPayrollWorkspace.js: معادلة رواتب تسربت إلى الواجهة (${forbidden}).`);
}
if (!payrollEngine.includes('const includeOvertime') || !payrollEngine.includes('const includeTimeShortage')) {
  failures.push('lib/attendance/external-payroll.js: سياسة فرق الساعات يجب أن تبقى داخل محرك الرواتب المركزي.');
}

const payslipPrint = requireText('app/print/external-payroll/[batchId]/payslip/[lineId]/page.js', [
  'calculation_snapshot',
  'ConstitutionPrintFrame',
]);
for (const forbidden of [
  'calculateExternalPayroll(', 'salaryBreakdown(', '.insert(', '.update(', '.delete(', '.rpc(',
]) {
  if (payslipPrint.includes(forbidden)) failures.push(`app/print/external-payroll/[batchId]/payslip/[lineId]/page.js: المطبوع تجاوز دوره كعارض بيانات (${forbidden}).`);
}

for (const file of walk('app').filter((item) => item.endsWith('.css'))) {
  const base = path.basename(file).toLowerCase();
  if (/(?:patch|override|resuscitation|legacy-ui-compat|visual-fix)/.test(base)) {
    failures.push(`${file}: ملف رقعة مرئية جديد ممنوع؛ امتص فائدته داخل عقد الجلد.`);
  }
}

for (const file of [
  ...walk('lib').filter((item) => /\/print-[^/]+\.(?:js|mjs)$/.test(`/${item}`)),
  ...walk('app/print').filter((item) => /\.(?:js|jsx|mjs)$/.test(item)),
]) {
  const text = read(file);
  if (/ui-active-skin|ui-signature-skin|ActiveUISkinRuntime|data-ui-skin/.test(text)) {
    failures.push(`${file}: القبطان للطباعة أصبح تابعًا لجلد الشاشة.`);
  }
}

for (const file of walk('app').filter((item) => item.endsWith('.css'))) {
  if (!/(?:ui-|skin|dashboard)/.test(file)) continue;
  const text = read(file);
  if (/@media\s+print/i.test(text) && !file.startsWith('app/print/')) {
    failures.push(`${file}: جلد الشاشة يكتب قواعد print خارج دستور الطباعة.`);
  }
}

if (failures.length) {
  console.error('\nInternal unification audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Internal unification audit passed: core, business rules, adapters, semantic presentation, replaceable tuxedo and print captain remain separated; legacy patch growth is blocked.');