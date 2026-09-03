import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const requireText = (rel, values) => {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel}: الملف البنيوي مفقود`);
    return '';
  }
  const text = read(rel);
  for (const value of values) if (!text.includes(value)) failures.push(`${rel}: مفقود ${value}`);
  return text;
};

const innervation = requireText('lib/persistent-innervation.js', [
  'persistent-innervation-v1',
  'session-ends-fact-remains-links-continue',
  'actions-belong-to-current-stage-only',
  'completed-stage-actions-do-not-follow-entity-forward',
  'new-work-references-completed-source-without-reopening-it',
  'cross-transaction-dependency-truth-must-be-server-persisted',
  'browser-state-may-reflect-links-but-never-own-their-truth',
  'do-not-create-shared-relation-ledger-until-domain-model-review',
  'do-not-silently-mutate-a-source-already-consumed-downstream',
  'normalizeInnervationSubject',
  'normalizeInnervationLink',
  'canTreatAsPersistentLink',
]);
if (/localStorage|sessionStorage/.test(innervation)) failures.push('persistent innervation: الحقيقة التشغيلية لا يجوز أن تعيش في تخزين المتصفح.');

const nerve = requireText('lib/action-nervous-system.js', [
  'hybrid-action-nervous-system-v1',
  'central-core-gradual-organ-adoption',
  'action-signal-belongs-to-entity-current-stage-only',
  'confirmed-terminal-action-releases-user-session-without-disconnecting-entity',
  'completed-entity-remains-server-addressable-as-downstream-source',
  'only-server-persisted-links-are-treated-as-cross-transaction-truth',
  'bodyMustNotReopenCompletedStageForDownstreamUse',
  'normalizeInnervationSubject',
]);

const nerveRuntime = requireText('components/ui/ActionNervousSystemRuntime.js', [
  "from '@/lib/persistent-innervation'",
  'persistentLinksFrom',
  'canTreatAsPersistentLink',
  'serverConfirmed === true',
  'persistentInnervationLinks',
  'subject:result.completion.subject || spec.subject || null',
  'data-action-entity-type',
  'data-action-stage',
]);
if (/localStorage|sessionStorage/.test(nerveRuntime)) failures.push('ActionNervousSystemRuntime: الجهاز العصبي لا يجوز أن يمتلك حقيقة العلاقات في المتصفح.');

const session = requireText('lib/work-session-constitution.js', [
  'release-user-session-preserve-entity-identity-and-current-business-state',
  'completion-does-not-disconnect-entity-from-downstream-work',
  'old-stage-actions-retire-when-stage-closes',
  'new-stage-or-transaction-starts-new-session-against-persisted-source',
]);

const sessionRuntime = requireText('components/ui/WorkSessionRuntime.js', [
  'normalizeInnervationSubject',
  'data-completed-entity-type',
  'data-completed-stage',
]);

const action = requireText('components/ui/ProgramAction.js', [
  'const subject = spec.subject || spec.innervationSubject || null',
  '{ key:spec.key, label:spec.label, subject }',
  'data-action-entity-type',
  'data-action-stage',
  "legacy-pass-through",
]);
if (!action.includes("typeof execute !== 'function'")) failures.push('ProgramAction: الهجرة الهجينة فقدت ممر الأعضاء القديمة غير الموصولة.');

const layout = requireText('app/dashboard/layout.js', [
  "import ActionNervousSystemRuntime from '@/components/ui/ActionNervousSystemRuntime'",
  '<ActionNervousSystemRuntime>',
  '</ActionNervousSystemRuntime>',
]);
if (!layout.includes('<WorkSessionRuntime>') || layout.indexOf('<WorkSessionRuntime>') > layout.indexOf('<ActionNervousSystemRuntime>')) {
  failures.push('dashboard layout: يجب أن يعيش الجهاز العصبي داخل عقد جلسة العمل حتى يستطيع تسليم الخاتمة دون امتلاكها.');
}

if (failures.length) {
  console.error('\nPersistent innervation audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Persistent innervation audit passed: sessions release cleanly while completed operational facts remain server-grounded sources for later stages and transactions.');
