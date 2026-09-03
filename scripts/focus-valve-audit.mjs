import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const requireText = (file, values) => {
  if (!exists(file)) { failures.push(`${file}: الملف البنيوي مفقود`); return ''; }
  const text = read(file);
  for (const value of values) if (!text.includes(value)) failures.push(`${file}: مفقود الثابت البنيوي ${value}`);
  return text;
};

const constitution = requireText('lib/focus-valve-constitution.js', [
  'work-focus-valve-v1',
  'ready-focus-work-complete-release-ready',
  'history-remains-queryable-but-never-stacks-under-current-work',
  'visibility-only-never-delete-never-mutate-business-data',
  'organ-declares-focus-state-body-does-not-infer-from-dom-shape',
  'bodyMustNotInferFocusFromCssSelectors',
  'bodyMustNotTreatFocusAsBusinessStatus',
  'FOCUS_VALVE_STATE',
  'FOCUS_REGION',
]);
if (/localStorage|sessionStorage/.test(constitution)) failures.push('focus valve: حالة التركيز لا تُخزن في متصفح كحقيقة تشغيلية.');

const valve = requireText('components/ui/FocusValve.js', [
  'FocusValveContext',
  'data-focus-valve="work-focus-valve-v1"',
  'data-focus-valve-state',
  'FocusReady',
  'FocusRegister',
  'FocusWork',
  'FocusContextLine',
  'hidden={!visible}',
]);
if (/querySelector|MutationObserver/.test(valve)) failures.push('FocusValve: ممنوع استنتاج حالة العضو من شكل DOM؛ العضو يعلن حالته صراحة.');

requireText('components/ui/FocusValve.module.css', [
  '.region[hidden]',
  '.contextLine',
]);

const attendance = requireText('app/dashboard/attendance/page.js', [
  "from '@/components/ui/FocusValve'",
  "from '@/lib/focus-valve-constitution'",
  'FOCUS_VALVE_STATE.FOCUSED',
  '<FocusValve',
  '<FocusReady>',
  '<FocusRegister>',
  '<FocusWork>',
  '<FocusContextLine',
  'data-attendance-focus="current-import"',
]);
if (/q\.data\?\.\[0\]\?\.id/.test(attendance)) failures.push('الحضور: لا يجوز فتح آخر دفعة تلقائيًا؛ حالة READY يجب أن تكون حقيقية حتى يختار المستخدم عملًا.');

if (failures.length) {
  console.error('\nFocus valve audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Focus valve audit passed: ready/register surfaces yield to the current focused work without deleting history or confusing focus with business state.');
