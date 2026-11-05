/**
 * Page geometry — the single source of the A4 safe area.
 *
 * The owner sets four safe areas once (top, bottom, right, left — in mm, measured
 * on the portrait letterhead sheet) in app_settings. Every printed page derives
 * its content box from those four numbers. A single document may override any
 * edge explicitly; nothing else (family presets, Word defaults, hard-coded
 * letterhead profiles) decides the margins any more.
 *
 * Pure module: no React, no Supabase — so it is unit-tested directly.
 */

export const PAGE_SAFE_AREA_COLUMNS = Object.freeze({
  topMm: 'page_safe_top_mm',
  bottomMm: 'page_safe_bottom_mm',
  rightMm: 'page_safe_right_mm',
  leftMm: 'page_safe_left_mm',
});

export const PAGE_SAFE_AREA_EDGES = Object.freeze(['topMm', 'bottomMm', 'rightMm', 'leftMm']);

// Effective portrait geometry before central safe areas existed
// (letterhead artwork + Word clearance on top/bottom, Word body margin on the sides).
// Used only when app_settings has no value yet, so nothing moves on first deploy.
export const PAGE_SAFE_AREA_FALLBACK = Object.freeze({ topMm: 46.9, bottomMm: 31.8, rightMm: 25.4, leftMm: 25.4 });

export const PAGE_SAFE_AREA_LIMITS = Object.freeze({ minMm: 0, maxMm: 90, minContentMm: 60 });

export const PAPER_MM = Object.freeze({
  portrait: Object.freeze({ widthMm: 210, heightMm: 297 }),
  landscape: Object.freeze({ widthMm: 297, heightMm: 210 }),
});

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clampEdge = (value) => Math.min(PAGE_SAFE_AREA_LIMITS.maxMm, Math.max(PAGE_SAFE_AREA_LIMITS.minMm, value));
const round1 = (value) => Math.round(value * 10) / 10;

/** The four central values from an app_settings row (fallback per missing edge). */
export function centralSafeArea(settings = {}) {
  const out = {};
  for (const edge of PAGE_SAFE_AREA_EDGES) {
    const value = finite(settings?.[PAGE_SAFE_AREA_COLUMNS[edge]]);
    out[edge] = round1(clampEdge(value ?? PAGE_SAFE_AREA_FALLBACK[edge]));
  }
  return out;
}

/** Explicit per-document edges (from a document-scope override); unknown/blank edges are ignored. */
export function documentSafeAreaOverride(settings = {}) {
  const out = {};
  for (const edge of PAGE_SAFE_AREA_EDGES) {
    const value = finite(settings?.[edge]);
    if (value !== null) out[edge] = round1(clampEdge(value));
  }
  return out;
}

/**
 * Resolve the physical content box for one page.
 *
 * - Central values describe the portrait letterhead sheet.
 * - When the letterhead runs along the long sides (landscape with a preprinted or
 *   rotated digital letterhead) the four values rotate with the paper.
 * - Plain paper (no letterhead) uses the side margin on every edge.
 * - A document override replaces individual edges after rotation is applied to
 *   the central values, i.e. overrides are always in physical page coordinates.
 */
export function resolvePageSafeArea({
  central,
  override = {},
  orientation = 'portrait',
  letterheadSource = 'digital',
  paperRotation = 'clockwise',
  sideReservedLetterhead = false,
} = {}) {
  const base = central || centralSafeArea();
  let physical;

  if (letterheadSource === 'none') {
    const side = Math.min(base.rightMm, base.leftMm);
    physical = { topMm: side, bottomMm: side, rightMm: side, leftMm: side };
  } else if (orientation === 'landscape' && sideReservedLetterhead) {
    physical = paperRotation === 'counterclockwise'
      ? { topMm: base.rightMm, bottomMm: base.leftMm, rightMm: base.bottomMm, leftMm: base.topMm }
      : { topMm: base.leftMm, bottomMm: base.rightMm, rightMm: base.topMm, leftMm: base.bottomMm };
  } else {
    physical = { ...base };
  }

  return { ...physical, ...documentSafeAreaOverride(override) };
}

