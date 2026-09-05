// عقد جلسة العمل في الجسد الجديد.
// هذه الطبقة لا تنفذ منطق المعاملة ولا تقرر نجاحها؛ العضو التشغيلي يعلن البداية
// والخاتمة، والجسد يتولى وضعية الجلسة وتحرير مساحة العمل بعد التأكيد من الخادم.

export const WORK_SESSION_STATE = Object.freeze({
  IDLE: 'idle',
  WORKING: 'working',
  RELEASED: 'released',
});

// طبقات حياة الحقيقة التشغيلية. هذه ليست صفحات ولا حالات UI؛ هي قانون ملكية:
// الحقيقة تُسجّل أولًا، ثم قد يقرر المستخدم تجميعها في تسوية، ثم تدخل رحلة إجراء،
// وبعد ثبوت النتيجة يمكن أن تنتج وثيقة ثابتة أو تقريرًا مشتقًا منها.
export const WORK_JOURNEY_LAYER = Object.freeze({
  OPERATION: 'operation',
  SETTLEMENT: 'settlement',
  JOURNEY: 'journey',
  OUTPUT: 'output',
});

export const WORK_OUTPUT_KIND = Object.freeze({
  FIXED_TRANSACTION_DOCUMENT: 'fixed-transaction-document',
  DERIVED_STATEMENT: 'derived-statement',
});

// قانون مصدر الحقيقة قبل وبعد الأثر التنفيذي.
// ما دام المصدر لم ينتج اعتمادًا/صرفًا/تسوية/إقفالًا أو أثرًا خادميًا مماثلًا،
// فهو محرر الحقيقة نفسه ويُعدّل مباشرة؛ جميع المواضع الأخرى تعيد القراءة منه.
// بعد الأثر التنفيذي لا نعيد كتابة الماضي، بل ننشئ تغييرًا من تاريخ سريان جديد.
export const WORK_SOURCE_MUTABILITY_POLICY = Object.freeze({
  id: 'source-editable-until-consequence-v1',
  sourceOwnership: 'one-governed-source-owns-editing',
  uncommittedRule: 'source-remains-directly-editable-until-server-grounded-consequence',
  propagationRule: 'all-derived-surfaces-recompute-from-the-same-governed-source',
  noCopyRule: 'do-not-copy-a-value-into-another-portal-to-make-it-editable-there',
  consequenceGate: 'server-grounded-action-not-navigation-display-or-local-ui-state',
  consequenceExamples: Object.freeze([
    'paid-from-treasury',
    'approved-or-posted',
    'settled',
    'closed-period',
    'issued-fixed-transaction',
  ]),
  afterConsequenceRule: 'committed-history-is-immutable-future-change-uses-new-effective-version-or-governed-correction',
  originEditRule: 'edit-at-origin-and-reflect-everywhere-that-consumes-that-truth',
  presentationRule: 'reports-and-derived-views-never-own-source-mutation',
  bodyMustNotFreezeUncommittedSource: true,
  bodyMustNotMaintainParallelEditableCopies: true,
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

export const WORK_JOURNEY_POLICY = Object.freeze({
  id: 'operation-settlement-journey-output-v1',
  orderedLayers: Object.freeze([
    WORK_JOURNEY_LAYER.OPERATION,
    WORK_JOURNEY_LAYER.SETTLEMENT,
    WORK_JOURNEY_LAYER.JOURNEY,
    WORK_JOURNEY_LAYER.OUTPUT,
  ]),

  // «العملية تنتج الحقيقة، التسوية تحدد ما يدخل المعاملة، الرحلة تقرر مصيرها،
  // والتقرير يوثق النتيجة.»
  operationLaw: 'operational-fact-is-truth-not-automatically-an-action-transaction',
  settlementLaw: 'explicit-user-settlement-decision-selects-and-freezes-eligible-operational-facts',
  journeyLaw: 'cross-portal-action-begins-only-when-a-governed-transition-is-requested',
  outputLaw: 'output-documents-truth-and-never-creates-or-mutates-business-truth',

  // النوع التشغيلي لا يصبح requires_action لمجرد الكتابة اليومية. نقطة التحويل
  // (إرسال/تسوية/إقفال/طلب صرف...) هي التي تنشئ جلسة الإجراء عند استحقاقها.
  actionTriggerPolicy: 'requires-action-belongs-to-governed-transition-not-routine-operational-write',
  repeatedSettlementPolicy: 'same-operational-stream-may-produce-multiple-non-overlapping-settlements-over-time',
  sourceEligibilityPolicy: 'settlement-may-consume-only-eligible-unsettled-source-facts',
  settledSourceTracePolicy: 'consumed-operational-facts-remain-historical-and-traceable-to-their-settlement',
  snapshotPolicy: 'journey-submission-freezes-a-server-snapshot-of-the-settlement-or-source-state',
  returnPolicy: 'returned-work-reopens-the-original-source-journey-never-a-parallel-copy',
  crossPortalOwnershipPolicy: 'one-transaction-one-body-inbox-points-to-source-owner',

  // الطبقة الرابعة نوعان فقط: وثيقة معاملة ثابتة، أو تقرير مشتق من السجل.
  outputKinds: Object.freeze([
    WORK_OUTPUT_KIND.FIXED_TRANSACTION_DOCUMENT,
    WORK_OUTPUT_KIND.DERIVED_STATEMENT,
  ]),
  fixedOutputPolicy: 'approved-transaction-document-is-a-historical-snapshot-not-a-live-editor',
  derivedOutputPolicy: 'derived-statement-is-read-only-query-over-current-governed-ledger-and-does-not-create-a-transaction',
  reportTruthPolicy: 'report-does-not-create-truth-truth-creates-report',

  // العمال التابعون للمقاولين حقيقة تشغيلية للمشاريع، لا موظفو HR.
  contractorLaborPolicy: 'contractor-laborers-belong-to-project-operations-not-employee-hr-lifecycle',

  bodyMustNotPromoteOperationalFactToActionByItself: true,
  bodyMustNotCreateParallelCrossPortalTransaction: true,
  outputMustNotOwnBusinessMutation: true,
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
