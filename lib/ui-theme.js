export const UI_THEME_EVENT = 'arkan:ui-theme-changed';
export const DEFAULT_UI_THEME = 'light';

export const UI_THEME_PRESETS = Object.freeze([
  Object.freeze({
    key:'light',
    label:'نهاري مريح',
    description:'هوية أركان منخفضة الوهج بخلفيات حجرية دافئة وعنابي هادئ للعمل الطويل.',
    preview:Object.freeze(['#e7e1d8','#eeeae3','#262b28','#74363f']),
  }),
  Object.freeze({
    key:'dark',
    label:'ليلي مريح',
    description:'نسخة داكنة هادئة تحافظ على نفس الشخصية والتباين من دون سواد حاد.',
    preview:Object.freeze(['#1f2321','#2b302d','#ece8e1','#a65a67']),
  }),
]);

const THEME_KEYS = new Set(UI_THEME_PRESETS.map((item) => item.key));
const LEGACY_LIGHT_THEMES = new Set(['sand','stone','olive','mist']);

export function normalizeUiTheme(value) {
  if (THEME_KEYS.has(value)) return value;
  if (LEGACY_LIGHT_THEMES.has(value)) return 'light';
  return DEFAULT_UI_THEME;
}

export function applyUiTheme(value) {
  if (typeof document === 'undefined') return DEFAULT_UI_THEME;
  const theme = normalizeUiTheme(value);
  document.documentElement.dataset.appTheme = theme;
  return theme;
}
