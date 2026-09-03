export const UX_DECISION_PROTOCOL = Object.freeze({
  id: 'programmer-ux-intent-v1',
  challenge: 'هل القرار صادر من المبرمج لتحسين تجربة المستخدم؟',
  approvalMeaning: 'explicit-central-policy-change-not-secret-bypass',
  compatibilityRequirements: Object.freeze([
    'shared-system-source-preserved',
    'permissions-and-security-preserved',
    'data-integrity-preserved',
    'business-rules-preserved',
    'shared-owner-updated-instead-of-page-local-patch',
  ]),
});

export function uxDecisionFailure(message) {
  return `[UX_DECISION] ${message} ${UX_DECISION_PROTOCOL.challenge} إذا نعم، غيّر القرار في المصدر المركزي المشترك أولًا وتأكد أن الصلاحيات والبيانات ومنطق الأعمال لم تتغير؛ عندها يجب أن يتبع الحارس الدستور الجديد بدل حفظ الشكل القديم.`;
}

export function hardInvariantFailure(message) {
  return `[SYSTEM_INVARIANT] ${message} هذا ليس قرار تجربة مستخدم ولا يجوز تجاوزه بإعلان UX.`;
}
