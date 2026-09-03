// التعصيب المستمر في جسد أركان المكان.
// الجلسة تخص المستخدم وتُغلق، أما الكيان التشغيلي المكتمل فيبقى حقيقة قابلة
// للاعتماد عليها من مراحل ومعاملات وتقارير لاحقة دون إعادة فتح مرحلته القديمة.

export const INNERVATION_ROLE = Object.freeze({
  ACTIVE_STAGE: 'active-stage',
  PERSISTED_SOURCE: 'persisted-source',
  DERIVED_CONSUMER: 'derived-consumer',
  GOVERNED_CORRECTION: 'governed-correction',
});

export const PERSISTENT_INNERVATION_POLICY = Object.freeze({
  id: 'persistent-innervation-v1',
  principle: 'session-ends-fact-remains-links-continue',
  completionMeaning: 'close-current-stage-not-disconnect-entity',
  currentStageRule: 'actions-belong-to-current-stage-only',
  priorStageRule: 'completed-stage-actions-do-not-follow-entity-forward',
  downstreamRule: 'new-work-references-completed-source-without-reopening-it',
  reportingRule: 'reports-may-depend-on-completed-operational-facts',
  lineageRule: 'derived-work-keeps-source-reference-and-source-version-when-available',
  correctionRule: 'completed-facts-change-only-through-governed-correction-version-reversal-or-explicit-reopen',
  sessionSeparationRule: 'user-session-state-is-not-entity-business-state',
  persistenceRule: 'cross-transaction-dependency-truth-must-be-server-persisted',
  browserRule: 'browser-state-may-reflect-links-but-never-own-their-truth',
  genericRelationStoreRule: 'do-not-create-shared-relation-ledger-until-domain-model-review',
  historicalIntegrity: 'do-not-silently-mutate-a-source-already-consumed-downstream',
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

// هوية مستقرة لشيء تشغيلي داخل الجهاز العصبي. لا تستبدل مفتاح قاعدة البيانات
// ولا تنشئ حقيقة موازية؛ هي وصف موحّد تستخدمه طبقات الجسد أثناء الهجرة.
export function normalizeInnervationSubject(input = {}) {
  const entityType = clean(input.entityType || input.type);
  const entityId = clean(input.entityId || input.id);
  if (!entityType || !entityId) return null;

  return Object.freeze({
    entityType,
    entityId,
    stageKey:clean(input.stageKey || input.stage) || null,
    stateKey:clean(input.stateKey || input.state) || null,
    versionKey:clean(input.versionKey || input.version) || null,
    role:Object.values(INNERVATION_ROLE).includes(input.role)
      ? input.role
      : INNERVATION_ROLE.ACTIVE_STAGE,
  });
}

export function normalizeInnervationLink(input = {}) {
  const source = normalizeInnervationSubject(input.source || {});
  const target = normalizeInnervationSubject(input.target || {});
  const relation = clean(input.relation);
  if (!source || !target || !relation) return null;

  return Object.freeze({
    source,
    target,
    relation,
    serverPersisted:input.serverPersisted === true,
    referenceKey:clean(input.referenceKey) || null,
  });
}

export function canTreatAsPersistentLink(link) {
  return Boolean(link && link.serverPersisted === true && link.source && link.target && link.relation);
}
