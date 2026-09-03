// عقد جلسة العمل في الجسد الجديد.
// هذه الطبقة لا تنفذ منطق المعاملة ولا تقرر نجاحها؛ العضو التشغيلي يعلن البداية
// والخاتمة، والجسد يتولى وضعية الجلسة وتحرير مساحة العمل بعد التأكيد من الخادم.

export const WORK_SESSION_STATE = Object.freeze({
  IDLE: 'idle',
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

export const WORK_LEAVE_DECISION = Object.freeze({
  CONTINUE: 'continue-working',
  SAVE_DRAFT: 'save-draft-and-leave',
  DISCARD: 'discard-and-leave',
});

export const WORK_COMPLETION_POLICY = Object.freeze({
  id: 'zero-residue-work-session-v2',
  unit: 'user-work-session-not-page',
  idleRule: 'being-in-a-work-zone-does-not-mean-a-work-session-has-started',
  beginRule: 'working-starts-only-after-explicit-organ-or-connected-action-signal',
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

  // قانون الملاحة الجديد: المكان يقود داخله، والملاحة لا تملك حق قتل عمل حي.
  placeNavigationLaw: 'place-leads-inside-navigation-moves-between-places-or-siblings',
  routeChangePolicy: 'live-work-must-be-resolved-before-route-release',
  unsavedWorkPolicy: 'navigation-cannot-silently-abandon-dirty-work',
  leaveChoices: Object.freeze([
    WORK_LEAVE_DECISION.CONTINUE,
    WORK_LEAVE_DECISION.SAVE_DRAFT,
    WORK_LEAVE_DECISION.DISCARD,
  ]),
  draftPolicy: 'draft-preserves-editable-work-state-without-creating-business-effect',
  draftOwnershipPolicy: 'the-organ-owns-draft-persistence-the-body-only-orchestrates-leaving',
  discardPolicy: 'discard-requires-explicit-user-decision-and-removes-only-uncommitted-work',
  unloadPolicy: 'browser-leave-warns-while-dirty',
  navigationInterceptionPolicy: 'internal-navigation-requests-pass-through-one-work-session-gate',
  consequentialDraftRule: 'draft-never-means-approved-sent-posted-paid-or-issued',

  sameRouteRestartPolicy: 'explicit-reset-returns-to-idle-until-new-work-begins',
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
  bodyMustNotInventDraftPersistence: true,
});