/**
 * Human-readable problems with a safe area (Arabic). Never blocks: the owner decides.
 * `artwork` = measured letterhead artwork depth in mm ({ topMm, bottomMm }), optional.
 */
export function safeAreaWarnings(area, { orientation = 'portrait', artwork } = {}) {
  const paper = PAPER_MM[orientation] || PAPER_MM.portrait;
  const warnings = [];
  const contentWidth = paper.widthMm - area.rightMm - area.leftMm;
  const contentHeight = paper.heightMm - area.topMm - area.bottomMm;
  if (contentWidth < PAGE_SAFE_AREA_LIMITS.minContentMm) warnings.push(`عرض المحتوى ${round1(contentWidth)} مم فقط — قلّل الهامشين الأيمن والأيسر.`);
  if (contentHeight < PAGE_SAFE_AREA_LIMITS.minContentMm) warnings.push(`ارتفاع المحتوى ${round1(contentHeight)} مم فقط — قلّل الهامشين العلوي والسفلي.`);
  if (area.rightMm < 5 || area.leftMm < 5) warnings.push('أغلب الطابعات لا تطبع على أقل من 5 مم من حافة الورقة.');
  if (artwork && orientation === 'portrait') {
    if (Number.isFinite(artwork.topMm) && area.topMm < artwork.topMm) warnings.push(`الهامش العلوي (${area.topMm} مم) أقل من رسم الترويسة (${round1(artwork.topMm)} مم) — قد يتداخل المحتوى مع الترويسة.`);
    if (Number.isFinite(artwork.bottomMm) && area.bottomMm < artwork.bottomMm) warnings.push(`الهامش السفلي (${area.bottomMm} مم) أقل من رسم التذييل (${round1(artwork.bottomMm)} مم) — قد يتداخل المحتوى مع التذييل.`);
  }
  return warnings;
}

/** Content box size in mm for a resolved area. */
export function contentBoxMm(area, orientation = 'portrait') {
  const paper = PAPER_MM[orientation] || PAPER_MM.portrait;
  return {
    widthMm: round1(paper.widthMm - area.rightMm - area.leftMm),
    heightMm: round1(paper.heightMm - area.topMm - area.bottomMm),
  };
}

/** Validate and normalise user input before saving to app_settings. Returns { ok, values, errors }. */
export function normaliseSafeAreaInput(input = {}) {
  const errors = [];
  const values = {};
  for (const edge of PAGE_SAFE_AREA_EDGES) {
    const value = finite(input[edge]);
    if (value === null) { errors.push(`قيمة الهامش ${edgeLabelAr(edge)} مطلوبة.`); continue; }
    if (value < PAGE_SAFE_AREA_LIMITS.minMm || value > PAGE_SAFE_AREA_LIMITS.maxMm) {
      errors.push(`قيمة الهامش ${edgeLabelAr(edge)} يجب أن تكون بين ${PAGE_SAFE_AREA_LIMITS.minMm} و${PAGE_SAFE_AREA_LIMITS.maxMm} مم.`);
      continue;
    }
    values[PAGE_SAFE_AREA_COLUMNS[edge]] = round1(value);
  }
  if (!errors.length) {
    const box = contentBoxMm({
      topMm: values.page_safe_top_mm, bottomMm: values.page_safe_bottom_mm,
      rightMm: values.page_safe_right_mm, leftMm: values.page_safe_left_mm,
    });
    if (box.widthMm < PAGE_SAFE_AREA_LIMITS.minContentMm || box.heightMm < PAGE_SAFE_AREA_LIMITS.minContentMm) {
      errors.push(`المساحة المتبقية للمحتوى صغيرة جدًا (${box.widthMm} × ${box.heightMm} مم).`);
    }
  }
  return { ok: errors.length === 0, values, errors };
}

export function edgeLabelAr(edge) {
  return { topMm: 'العلوي', bottomMm: 'السفلي', rightMm: 'الأيمن', leftMm: 'الأيسر' }[edge] || edge;
}
