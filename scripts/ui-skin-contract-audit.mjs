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
]);

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

requireText('app/dashboard/legacy-ui-compat.css', [
  'LEGACY UI COMPATIBILITY — quarantine only',
  'Every selector here is removable residue',
  '.page:not([data-ui-slot])',
  '.section:not([data-ui-slot])',
  "table:not([data-ui-role='table'])",
  'input:not([data-ui-slot])',
  ".btn:not([data-ui-slot='action'])",
]);

const legacy = read('app/dashboard/legacy-ui-compat.css');
if (/\[data-ui-slot=['"][^'"]+['"]\]\s*\{/.test(legacy)) {
  failures.push('legacy-ui-compat.css: ملف الحجر لا يجوز أن يملك تنسيقًا مباشرًا لفتحات data-ui-slot الدلالية.');
}
if (/\[data-ui-role=['"]table['"]\]\s*\{/.test(legacy)) {
  failures.push('legacy-ui-compat.css: الجدول الدلالي عاد إلى ملف التوافق القديم.');
}
if (/\[data-work-(?:header|section|ledger|dock)=['"]true['"]\]/.test(legacy)) {
  failures.push('legacy-ui-compat.css: بنية WorkSheet الدلالية لا يجوز أن تعود إلى حجر التوافق القديم.');
}

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
  "import './legacy-ui-compat.css'",
  "import './ui-skin-foundation.css'",
  "import './ui-skin-contract.css'",
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
if (layout.includes('body-resuscitation.css')) failures.push('DashboardLayout: عاد لاستيراد رقعة إنعاش الجسم القديمة بعد امتصاصها في العقد الدلالي.');
if (layout.includes('app-body-v3.css')) failures.push('DashboardLayout: عاد لاستيراد طبقة جسم مستقلة بعد امتصاص هندستها في الجلد الدلالي.');
if (layout.includes('raw-phase.css')) failures.push('DashboardLayout: عاد لاستيراد raw-phase بعد إعادة تأهيل البقايا الصالحة إلى الجلد الدلالي وحجر التوافق.');
if (exists('app/dashboard/body-resuscitation.css')) failures.push('body-resuscitation.css: الرقعة الطارئة تم امتصاصها في الجسم المركزي ويجب ألا تعود كملف مستقل.');
if (exists('app/dashboard/app-body-v3.css')) failures.push('app-body-v3.css: طبقة الجسم تم امتصاصها في الجلد المركزي ويجب ألا تعود كملف مستقل.');
if (exists('app/dashboard/raw-phase.css')) failures.push('raw-phase.css: الاسم/الدور القديم انتهى؛ الدلالي في ui-skin-foundation والقديم فقط في legacy-ui-compat.');

const shellCss = read('app/dashboard/app-shell-v2.css');
if (shellCss.includes('.appActionContextAlert')) failures.push('app-shell-v2.css: شريط سياق الإجراء عاد إلى ملف الغلاف بدل الجلد الدلالي.');
if (shellCss.includes('.rawDashboardContent > .workSheetMount')) failures.push('app-shell-v2.css: قاعدة بقاء جسم الصفحة عادت إلى ملف الغلاف بدل عقد الجلد.');

if (failures.length) {
  console.error('\nUI skin contract audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('UI skin contract audit passed: semantic structure lives in the replaceable skin, old class vocabulary is quarantined, and retired body/phase patches cannot regrow.');
