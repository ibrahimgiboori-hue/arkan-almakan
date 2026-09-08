import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function requireText(file, values) {
  if (!exists(file)) {
    failures.push(`${file}: الملف المطلوب غير موجود.`);
    return '';
  }
  const text = read(file);
  values.forEach((value) => {
    if (!text.includes(value)) failures.push(`${file}: مفقود ${value}`);
  });
  return text;
}

requireText('lib/ui-skin-manifest.js', [
  "id:'arkan-signature-v1'", "contract:'arkan-semantic-skin-v1'",
  "coverage:'inside-and-outside-complete-outfit'", "switch:'lib/ui-active-skin.js'",
  "root:'app/ui-active-skin.css'", "dashboard:'app/dashboard/ui-active-dashboard-skin.css'",
  "rootRuntime:'components/ui/ActiveUISkinRuntime.js'", "dashboardRuntime:'components/ui/ActiveDashboardSkinRuntime.js'",
  "name:'ARKAN SIGNATURE — APPROVED MASTER'", "tokens:'app/ui-skin-tokens.css'",
  "external:'app/ui-external-skin.css'", "signature:'app/ui-signature-skin.css'",
  "dashboardCompatibility:'app/dashboard/raw-tokens.css'", "projects:'public/skin/signature/projects.svg'",
  "finance:'public/skin/signature/finance.svg'", "workforce:'public/skin/signature/workforce.svg'",
  "visualLegacyLayer:false", "containmentPolicy:'structure-only-no-identity'", "stressSkin:'stress-test'",
  "policy:'separate-print-constitution-shared-brand-identity'",
  "replacementRule:'replace-visual-layers-and-tokens-without-changing-routes-data-permissions-or-business-logic'",
]);

requireText('lib/ui-skin-keys.js', [
  "UI_SKIN_NATIVE_KEY = 'native'", "UI_SKIN_SIGNATURE_KEY = 'signature'",
  "UI_SKIN_STRESS_TEST_KEY = 'stress-test'", 'normalizeUiSkinKey',
]);
requireText('lib/ui-active-skin.js', [
  "from '@/lib/ui-skin-keys'", 'ACTIVE_UI_SKIN_KEY = UI_SKIN_SIGNATURE_KEY', 'activeUiSkinKey',
]);
requireText('lib/ui-skin-registry.js', [
  "label:'ARKAN SIGNATURE — approved tuxedo'", "runtime:'signature-scenes'",
  "rootEntry:'app/ui-active-skin.css'", "dashboardEntry:'app/dashboard/ui-active-dashboard-skin.css'",
]);

const rootTokens = requireText('app/ui-skin-tokens.css', [
  'ROOT UI SKIN TOKENS', '--ui-canvas:', '--ui-surface:', '--ui-text:', '--ui-accent:',
  '--ui-shell-rail-width:', '--ui-shell-nav-width:', "html[data-ui-skin='signature']",
  '--ui-signature-deep:', '--ui-signature-gold:', "html[data-ui-skin='stress-test']",
]);
if (!rootTokens.includes('--ui-radius: 0px;')) failures.push('ui-skin-tokens.css: جلد الاختبار الجذري لا يثبت القدرة على تغيير الهندسة المرئية.');

requireText('app/ui-external-skin.css', [
  "[data-ui-surface='auth']", "[data-ui-role='auth-card']",
  "[data-ui-control='field']", "[data-ui-control='action']",
]);
const signature = requireText('app/ui-signature-skin.css', [
  'ARKAN SIGNATURE — APPROVED PROGRAM TUXEDO', "html[data-ui-skin='signature']",
  "url('/skin/signature/projects.svg')", "url('/skin/signature/finance.svg')",
  "url('/skin/signature/workforce.svg')", "[data-ui-part='auth-hero']",
  '.appNavRail', '.appContextNav', "[data-ui-slot='summary']", "[data-ui-role='table']",
]);
if (/@media\s+print/i.test(signature)) failures.push('ui-signature-skin.css: جلد الشاشة لا يجوز أن يكتب أي قاعدة print.');

[
  'public/skin/signature/projects.svg', 'public/skin/signature/finance.svg',
  'public/skin/signature/workforce.svg', 'public/skin/signature/documents.svg',
  'public/skin/signature/admin.svg', 'public/skin/signature/login-architecture.svg',
].forEach((file) => {
  if (!exists(file)) failures.push(`${file}: صورة سياقية من ARKAN SIGNATURE مفقودة.`);
});

