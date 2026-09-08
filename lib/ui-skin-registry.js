import {
  UI_SKIN_NATIVE_KEY,
  UI_SKIN_SIGNATURE_KEY,
  UI_SKIN_STRESS_TEST_KEY,
  normalizeUiSkinKey,
} from '@/lib/ui-skin-keys';

// سجل البدلات المرئية. هذا الملف يصف «كيف تُلبس الواجهة» فقط؛
// لا صلاحيات، لا حسابات، لا قواعد أعمال، ولا أي منطق طباعة.
export const UI_SKIN_REGISTRY = Object.freeze({
  [UI_SKIN_NATIVE_KEY]:Object.freeze({
    key:UI_SKIN_NATIVE_KEY,
    label:'Native semantic skin',
    rootEntry:'app/ui-active-skin.css',
    dashboardEntry:'app/dashboard/ui-active-dashboard-skin.css',
    runtime:'none',
  }),
  [UI_SKIN_SIGNATURE_KEY]:Object.freeze({
    key:UI_SKIN_SIGNATURE_KEY,
    label:'ARKAN SIGNATURE — approved tuxedo',
    rootEntry:'app/ui-active-skin.css',
    dashboardEntry:'app/dashboard/ui-active-dashboard-skin.css',
    runtime:'signature-scenes',
  }),
  [UI_SKIN_STRESS_TEST_KEY]:Object.freeze({
    key:UI_SKIN_STRESS_TEST_KEY,
    label:'Replaceability stress skin',
    rootEntry:'app/ui-active-skin.css',
    dashboardEntry:'app/dashboard/ui-active-dashboard-skin.css',
    runtime:'none',
  }),
});

export function uiSkinDefinition(value) {
  const key = normalizeUiSkinKey(value, UI_SKIN_NATIVE_KEY);
  return UI_SKIN_REGISTRY[key];
}

export function uiSkinUsesRuntime(value, runtime) {
  return uiSkinDefinition(value)?.runtime === runtime;
}
