import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function requireText(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${file}: مفقود الثابت البنيوي ${needle}`);
  }
}

requireText('app/dashboard/layout.js', [
  "import './work-sheet-kernel.css'",
  'data-work-kernel="operational-notebook-v1"',
  'data-work-sheet-mount="true"',
  'className="workSheetMount"',
]);

requireText('app/dashboard/work-sheet-kernel.css', [
  '.rawDashboardContent > .workSheetMount',
  "[data-work-header='true']",
  "[data-work-ledger='true']",
  "[data-work-dock='true']",
  'scrollbar-gutter: stable both-edges',
]);

requireText('components/ui/ConstitutionUI.js', [
  "from './WorkSheetKernel'",
  '<WorkSheet',
  '<WorkSheetHeader',
  '<WorkSection',
  '<WorkLedger',
  '<WorkDock',
]);

requireText('components/ui/RawGrid.js', [
  'data-work-ledger="true"',
  'data-work-dock="true"',
  'data-work-dock-actions="true"',
]);

requireText('lib/system-constitution.js', [
  'operational-notebook-v1',
  "model: 'one-program-one-notebook'",
  "geometryPolicy: 'single-kernel-for-all-portals-and-tools'",
  'forbidPageLocalGeometryWhenKernelExists: true',
]);

if (failures.length) {
  console.error('\nWork sheet kernel audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Work sheet kernel audit passed.');
