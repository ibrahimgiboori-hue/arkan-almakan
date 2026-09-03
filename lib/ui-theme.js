export const UI_THEME_EVENT = 'arkan:ui-theme-changed';
export const DEFAULT_UI_THEME = 'sand';

export const UI_THEME_PRESETS = Object.freeze([
  Object.freeze({
    key:'sand',
    label:'رمل هادئ',
    description:'خلفية دافئة ومحايدة مع عنابي هادئ للعناصر النشطة.',
    preview:Object.freeze(['#f3f0e9','#fbfaf7','#171612','#74262d']),
  }),
  Object.freeze({
    key:'stone',
    label:'حجر دافئ',
    description:'رماديات دافئة منخفضة الضوضاء للجلوس الطويل أمام الشاشة.',
    preview:Object.freeze(['#f2f1ed','#fbfaf8','#1d1c1a','#50575a']),
  }),
  Object.freeze({
    key:'olive',
    label:'زيتوني هادئ',
    description:'محايد مائل للأخضر بدرجات مكتبية غير مشبعة.',
    preview:Object.freeze(['#f1f1e9','#fbfbf6','#1b201b','#4f6352']),
  }),
  Object.freeze({
    key:'mist',
    label:'ضباب أزرق',
    description:'رمادي مزرق بارد قليلًا مع تباين مريح وواضح.',
    preview:Object.freeze(['#f0f3f4','#fafcfc','#172126','#3e5e6f']),
  }),
]);

const THEME_KEYS = new Set(UI_THEME_PRESETS.map((item) => item.key));

export function normalizeUiTheme(value) {
  return THEME_KEYS.has(value) ? value : DEFAULT_UI_THEME;
}

export function applyUiTheme(value) {
  if (typeof document === 'undefined') return DEFAULT_UI_THEME;
  const theme = normalizeUiTheme(value);
  document.documentElement.dataset.appTheme = theme;
  return theme;
}
