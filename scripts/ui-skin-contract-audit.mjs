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
    if (!text.includes(needle)) failures.push(`${file}: مفقود الثابت ${needle}`);
  }
}

requireText('lib/ui-skin-contract.js', [
  "id:'arkan-semantic-skin-v1'",
  "principle:'business-and-interaction-contracts-stay-stable-while-skin-is-replaceable'",
  "navigation:'navigation'",
  "navigationRow:'navigation-row'",
  "applicationStage:'application-stage'",
  "applicationContent:'application-content'",
  "routeMount:'route-mount'",
  "systemState:'system-state'",
  "actionContextBanner:'action-context-banner'",
  "form:'form'",
  "field:'field'",
  "action:'action'",
  "dialog:'dialog'",
  "'--ui-canvas'",
  "'--ui-accent'",
  'uiSkinDataAttributes',
  'uiSlot',
]);

requireText('components/ui/WorkSheetKernel.js', [
  "data-ui-slot={uiSlot('sheet')}",
  "data-ui-slot={uiSlot('header')}",
  "data-ui-slot={uiSlot('section')}",
  "data-ui-slot={uiSlot('ledger')}",
  "data-ui-slot={uiSlot('dock')}",
  "data-ui-slot={uiSlot('selectionDock')}",
  'data-ui-control="clear-selection"',
]);
const kernel = read('components/ui/WorkSheetKernel.js');
if (/style=\{\{/.test(kernel)) failures.push('WorkSheetKernel: لا يجوز أن يحمل هندسة مرئية inline؛ الجلد هو المسؤول عنها.');
if (/className=["']btn\s/.test(kernel)) failures.push('WorkSheetKernel: عاد لاستخدام فئات أزرار مرئية قديمة بدل العقد الدلالي.');

requireText('components/ui/ConstitutionUI.js', [
  "data-ui-slot={uiSlot('page')}",
  "data-ui-slot={uiSlot('pageHeader')}",
  "data-ui-slot={uiSlot('summary')}",
  "data-ui-slot={uiSlot('filters')}",
  "data-ui-slot={uiSlot('entry')}",
  "data-ui-slot={uiSlot('notice')}",
  "data-ui-slot={uiSlot('recordList')}",
  "data-ui-slot={uiSlot('recordRow')}",
  "data-ui-slot={uiSlot('recordSummary')}",
  "data-ui-slot={uiSlot('table')}",
  "data-ui-slot={uiSlot('empty')}",
  '<progress max="100" value={safeProgress}',
]);
const constitutionUi = read('components/ui/ConstitutionUI.js');
if (constitutionUi.includes('constitution-ui.module.css')) failures.push('ConstitutionUI: عاد الجلد المحلي داخل المكوّن بدل الجلد القابل للاستبدال.');
if (/styles\./.test(constitutionUi)) failures.push('ConstitutionUI: بقي اعتماد على CSS module مرئي بعد فصل الجلد.');
if (/style=\{\{/.test(constitutionUi)) failures.push('ConstitutionUI: بقي تنسيق مرئي inline؛ يجب أن يمر عبر الجلد الدلالي.');

requireText('components/ui/LegacySemanticBridgeRuntime.js', [
  'LegacySemanticBridgeRuntime',
  "data-ui-legacy-adapted",
  "uiSlot('page')",
  "uiSlot('pageHeader')",
  "uiSlot('section')",
  "uiSlot('action')",
  "'data-ui-role':'legacy-shell'",
]);
const legacyBridge = read('components/ui/LegacySemanticBridgeRuntime.js');
if (/style=\{\{/.test(legacyBridge)) failures.push('LegacySemanticBridgeRuntime: الجسر الدلالي لا يجوز أن يرسم الواجهة.');

requireText('components/ui/ProgramAction.js', [
  "data-ui-slot={uiSlot('action')}",
  'data-ui-control="action"',
  'data-ui-state=',
]);
requireText('components/ui/ConstitutionDialog.js', [
  "data-ui-slot={uiSlot('dialog')}",
  'data-ui-part="dialog-header"',
  'data-ui-part="dialog-body"',
]);
requireText('components/ui/ConfirmDialog.js', [
  'data-ui-part="dialog-actions"',
  'data-ui-control="confirm"',
  'data-ui-control="cancel"',
]);

requireText('components/ui/UISkinBridgeRuntime.js', [
  "uiSlot('navigation')",
  "uiSlot('navigationHeader')",
  "uiSlot('navigationRow')",
  "uiSlot('navigationFooter')",
  "uiSlot('navigationTrigger')",
  "uiSlot('applicationStage')",
  "uiSlot('applicationContent')",
  "uiSlot('routeMount')",
  "uiSlot('actionContextBanner')",
  "data-ui-role':'application-content'",
  "data-ui-role':'route-mount'",
]);

requireText('components/ui/PortalExperienceRuntime.js', [
  "field.setAttribute('data-ui-slot', 'field')",
  "form.setAttribute('data-ui-slot', 'form')",
  "button.setAttribute('data-ui-control', 'button')",
  "link.setAttribute('data-ui-control', 'link')",
  "table.setAttribute('data-ui-role', 'table')",
]);

requireText('app/dashboard/raw-tokens.css', [
  '--ui-canvas:',
  '--ui-surface:',
  '--ui-text:',
  '--ui-accent:',
  '--raw-bg: var(--ui-canvas)',
  '--raw-wine: var(--ui-accent)',
]);

requireText('app/dashboard/ui-skin-foundation.css', [
  'UI SKIN FOUNDATION — semantic native structure',
  "[data-ui-slot='sheet']",
  "[data-ui-slot='page-header']",
  "[data-ui-slot='section']",
  "[data-ui-slot='section-header']",
  "[data-ui-slot='ledger']",
  "[data-ui-role='table']",
  "[data-ui-slot='field']",
  "[data-ui-slot='dock']",
  "[data-ui-slot='record-list']",
]);
const foundation = read('app/dashboard/ui-skin-foundation.css');
for (const forbidden of ['.page-head', '.section:not(', '.card:not(', '.btn:not(', '.tabs:not(', '.shell > .side', '.topbar']) {
  if (foundation.includes(forbidden)) failures.push(`ui-skin-foundation.css: عاد المحدد القديم ${forbidden} إلى الجلد الدلالي.`);
}

requireText('app/dashboard/ui-component-skin.css', [
  'NATIVE COMPONENT SKIN',
  "[data-ui-slot='entry']",
  "[data-ui-role='status']",
  "[data-ui-slot='record-row'] [data-ui-part='record-primary']",
  "[data-ui-slot='record-summary']",
  'progress::-webkit-progress-value',
]);
const componentSkin = read('app/dashboard/ui-component-skin.css');
if (/\.pageHeader|\.sectionHeader|\.recordRow|\.recordSummary|\.actionMenu|\.viewOptions/.test(componentSkin)) {
  failures.push('ui-component-skin.css: عاد ليتعلق بأسماء CSS module المحلية بدل data-ui-* الدلالي.');
}

requireText('app/dashboard/ui-semantic-adapter-skin.css', [
  'SEMANTIC ADAPTER SKIN',
  "[data-ui-role='legacy-card']",
  "[data-ui-role='tabs']",
  "[data-ui-role='legacy-action']",
  "[data-ui-role='legacy-shell']",
]);
const adapterSkin = read('app/dashboard/ui-semantic-adapter-skin.css');
if (/\.page-head|\.section:not\(|\.card:not\(|\.btn:not\(|\.shell\s*>\s*\.side/.test(adapterSkin)) {
  failures.push('ui-semantic-adapter-skin.css: الجسر الدلالي عاد لاستهداف مفردات CSS القديمة مباشرة.');
}

requireText('app/dashboard/prehydration-legacy-containment.css', [
  'PRE-HYDRATION LEGACY CONTAINMENT',
  'Structural safety only',
  '.shell > .side',
  '.topbar',
]);
const containment = read('app/dashboard/prehydration-legacy-containment.css');
if (/color\s*:|background\s*:|font-|border(?:-|\s*:)|box-shadow|padding\s*:/.test(containment)) {
  failures.push('prehydration-legacy-containment.css: ملف الاحتواء البنيوي تسرب إليه جلد مرئي.');
}

requireText('app/dashboard/ui-shell-skin.css', [
  'NATIVE SHELL SKIN',
  '.appNavHotZone',
  '.appContextNav',
  ".appContextNav[data-open='true']",
  '.appNavTopLine',
  '.appNavBottomActions',
  "@media (prefers-reduced-motion: reduce)",
]);
const shellSkin = read('app/dashboard/ui-shell-skin.css');
if (shellSkin.includes('.appActionContextAlert')) failures.push('ui-shell-skin.css: شريط سياق الإجراء دخل جلد الملاحة بدل جلد الجسم الدلالي.');
if (shellSkin.includes('.rawDashboardContent > .workSheetMount')) failures.push('ui-shell-skin.css: جلد الغلاف امتلك جسم الصفحة بدل عقد الجلد.');

requireText('app/dashboard/ui-skin-contract.css', [
  "[data-ui-skin-contract='arkan-semantic-skin-v1']",
  "[data-ui-slot='system-state']",
  "[data-ui-slot='application-stage']",
  "[data-ui-slot='application-content']",
  "[data-ui-slot='route-mount']",
  "[data-ui-slot='action-context-banner']",
  "[data-ui-slot='selection-dock']",
  "[data-ui-control='clear-selection']",
  "[data-ui-slot='action']",
  '--app-body-nav-width:',
  'appWorkThresholdArrive',
  '.appCompletedSurface',
  "[data-work-threshold-entry='true']",
]);

requireText('app/dashboard/layout.js', [
  "import { uiSkinDataAttributes, uiSlot } from '@/lib/ui-skin-contract'",
  "import UISkinBridgeRuntime from '@/components/ui/UISkinBridgeRuntime'",
  "import LegacySemanticBridgeRuntime from '@/components/ui/LegacySemanticBridgeRuntime'",
  "import './prehydration-legacy-containment.css'",
  "import './ui-skin-foundation.css'",
  "import './ui-component-skin.css'",
  "import './ui-semantic-adapter-skin.css'",
  "import './ui-shell-skin.css'",
  "import './ui-skin-contract.css'",
  '<LegacySemanticBridgeRuntime>',
  'const skinAttrs = uiSkinDataAttributes()',
  '{...skinAttrs}',
  "data-ui-slot={uiSlot('systemState')}",
  "data-ui-slot={uiSlot('applicationStage')}",
  "data-ui-slot={uiSlot('applicationContent')}",
  "data-ui-slot={uiSlot('routeMount')}",
  "data-ui-slot={uiSlot('actionContextBanner')}",
  '<UISkinBridgeRuntime>',
]);

const layout = read('app/dashboard/layout.js');
if (/style=\{\{/.test(layout)) failures.push('DashboardLayout: لا يجوز أن يحمل تنسيقًا مرئيًا inline؛ حالات النظام والجسم تتبع عقد الجلد.');
for (const retired of ['body-resuscitation.css','app-body-v3.css','raw-phase.css','app-shell-v2.css','legacy-ui-compat.css']) {
  if (layout.includes(retired)) failures.push(`DashboardLayout: عاد لاستيراد ${retired} بعد امتصاصه/استبداله.`);
}
for (const retiredFile of [
  'app/dashboard/body-resuscitation.css',
  'app/dashboard/app-body-v3.css',
  'app/dashboard/raw-phase.css',
  'app/dashboard/app-shell-v2.css',
  'app/dashboard/legacy-ui-compat.css',
  'components/ui/constitution-ui.module.css',
]) {
  if (exists(retiredFile)) failures.push(`${retiredFile}: الملف المرئي المتقاعد لا يجوز أن يعود.`);
}

if (failures.length) {
  console.error('\nUI skin contract audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('UI skin contract audit passed: no legacy visual layer remains; native foundation, components, semantic adapter, shell and body are replaceable skin layers, with only non-visual pre-hydration containment outside them.');
