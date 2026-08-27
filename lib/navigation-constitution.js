// دستور الملاحة — جزء ملزم من دستور أركان المكان، وليس إرشادًا بصريًا فقط.
// أي انتقال أو أداة جديدة يجب أن تحترم هذه القواعد قبل إضافة منطق محلي داخل الصفحة.

export const NAVIGATION_CONSTITUTION_VERSION = '1.1';

export const NAVIGATION_POLICY = Object.freeze({
  globalShell: 'always-visible',
  toolEntry: 'direct-to-tool-theater',
  toolParent: 'actual-launch-surface',
  backBehavior: 'one-logical-level',
  backPresses: 1,
  transientStates: 'never-user-visible',
  entryActivation: 'explicit-only',
  browserHistory: 'implementation-detail-not-ux-hierarchy',
  visibleDestinationUniqueness: 'one-entry-per-destination-per-level',
  duplicateNavigation: 'forbidden-within-same-portal-level',
});

export function navigationConstitution() {
  return {
    version: NAVIGATION_CONSTITUTION_VERSION,
    ...NAVIGATION_POLICY,
  };
}
