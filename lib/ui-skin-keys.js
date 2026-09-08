// أسماء الجلود المرئية ثابتة ومستقلة عن أي تنفيذ بصري بعينه.
export const UI_SKIN_NATIVE_KEY = 'native';
export const UI_SKIN_SIGNATURE_KEY = 'signature';
export const UI_SKIN_STRESS_TEST_KEY = 'stress-test';

export const UI_SKIN_KEYS = Object.freeze([
  UI_SKIN_NATIVE_KEY,
  UI_SKIN_SIGNATURE_KEY,
  UI_SKIN_STRESS_TEST_KEY,
]);

const UI_SKIN_KEY_SET = new Set(UI_SKIN_KEYS);

export function normalizeUiSkinKey(value, fallback = UI_SKIN_NATIVE_KEY) {
  if (UI_SKIN_KEY_SET.has(value)) return value;
  return UI_SKIN_KEY_SET.has(fallback) ? fallback : UI_SKIN_NATIVE_KEY;
}
