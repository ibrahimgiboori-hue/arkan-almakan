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

const manifest = requireText('lib/ui-skin-manifest.js', [
  "id:'arkan-native-v1'",
  "contract:'arkan-semantic-skin-v1'",
  "coverage:'inside-and-outside-complete-outfit'",
  "tokens:'app/dashboard/raw-tokens.css'",
  "foundation:'app/dashboard/ui-skin-foundation.css'",
  "components:'app/dashboard/ui-component-skin.css'",
  "semanticAdapter:'app/dashboard/ui-semantic-adapter-skin.css'",
  "shell:'app/dashboard/ui-shell-skin.css'",
  "experience:'app/dashboard/ui-experience-skin.css'",
  "body:'app/dashboard/ui-skin-contract.css'",
  "visualLegacyLayer:false",
  "containmentPolicy:'structure-only-no-identity'",
  "policy:'separate-print-constitution-shared-brand-identity'",
  "replacementRule:'replace-visual-layers-and-tokens-without-changing-routes-data-permissions-or-business-logic'",
]);

const visualLayers = [
  'app/dashboard/raw-tokens.css',
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

const tokens = requireText('app/dashboard/raw-tokens.css', [
  '--ui-canvas:',
  '--ui-accent:',
  '--ui-shell-nav-width:',
]);
const shell = requireText('app/dashboard/ui-shell-skin.css', [
  'var(--ui-shell-nav-width, 196px)',
  '--app-body-nav-width:',
]);
if (!shell.includes('!important')) failures.push('ui-shell-skin.css: يجب أن يظل الجلد صاحب الكلمة النهائية أمام هندسة inline قديمة حتى تزول بالكامل.');

const constitutionUi = requireText('components/ui/ConstitutionUI.js', [
  "data-ui-slot={uiSlot('page')}",
  "data-ui-slot={uiSlot('recordSummary')}",
  '<progress max="100" value={safeProgress}',
]);
if (/module\.css|style=\{\{|styles\./.test(constitutionUi)) {
  failures.push('ConstitutionUI: يوجد جلد محلي خارج طقم الهوية.');
}

const contract = requireText('lib/ui-skin-contract.js', [
  "'--ui-shell-nav-width'",
  "principle:'business-and-interaction-contracts-stay-stable-while-skin-is-replaceable'",
]);

if (failures.length) {
  console.error('\nUI skin pack audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('UI skin pack audit passed: the current identity is a complete replaceable inside/outside outfit; no retired visual layer sits outside the pack, and print remains constitutionally separate.');
