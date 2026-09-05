// One switch controls which visual outfit is worn by the whole application.
// Business logic, routes, permissions and print behavior must never depend on this value.
export const ACTIVE_UI_SKIN_KEY = 'native';
export const UI_SKIN_STRESS_TEST_KEY = 'stress-test';

export const UI_SKIN_KEYS = Object.freeze([
  ACTIVE_UI_SKIN_KEY,
  UI_SKIN_STRESS_TEST_KEY,
]);
