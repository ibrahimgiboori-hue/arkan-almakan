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
  "id:'arkan-native-v1'",
  "contract:'arkan-semantic-skin-v1'",
  "coverage:'inside-and-outside-complete-outfit'",
  "switch:'lib/ui-active-skin.js'",
  "tokens:'app/ui-skin-tokens.css'",
  "external:'app/ui-external-skin.css'",
  "dashboardCompatibility:'app/dashboard/raw-tokens.css'",
  "visualLegacyLayer:false",
  "containmentPolicy:'structure-only-no-identity'",
  "stressSkin:'stress-test'",
  "policy:'separate-print-constitution-shared-brand-identity'",
  "replacementRule:'replace-visual-layers-and-tokens-without-changing-routes-data-permissions-or-business-logic'",
]);

requireText('lib/ui-active-skin.js', [
  "ACTIVE_UI_SKIN_KEY = 'native'",
  "UI_SKIN_STRESS_TEST_KEY = 'stress-test'",
]);

const rootTokens = requireText('app/ui-skin-tokens.css', [
  'ROOT UI SKIN TOKENS',
  '--ui-canvas:',
  '--ui-surface:',
  '--ui-text:',
  '--ui-accent:',
  '--ui-shell-rail-width:',
  '--ui-shell-nav-width:',
  "html[data-ui-skin='stress-test']",
]);
if (!rootTokens.includes('--ui-radius: 0px;')) failures.push('ui-skin-tokens.css: جلد الاختبار الجذري لا يثبت القدرة على تغيير الهندسة المرئية.');

requireText('app/ui-external-skin.css', [
  "[data-ui-surface='auth']",
  "[data-ui-role='auth-card']",
  "[data-ui-control='field']",
  "[data-ui-control='action']",
]);

const rootLayout = requireText('app/layout.js', [
  "import './globals.css'",
  "import './ui-skin-tokens.css'",
  "import './ui-external-skin.css'",
  "import { ACTIVE_UI_SKIN_KEY } from '@/lib/ui-active-skin'",
  'uiSkinDataAttributes(ACTIVE_UI_SKIN_KEY)',
  '{...skinAttrs}',
]);
if (rootLayout.indexOf("import './ui-skin-tokens.css'") < rootLayout.indexOf("import './globals.css'")) {
  failures.push('RootLayout: يجب تحميل الجلد الدلالي بعد globals.css ليملك الكلمة المرئية النهائية.');
}

