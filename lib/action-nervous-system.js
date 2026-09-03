// الجهاز العصبي للإجراءات في الجسد الجديد.
// لا ينفذ منطق الأعضاء ولا يقرر نجاح الخادم؛ ينظم الإشارة بين المستخدم والعضو
// ويمنع الازدواج ويحوّل النجاح المؤكد فقط إلى Feedback/خاتمة موحدة.
import { normalizeInnervationSubject } from './persistent-innervation';

export const ACTION_SIGNAL_STATE = Object.freeze({
  READY: 'ready',
  ACTING: 'acting',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
});

export const ACTION_NERVOUS_SYSTEM_POLICY = Object.freeze({
  id: 'hybrid-action-nervous-system-v1',
  architecture: 'central-core-gradual-organ-adoption',
  legacyInterop: 'old-organs-continue-unchanged-until-explicitly-connected',
  actionFlow: 'user-signal-organ-server-organ-confirmation-nervous-system',
  currentStageFlow: 'action-signal-belongs-to-entity-current-stage-only',
  completionFlow: 'confirmed-terminal-action-releases-user-session-without-disconnecting-entity',
  persistentInnervation: 'completed-entity-remains-server-addressable-as-downstream-source',
  duplicateProtection: 'one-active-instance-per-action-key',
  successGate: 'explicit-server-confirmed-result',
  completionGate: 'explicit-server-confirmed-completion-only',
  dependencyGate: 'only-server-persisted-links-are-treated-as-cross-transaction-truth',
  errorPlacement: 'near-action-origin-first',
  globalFeedback: 'quiet-delayed-status-only-when-useful',
  visualPolicy: 'no-modal-no-screen-jump-no-celebration-animation',
  migrationPolicy: 'opt-in-per-action-never-global-monkey-patch',
  bodyMustNotExecuteBusinessLogic: true,
  bodyMustNotInferSuccessFromResolvedPromise: true,
  bodyMustNotInferSuccessFromToast: true,
  bodyMustNotInferCompletionFromButtonClick: true,
  bodyMustNotReopenCompletedStageForDownstreamUse: true,
});

export function normalizeActionSignalSpec(input = {}) {
  const key = String(input.key || '').trim();
  if (!key) throw new Error('Action nervous system requires a stable action key');
  return Object.freeze({
    key,
    label:String(input.label || '').trim() || 'الإجراء',
    showGlobalProgress:input.showGlobalProgress !== false,
    subject:normalizeInnervationSubject(input.subject || input.innervationSubject || {}),
  });
}