const rootEntry = requireText('app/ui-active-skin.css', [
  "@import './ui-skin-tokens.css'", "@import './ui-external-skin.css'",
  "@import './ui-signature-skin.css'", "@import './ui-signature-tailoring.css'",
  "@import './ui-signature-photo-skin.css'", "@import './ui-signature-app-scenes.css'",
  "@import './ui-signature-project-scenes.css'", "@import './ui-signature-project-surface-contrast.css'",
]);
const rootLayerOrder = [
  'ui-skin-tokens.css','ui-external-skin.css','ui-signature-skin.css','ui-signature-tailoring.css',
  'ui-signature-photo-skin.css','ui-signature-app-scenes.css','ui-signature-project-scenes.css','ui-signature-project-surface-contrast.css',
];
for (let index = 1; index < rootLayerOrder.length; index += 1) {
  if (rootEntry.indexOf(rootLayerOrder[index - 1]) > rootEntry.indexOf(rootLayerOrder[index])) {
    failures.push(`app/ui-active-skin.css: تغير ترتيب التوكسيدو بين ${rootLayerOrder[index - 1]} و ${rootLayerOrder[index]}.`);
  }
}

const rootLayout = requireText('app/layout.js', [
  "import './globals.css'", "import './ui-active-skin.css'",
  "import ActiveUISkinRuntime from '@/components/ui/ActiveUISkinRuntime'",
  "import { ACTIVE_UI_SKIN_KEY } from '@/lib/ui-active-skin'",
  'uiSkinDataAttributes(ACTIVE_UI_SKIN_KEY)', '<ActiveUISkinRuntime />', '{...skinAttrs}',
]);
if (rootLayout.indexOf("import './ui-active-skin.css'") < rootLayout.indexOf("import './globals.css'")) {
  failures.push('RootLayout: يجب تحميل نقطة بدلة الشاشة بعد globals.css ليملك الجلد الكلمة المرئية النهائية.');
}
for (const forbidden of ['ui-signature-', 'SignatureAppSceneRuntime', 'SignatureProjectSceneRuntime']) {
  if (rootLayout.includes(forbidden)) failures.push(`RootLayout: ما زال يعرف تفصيلًا داخليًا من التوكسيدو: ${forbidden}`);
}
requireText('components/ui/ActiveUISkinRuntime.js', [
  'uiSkinUsesRuntime', "'signature-scenes'", '<SignatureAppSceneRuntime />', '<SignatureProjectSceneRuntime />',
]);