const login = requireText('app/login/page.js', [
  'data-ui-surface="auth"',
  'data-ui-role="auth-card"',
  'data-ui-control="field"',
  'data-ui-control="action"',
]);
if (/className=|style=\{\{/.test(login)) failures.push('Login: عاد لاعتماد جلد محلي/قديم بدل عقد الجلد الخارجي.');

const visualLayers = [
  'app/ui-skin-tokens.css',
  'app/ui-external-skin.css',
  'app/dashboard/ui-skin-foundation.css',
  'app/dashboard/ui-component-skin.css',
  'app/dashboard/ui-semantic-adapter-skin.css',
  'app/dashboard/ui-shell-skin.css',
  'app/dashboard/ui-experience-skin.css',
  'app/dashboard/ui-skin-contract.css',
];
visualLayers.forEach((file) => {
  if (!exists(file)) failures.push(`${file}: طبقة من طقم الهوية مفقودة.`);
});

const layout = requireText('app/dashboard/layout.js', [
  "import './raw-tokens.css'",
  "import './prehydration-legacy-containment.css'",
  "import './ui-skin-foundation.css'",
  "import './ui-component-skin.css'",
  "import './ui-semantic-adapter-skin.css'",
  "import './ui-shell-skin.css'",
  "import './ui-experience-skin.css'",
  "import './ui-skin-contract.css'",
]);

const retiredVisualLayers = [
  'app/dashboard/body-resuscitation.css',
  'app/dashboard/app-body-v3.css',
  'app/dashboard/raw-phase.css',
  'app/dashboard/app-shell-v2.css',
  'app/dashboard/legacy-ui-compat.css',
  'app/dashboard/portal-experience.css',
  'components/ui/constitution-ui.module.css',
];
retiredVisualLayers.forEach((file) => {
  if (exists(file)) failures.push(`${file}: عاد جلد مرئي متقاعد خارج طقم الهوية.`);
  if (layout.includes(path.basename(file))) failures.push(`DashboardLayout: عاد لاستيراد ${path.basename(file)}.`);
});

const containment = requireText('app/dashboard/prehydration-legacy-containment.css', [
  'PRE-HYDRATION LEGACY CONTAINMENT',
  'Structural safety only',
]);
if (/color\s*:|background\s*:|font-|border(?:-|\s*:)|box-shadow|padding\s*:|margin\s*:/.test(containment)) {
  failures.push('prehydration-legacy-containment.css: الحارس البنيوي يحمل هوية مرئية ويجب إعادتها لطقم الجلد.');
}

const bridge = requireText('app/dashboard/raw-tokens.css', [
  'DASHBOARD TOKEN COMPATIBILITY BRIDGE',
  '--raw-bg: var(--ui-canvas)',
  '--raw-wine: var(--ui-accent)',
  '--sidebar-w: var(--ui-shell-nav-width)',
]);
if (/--ui-(?:canvas|surface|text|accent|radius|shell-[\w-]+)\s*:\s*(?:#|rgb|hsl)/i.test(bridge)) {
  failures.push('raw-tokens.css: عاد لتعريف هوية مستقلة بدل أن يكون جسر توافق فقط.');
}

const shell = requireText('app/dashboard/ui-shell-skin.css', [
  'var(--ui-shell-rail-width, 76px)',
  'var(--ui-shell-nav-width, 220px)',
  '--app-shell-rail-width:',
  '--app-shell-context-width:',
  '.appNavRail',
  '.appContextNav',
]);
if (!shell.includes('!important')) failures.push('ui-shell-skin.css: يجب أن يظل الجلد صاحب الكلمة النهائية أمام هندسة inline قديمة حتى تزول بالكامل.');
if (shell.includes('.appNavHotZone')) failures.push('ui-shell-skin.css: عاد عنصر ملاحة مخفي خارج طقم الهوية الجديد.');

const constitutionUi = requireText('components/ui/ConstitutionUI.js', [
  "data-ui-slot={uiSlot('page')}",
  "data-ui-slot={uiSlot('recordSummary')}",
  '<progress max="100" value={safeProgress}',
]);
if (/module\.css|style=\{\{|styles\./.test(constitutionUi)) {
  failures.push('ConstitutionUI: يوجد جلد محلي خارج طقم الهوية.');
}

const islandFiles = [
  'components/ui/FocusValve.module.css',
  'components/ui/RawGrid.module.css',
  'components/ui/WorkSessionRuntime.module.css',
  'components/ui/constitution-dialog.module.css',
  'components/ui/portal-hall-interior.module.css',
  'app/dashboard/portal-hall.module.css',
];
for (const file of islandFiles) {
  const text = requireText(file, ['--ui-']);
  if (/--raw-|var\(--maroon|var\(--paper|var\(--ink|var\(--hair/.test(text)) {
    failures.push(`${file}: ما زال يحمل أسماء جلد قديم بدل العقد --ui-*.`);
  }
  if (/(?:#[0-9a-f]{3,8}\b|rgba?\(|hsla?\()/i.test(text)) {
    failures.push(`${file}: يحتوي لونًا محليًا صريحًا خارج طقم الهوية.`);
  }
}

requireText('lib/ui-skin-contract.js', [
  "'--ui-shell-rail-width'",
  "'--ui-shell-nav-width'",
  "navigationRail:'navigation-rail'",
  "navigationPanel:'navigation-panel'",
  "principle:'business-and-interaction-contracts-stay-stable-while-skin-is-replaceable'",
]);

if (failures.length) {
  console.error('\nUI skin pack audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('UI skin pack audit passed: one root switch controls internal and external screen identity; legacy dashboard names are aliases only and isolated components consume semantic tokens.');
