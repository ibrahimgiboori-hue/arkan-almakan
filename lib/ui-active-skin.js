// One switch controls which visual outfit is worn by the whole application.
// Business logic, routes, permissions and print behavior must never depend on this value.
import {
  UI_SKIN_KEYS,
  UI_SKIN_NATIVE_KEY,
  UI_SKIN_SIGNATURE_KEY,
  UI_SKIN_STRESS_TEST_KEY,
  normalizeUiSkinKey,
} from '@/lib/ui-skin-keys';

// ARKAN SIGNATURE is the approved program tuxedo. Changing this one value remains
// sufficient to repaint the complete screen UI without touching business behavior.
export const ACTIVE_UI_SKIN_KEY = UI_SKIN_SIGNATURE_KEY;

export {
  UI_SKIN_KEYS,
  UI_SKIN_NATIVE_KEY,
  UI_SKIN_SIGNATURE_KEY,
  UI_SKIN_STRESS_TEST_KEY,
};

export function activeUiSkinKey() {
  return normalizeUiSkinKey(ACTIVE_UI_SKIN_KEY, UI_SKIN_SIGNATURE_KEY);
}