const login = requireText('app/login/page.js', [
  'data-ui-surface="auth"', 'data-ui-role="auth-card"', 'data-ui-control="field"',
  'data-ui-control="action"', 'data-ui-part="auth-hero"', 'data-ui-part="auth-hero-brand"',
  'data-ui-part="auth-hero-copy"',
]);
if (/className=|style=\{\{/.test(login)) failures.push('Login: عاد لاعتماد جلد محلي/قديم بدل عقد الجلد الخارجي.');

const visualLayers = [
  'app/ui-skin-tokens.css','app/ui-external-skin.css','app/ui-signature-skin.css',
  'app/dashboard/ui-skin-foundation.css','app/dashboard/ui-component-skin.css',
  'app/dashboard/ui-semantic-adapter-skin.css','app/dashboard/ui-shell-skin.css',
  'app/dashboard/ui-experience-skin.css','app/dashboard/ui-skin-contract.css',
];
visualLayers.forEach((file) => {
  if (!exists(file)) failures.push(`${file}: طبقة من طقم الهوية مفقودة.`);
});

const dashboardEntry = requireText('app/dashboard/ui-active-dashboard-skin.css', [
  "@import './raw-tokens.css'", "@import './prehydration-legacy-containment.css'",
  "@import './ui-skin-foundation.css'", "@import './ui-component-skin.css'",
  "@import './ui-semantic-adapter-skin.css'", "@import './ui-shell-skin.css'",
  "@import './ui-experience-skin.css'", "@import './ui-skin-contract.css'",
]);
const dashboardLayerOrder = [
  'raw-tokens.css','prehydration-legacy-containment.css','ui-skin-foundation.css','ui-component-skin.css',
  'ui-semantic-adapter-skin.css','ui-shell-skin.css','ui-experience-skin.css','ui-skin-contract.css',
];
for (let index = 1; index < dashboardLayerOrder.length; index += 1) {
  if (dashboardEntry.indexOf(dashboardLayerOrder[index - 1]) > dashboardEntry.indexOf(dashboardLayerOrder[index])) {
    failures.push(`app/dashboard/ui-active-dashboard-skin.css: تغير ترتيب التوكسيدو بين ${dashboardLayerOrder[index - 1]} و ${dashboardLayerOrder[index]}.`);
  }
}

const layout = requireText('app/dashboard/layout.js', [
  "import './ui-active-dashboard-skin.css'",
  "import ActiveDashboardSkinRuntime from '@/components/ui/ActiveDashboardSkinRuntime'",
  '<ActiveDashboardSkinRuntime>',
]);
for (const internal of dashboardLayerOrder) {
  if (layout.includes(internal)) failures.push(`DashboardLayout: يعرف طبقة جلد داخلية بدل نقطة الدخول الموحدة: ${internal}`);
}

const retiredVisualLayers = [
  'app/dashboard/body-resuscitation.css','app/dashboard/app-body-v3.css','app/dashboard/raw-phase.css',
  'app/dashboard/app-shell-v2.css','app/dashboard/legacy-ui-compat.css','app/dashboard/portal-experience.css',
  'components/ui/constitution-ui.module.css',
];
retiredVisualLayers.forEach((file) => {
  if (exists(file)) failures.push(`${file}: عاد جلد مرئي متقاعد خارج طقم الهوية.`);
  if (layout.includes(path.basename(file))) failures.push(`DashboardLayout: عاد لاستيراد ${path.basename(file)}.`);
});

const containment = requireText('app/dashboard/prehydration-legacy-containment.css', [
  'PRE-HYDRATION LEGACY CONTAINMENT', 'Structural safety only',
]);
if (/color\s*:|background\s*:|font-|border(?:-|\s*:)|box-shadow|padding\s*:|margin\s*:/.test(containment)) {
  failures.push('prehydration-legacy-containment.css: الحارس البنيوي يحمل هوية مرئية ويجب إعادتها لطقم الجلد.');
}

const bridge = requireText('app/dashboard/raw-tokens.css', [
  'DASHBOARD TOKEN COMPATIBILITY BRIDGE', '--raw-bg: var(--ui-canvas)',
  '--raw-wine: var(--ui-accent)', '--sidebar-w: var(--ui-shell-nav-width)',
]);
if (/--ui-(?:canvas|surface|text|accent|radius|shell-[\w-]+)\s*:\s*(?:#|rgb|hsl)/i.test(bridge)) {
  failures.push('raw-tokens.css: عاد لتعريف هوية مستقلة بدل أن يكون جسر توافق فقط.');
}

const shell = requireText('app/dashboard/ui-shell-skin.css', [
  'var(--ui-shell-rail-width, 76px)', 'var(--ui-shell-nav-width, 220px)',
  '--app-shell-rail-width:', '--app-shell-context-width:', '.appNavRail', '.appContextNav',
]);
if (!shell.includes('!important')) failures.push('ui-shell-skin.css: يجب أن يظل الجلد صاحب الكلمة النهائية أمام هندسة inline قديمة حتى تزول بالكامل.');
if (shell.includes('.appNavHotZone')) failures.push('ui-shell-skin.css: عاد عنصر ملاحة مخفي خارج طقم الهوية الجديد.');

const constitutionUi = requireText('components/ui/ConstitutionUI.js', [
  "data-ui-slot={uiSlot('page')}", "data-ui-slot={uiSlot('recordSummary')}",
  '<progress max="100" value={safeProgress}',
]);
if (/module\.css|style=\{\{|styles\./.test(constitutionUi)) failures.push('ConstitutionUI: يوجد جلد محلي خارج طقم الهوية.');

const islandFiles = [
  'components/ui/FocusValve.module.css','components/ui/RawGrid.module.css',
  'components/ui/WorkSessionRuntime.module.css','components/ui/constitution-dialog.module.css',
  'components/ui/portal-hall-interior.module.css','app/dashboard/portal-hall.module.css',
];
for (const file of islandFiles) {
  const text = requireText(file, ['--ui-']);
  if (/--raw-|var\(--maroon|var\(--paper|var\(--ink|var\(--hair/.test(text)) failures.push(`${file}: ما زال يحمل أسماء جلد قديم بدل العقد --ui-*.`);
  if (/(?:#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i.test(text)) failures.push(`${file}: يحتوي لونًا محليًا صريحًا خارج طقم الهوية.`);
}

requireText('lib/ui-skin-contract.js', [
  "'--ui-shell-rail-width'", "'--ui-shell-nav-width'", "navigationRail:'navigation-rail'",
  "navigationPanel:'navigation-panel'", "principle:'business-and-interaction-contracts-stay-stable-while-skin-is-replaceable'",
]);

if (failures.length) {
  console.error('\nUI skin pack audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('UI skin pack audit passed: ARKAN SIGNATURE remains the approved tuxedo, but layouts now depend only on replaceable skin entrypoints and generic runtimes.');
