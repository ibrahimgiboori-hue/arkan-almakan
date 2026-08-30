export const PRINT_LAYOUT_SETTINGS_VERSION = 4;
export const PRINT_FONT_STEP_PT = 0.5;
export const PRINT_FONT_MIN_DELTA_PT = -3;
export const PRINT_FONT_MAX_DELTA_PT = 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

export function normalizePrintFontDelta(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const stepped = Math.round(number / PRINT_FONT_STEP_PT) * PRINT_FONT_STEP_PT;
  return clamp(stepped, PRINT_FONT_MIN_DELTA_PT, PRINT_FONT_MAX_DELTA_PT);
}

export function normalizePrintLayoutSettings(settings = {}, defaults = {}) {
  return {
    ...settings,
    sideMm:Number.isFinite(Number(settings.sideMm)) ? Number(settings.sideMm) : Number(defaults.sideMm || 0),
    grids:{ ...(settings.grids || {}) },
    rows:{ ...(settings.rows || {}) },
    typography:{
      ...(settings.typography || {}),
      fontDeltaPt:normalizePrintFontDelta(settings.typography?.fontDeltaPt ?? defaults.fontDeltaPt ?? 0),
    },
  };
}

export function mergePrintLayoutSettings(familySettings = {}, documentSettings = {}, defaults = {}) {
  return normalizePrintLayoutSettings({
    ...familySettings,
    ...documentSettings,
    grids:{
      ...(familySettings.grids || {}),
      ...(documentSettings.grids || {}),
    },
    rows:{
      ...(familySettings.rows || {}),
      ...(documentSettings.rows || {}),
    },
    typography:{
      ...(familySettings.typography || {}),
      ...(documentSettings.typography || {}),
    },
  }, defaults);
}

export function printTypographyStyle(settings = {}) {
  const delta = normalizePrintFontDelta(settings.typography?.fontDeltaPt || 0);
  return { '--print-font-delta':`${delta}pt` };
}
