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

requireText('app/dashboard/ui-skin-contract.css', [
  "[data-ui-skin-contract='arkan-semantic-skin-v1']",
  "[data-ui-slot='selection-dock']",
  "[data-ui-control='clear-selection']",
  "[data-ui-slot='action']",
]);

requireText('app/dashboard/layout.js', [
  "import { uiSkinDataAttributes } from '@/lib/ui-skin-contract'",
  "import UISkinBridgeRuntime from '@/components/ui/UISkinBridgeRuntime'",
  "import './ui-skin-contract.css'",
  'const skinAttrs = uiSkinDataAttributes()',
  '{...skinAttrs}',
  '<UISkinBridgeRuntime>',
]);

if (failures.length) {
  console.error('\nUI skin contract audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('UI skin contract audit passed: shell, navigation, structure, forms, fields, actions and dialogs expose stable semantics while the native skin remains a replaceable adapter.');
