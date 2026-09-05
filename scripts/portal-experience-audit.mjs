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

requireText('lib/portal-experience-constitution.js', [
  "id: 'unified-portal-experience-v2'",
  "rtlForwardKey: 'ArrowLeft'",
  "rtlBackKey: 'ArrowRight'",
  "saveShortcut: 'CtrlOrMeta+S'",
  "numericLocalePolicy: 'accept-arabic-indic-digits-and-normalize-on-paste-or-blur'",
  "numberWheelPolicy: 'focused-number-input-never-mutates-by-wheel'",
  "edgeStatePolicy: 'start-middle-end'",
  "'PageUp'",
  "'PageDown'",
]);

requireText('components/ui/PortalExperienceRuntime.js', [
  'normalizeLocalizedNumberText',
  'syncLedgerOverflow',
  'nearestSaveTarget',
  'onSaveShortcut',
  'onWheel',
  'onPaste',
  'rtlForwardKey',
  'rtlBackKey',
  'pageJumpRows',
  "new CustomEvent('arkan:save-requested'",
  "data-network-status",
  "data-network-notice=\"offline\"",
  "data-technical-field",
  "field.setAttribute('data-ui-slot', 'field')",
  "form.setAttribute('data-ui-slot', 'form')",
  "button.setAttribute('data-ui-control', 'button')",
  "link.setAttribute('data-ui-control', 'link')",
  "summary.setAttribute('data-ui-control', 'disclosure')",
  "table.setAttribute('data-ui-role', 'table')",
  "attributeFilter:['disabled', 'readonly', 'aria-invalid', 'type', 'inputmode']",
]);

requireText('components/ui/ProgramAction.js', [
  'destructiveConfirmation',
  "data-action-destructive",
  "data-disabled-reason",
  "aria-keyshortcuts={saveShortcut}",
  "confirmation:false",
  "data-ui-slot={uiSlot('action')}",
  'data-ui-control="action"',
  'data-ui-state=',
]);

requireText('components/ui/ActionNervousSystemRuntime.js', [
  'className="appActionFailure"',
  'data-action-failure="true"',
  'aria-live="assertive"',
  'clearError',
]);

requireText('app/dashboard/portal-experience.css', [
  "[data-portal-experience^='unified-portal-experience-']",
  "[data-ledger-scroll-position='start']",
  "[data-ledger-scroll-position='middle']",
  "[data-ledger-scroll-position='end']",
  "[data-program-action='true']:focus-visible",
  "[data-technical-field='true']",
  '.appActionFailure',
  '.appOfflineNotice',
  '@media (prefers-reduced-motion: reduce)',
]);

requireText('app/dashboard/layout.js', [
  "import PortalExperienceRuntime from '@/components/ui/PortalExperienceRuntime'",
  "import './portal-experience.css'",
  '<PortalExperienceRuntime>',
]);

if (failures.length) {
  console.error('\nPortal experience audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Portal experience audit passed: navigation, keyboard save, numeric input safety, ledger awareness, semantic legacy control annotation, action failure visibility, destructive safeguards, technical direction, and network awareness are centrally governed.');
