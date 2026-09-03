// بروتوكول الحراس: الحارس أداة إنذار، وليس سلطة أعلى من الدستور.
// أي قاعدة حراسة يمكن تعديلها عندما يوجد قانون مركزي صريح ومتفق عليه بين
// المبرمجين، ويجب عندها تحديث الحارس ليتبع القانون الجديد لا أن يجمد الماضي.

export const PROGRAMMER_AGREEMENT_PROTOCOL = Object.freeze({
  id: 'programmer-agreement-governance-v1',
  programmers: 'product-owner-and-implementation-programmer',
  authority: 'recorded-shared-law-over-guard',
  allGuardsAreAmendable: true,
  secretBypassForbidden: true,
  challenge: 'هل هذا القرار قانون متفق عليه بين المبرمجين ومثبت في المصدر المشترك؟',
  amendmentRequirements: Object.freeze([
    'explicit-law-id',
    'shared-owner-or-constitution-updated-first',
    'replacement-rule-is-clear',
    'affected-guards-updated-to-the-new-law',
    'no-page-local-exception-as-a-substitute-for-law',
  ]),
});

export const UX_DECISION_PROTOCOL = Object.freeze({
  id: 'programmer-ux-intent-v2',
  challenge: 'هل القرار صادر من المبرمجين لتحسين تجربة المستخدم ومثبت كقانون مشترك؟',
  approvalMeaning: 'explicit-shared-law-change-not-secret-bypass',
  compatibilityQuestions: Object.freeze([
    'هل بقي مصدر السلوك موحدًا؟',
    'هل القرار الجديد أوضح وأسهل للمستخدم؟',
    'هل تم تحديث الدستور أو المالك المشترك قبل الحارس؟',
    'هل اختفت الحاجة إلى ترقيع صفحة بعينها؟',
  ]),
});

export function guardConflict(message) {
  return `[GOVERNANCE_CONFLICT] ${message} ${PROGRAMMER_AGREEMENT_PROTOCOL.challenge} إذا نعم، فالحارس قديم ويجب تحديثه ليتبع القانون المشترك الجديد. إذا لا، فلا تستخدم تجاوزًا محليًا؛ أصلح المخالفة أو ثبّت القانون أولًا.`;
}

export function uxDecisionConflict(message) {
  return `[UX_DECISION] ${message} ${UX_DECISION_PROTOCOL.challenge} إذا نعم، ثبّت القرار في المصدر المركزي ثم حدّث الحارس. لا تستخدم كلمة سر سرية أو skip محلي.`;
}

// اسم توافق مؤقت لمن يستورده أثناء الهجرة. لا يعني وجود حارس غير قابل للتغيير.
export function hardInvariantFailure(message) {
  return guardConflict(message);
}
