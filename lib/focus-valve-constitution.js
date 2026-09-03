// صمام التركيز في الجسد الجديد.
// وظيفته تنظيم ما يراه المستخدم حسب حالة العمل، لا تنفيذ منطق العضو ولا تغيير بياناته.
// السجل يبقى موجودًا في النظام، لكنه لا يزاحم المعاملة التي يعمل عليها المستخدم.

export const FOCUS_VALVE_STATE = Object.freeze({
  READY: 'ready',
  FOCUSED: 'focused',
  WORKING: 'working',
});

export const FOCUS_REGION = Object.freeze({
  READY: 'ready',
  REGISTER: 'register',
  WORK: 'work',
  CONTEXT: 'context',
});

export const FOCUS_VALVE_POLICY = Object.freeze({
  id: 'work-focus-valve-v1',
  purpose: 'show-only-what-serves-the-current-user-intent',
  cycle: 'ready-focus-work-complete-release-ready',
  readyState: 'entry-and-register-visible-work-hidden',
  focusedState: 'current-entity-context-and-work-visible-register-and-entry-hidden',
  workingState: 'current-entity-context-and-work-visible-register-and-entry-hidden',
  releaseOwner: 'zero-residue-work-session',
  historyPolicy: 'history-remains-queryable-but-never-stacks-under-current-work',
  dataPolicy: 'visibility-only-never-delete-never-mutate-business-data',
  statePolicy: 'organ-declares-focus-state-body-does-not-infer-from-dom-shape',
  navigationPolicy: 'leaving-focus-is-navigation-not-a-fake-business-completion',
  dirtyWorkPolicy: 'future-dirty-guard-must-block-or-govern-unsafe-leave',
  organAdoption: 'opt-in-per-organ-during-migration',
  bodyMustNotInferFocusFromCssSelectors: true,
  bodyMustNotDeleteHiddenRegions: true,
  bodyMustNotTreatFocusAsBusinessStatus: true,
});

export function normalizeFocusValveState(value) {
  return Object.values(FOCUS_VALVE_STATE).includes(value)
    ? value
    : FOCUS_VALVE_STATE.READY;
}

export function focusRegionVisible(state, region) {
  const current = normalizeFocusValveState(state);
  if (region === FOCUS_REGION.CONTEXT) return true;
  if (current === FOCUS_VALVE_STATE.READY) {
    return region === FOCUS_REGION.READY || region === FOCUS_REGION.REGISTER;
  }
  return region === FOCUS_REGION.WORK;
}
