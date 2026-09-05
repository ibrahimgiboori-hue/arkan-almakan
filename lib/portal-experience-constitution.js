// دستور تجربة البوابات: خمس قواعد مشتركة تطبق على كل بوابة دون منطق محلي مكرر.
export const PORTAL_EXPERIENCE_POLICY = Object.freeze({
  id: 'unified-portal-experience-v1',

  navigation: Object.freeze({
    id: 'single-source-context-navigation-v1',
    model: 'portal-groups-from-one-catalog',
    keyboard: Object.freeze(['ArrowUp', 'ArrowDown', 'Home', 'End']),
    commandShortcut: 'Alt+M',
    focusPolicy: 'focus-active-destination-when-open',
    activeDestinationPolicy: 'aria-current-page',
  }),

  records: Object.freeze({
    id: 'record-ledger-keyboard-v1',
    model: 'one-row-one-primary-destination',
    keyboard: Object.freeze(['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter']),
    selectionPolicy: 'selection-is-state-not-navigation',
    focusPolicy: 'row-roving-focus',
  }),

  forms: Object.freeze({
    id: 'native-form-safety-v1',
    validationPolicy: 'focus-first-invalid-near-source',
    invalidState: 'aria-invalid',
    duplicateSubmitGuardMs: 1200,
    fieldRecovery: 'clear-invalid-on-input',
  }),

  feedback: Object.freeze({
    id: 'semantic-feedback-v1',
    successRole: 'status',
    errorRole: 'alert',
    livePolicy: 'polite-unless-error',
  }),

  ledgers: Object.freeze({
    id: 'ledger-scroll-and-focus-v1',
    overflowPolicy: 'horizontal-scroll-with-sticky-head',
    focusPolicy: 'focusable-ledger-frame',
    scrollbarPolicy: 'stable-gutter',
  }),
});

export function portalExperienceDataAttributes() {
  return Object.freeze({
    'data-portal-experience': PORTAL_EXPERIENCE_POLICY.id,
    'data-navigation-behavior': PORTAL_EXPERIENCE_POLICY.navigation.id,
    'data-record-behavior': PORTAL_EXPERIENCE_POLICY.records.id,
    'data-form-behavior': PORTAL_EXPERIENCE_POLICY.forms.id,
    'data-feedback-behavior': PORTAL_EXPERIENCE_POLICY.feedback.id,
    'data-ledger-behavior-global': PORTAL_EXPERIENCE_POLICY.ledgers.id,
  });
}
