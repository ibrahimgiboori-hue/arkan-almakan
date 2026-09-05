// دستور تجربة البوابات: سلوك مشترك يطبق على كل بوابة دون منطق محلي مكرر.
export const PORTAL_EXPERIENCE_POLICY = Object.freeze({
  id: 'unified-portal-experience-v2',

  navigation: Object.freeze({
    id: 'single-source-context-navigation-v2',
    model: 'portal-groups-from-one-catalog',
    keyboard: Object.freeze(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']),
    commandShortcut: 'Alt+M',
    rtlForwardKey: 'ArrowLeft',
    rtlBackKey: 'ArrowRight',
    focusPolicy: 'focus-active-destination-when-open-and-return-focus-on-close',
    activeDestinationPolicy: 'aria-current-page',
  }),

  records: Object.freeze({
    id: 'record-ledger-keyboard-v2',
    model: 'one-row-one-primary-destination',
    keyboard: Object.freeze(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Enter']),
    pageJumpRows: 8,
    selectionPolicy: 'selection-is-state-not-navigation',
    focusPolicy: 'row-roving-focus',
  }),

  forms: Object.freeze({
    id: 'native-form-safety-v2',
    validationPolicy: 'focus-first-invalid-near-source',
    invalidState: 'aria-invalid',
    duplicateSubmitGuardMs: 1200,
    fieldRecovery: 'clear-invalid-on-input',
    saveShortcut: 'CtrlOrMeta+S',
    numericLocalePolicy: 'accept-arabic-indic-digits-and-normalize-on-paste-or-blur',
    numberWheelPolicy: 'focused-number-input-never-mutates-by-wheel',
  }),

  feedback: Object.freeze({
    id: 'semantic-feedback-v1',
    successRole: 'status',
    errorRole: 'alert',
    livePolicy: 'polite-unless-error',
  }),

  ledgers: Object.freeze({
    id: 'ledger-scroll-and-focus-v2',
    overflowPolicy: 'horizontal-scroll-with-sticky-head-and-edge-awareness',
    focusPolicy: 'focusable-ledger-frame',
    scrollbarPolicy: 'stable-gutter',
    edgeStatePolicy: 'start-middle-end',
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
