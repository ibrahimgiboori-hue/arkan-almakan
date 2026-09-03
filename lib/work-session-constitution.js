// عقد جلسة العمل في الجسد الجديد.
// هذه الطبقة لا تنفذ منطق المعاملة ولا تقرر نجاحها؛ العضو التشغيلي يعلن الخاتمة
// فقط بعد تأكيد الخادم، والجسد يتولى تحرير مساحة العمل من بقايا الجلسة المنتهية.

export const WORK_SESSION_STATE = Object.freeze({
  WORKING: 'working',
  RELEASED: 'released',
});

export const WORK_COMPLETION_KIND = Object.freeze({
  SAVED: 'saved',
  DRAFTED: 'drafted',
  SENT_FOR_REVIEW: 'sent-for-review',
  SENT_FOR_APPROVAL: 'sent-for-approval',
  SENT_FOR_AWARENESS: 'sent-for-awareness',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
});

export const WORK_COMPLETION_POLICY = Object.freeze({
  id: 'zero-residue-work-session-v1',
  unit: 'user-work-session-not-page',
  proceduralSurfaceRule: 'a-procedural-session-must-end-with-an-explicit-terminal-action',
  allowedTerminalActions: Object.freeze([
    WORK_COMPLETION_KIND.SAVED,
    WORK_COMPLETION_KIND.DRAFTED,
    WORK_COMPLETION_KIND.SENT_FOR_REVIEW,
    WORK_COMPLETION_KIND.SENT_FOR_APPROVAL,
    WORK_COMPLETION_KIND.SENT_FOR_AWARENESS,
    WORK_COMPLETION_KIND.APPROVED,
    WORK_COMPLETION_KIND.REJECTED,
    WORK_COMPLETION_KIND.RETURNED,
  ]),
  completionGate: 'server-confirmed-effect-only',
  releaseSequence: 'action-server-commit-audit-completion-surface-release',
  releaseBehavior: 'replace-active-route-organ-with-clean-completion-surface',
  residuePolicy: 'no-form-no-old-record-list-no-session-actions-after-release',
  historyPolicy: 'past-transactions-live-in-register-search-reports-not-under-active-work',
  nextWorkPolicy: 'completion-surface-may-offer-new-work-register-or-next-task-only',
  routeChangePolicy: 'new-route-starts-new-work-session',
  sameRouteRestartPolicy: 'explicit-reset-starts-new-work-session',
  viewOnlyExemption: true,

  // انتهاء الجلسة يخص المستخدم الحالي فقط. الكيان التشغيلي نفسه يحتفظ بهويته
  // وحالته وعلاقاته كي تعتمد عليه المراحل اللاحقة دون إعادة فتح المرحلة المكتملة.
  entityContinuityPolicy: 'release-user-session-preserve-entity-identity-and-current-business-state',
  innervationPolicy: 'completion-does-not-disconnect-entity-from-downstream-work',
  stageActionPolicy: 'old-stage-actions-retire-when-stage-closes',
  downstreamPolicy: 'new-stage-or-transaction-starts-new-session-against-persisted-source',

  bodyMustNotInferCompletionFromButtonClick: true,
  bodyMustNotInferCompletionFromToast: true,
  bodyMustNotOwnBusinessTransition: true,
});
