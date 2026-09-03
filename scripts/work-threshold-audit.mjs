import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const requireText = (rel, values) => {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel}: الملف مفقود`);
    return '';
  }
  const text = read(rel);
  for (const value of values) if (!text.includes(value)) failures.push(`${rel}: مفقود ${value}`);
  return text;
};

const threshold = requireText('lib/work-threshold-constitution.js', [
  'work-threshold-v1',
  'perspective-anatomy-work-zone-work-session-release-to-zone',
  'enter-operational-zone-not-start-transaction',
  'single-quiet-transition-no-modal-no-toast-no-interstitial',
  'work-zone-is-not-dirty-and-is-not-working-by-itself',
  'resolveWorkThreshold',
]);
if (/alert\(|confirm\(|prompt\(/.test(threshold)) failures.push('Work threshold DNA: لا يجوز أن تكون العتبة نافذة أو مقاطعة للمستخدم.');

const runtime = requireText('components/ui/WorkThresholdRuntime.js', [
  'data-work-threshold-entry',
  'data-work-posture',
  'WorkThresholdMarker',
  'previousZoneRef',
  '210',
]);
if (/setTimeout\([^,]+,\s*(?:[3-9]\d\d|\d{4,})\)/.test(runtime)) failures.push('WorkThresholdRuntime: نبضة العتبة أطول من اللازم.');

const sessionConstitution = requireText('lib/work-session-constitution.js', [
  "IDLE: 'idle'",
  'being-in-a-work-zone-does-not-mean-a-work-session-has-started',
  'new-route-resets-session-to-idle-not-working',
]);
const sessionRuntime = requireText('components/ui/WorkSessionRuntime.js', [
  "BEGIN: 'arkan:work-session-begin'",
  'const [started, setStarted] = useState(false)',
  'WORK_SESSION_STATE.IDLE',
  'data-work-session-state',
]);
if (!sessionRuntime.includes('setStarted(true)')) failures.push('WorkSessionRuntime: الجلسة لا تملك بداية صريحة.');

const nerve = requireText('components/ui/ActionNervousSystemRuntime.js', [
  'workSession.begin({ subject:spec.subject || null })',
  'workSession.complete',
]);

const layout = requireText('app/dashboard/layout.js', [
  "import WorkThresholdRuntime, { WorkThresholdMarker } from '@/components/ui/WorkThresholdRuntime'",
  '<WorkThresholdRuntime>',
  '<WorkThresholdMarker />',
]);
if (layout.indexOf('<WorkThresholdRuntime>') > layout.indexOf('<WorkSessionRuntime>')) {
  failures.push('dashboard layout: عتبة العمل يجب أن تحيط بجلسة العمل حتى تبقى المنطقة بعد تحرير الجلسة.');
}

const body = requireText('app/dashboard/app-body-v3.css', [
  ".rawDashboardShell[data-work-posture='work-zone']",
  '.appWorkThresholdLine',
  '@keyframes appWorkThresholdArrive',
  "[data-work-session-state='working']",
]);
if (/animation[^;]*[5-9]\d\dms|animation[^;]*\d+s/.test(body)) failures.push('app-body-v3.css: حركة عتبة العمل يجب أن تبقى قصيرة وهادئة.');

if (failures.length) {
  console.error('\nWork threshold audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Work threshold audit passed: anatomy yields to a quiet work-zone posture, sessions start explicitly, and released work keeps its zone context.');
