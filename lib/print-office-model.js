export const PRINT_OFFICE_MODEL_VERSION = '2.0';

export const OFFICE_BLOCK_KIND = Object.freeze({
  INFO: 'info',
  SUMMARY: 'summary',
  PROSE: 'prose',
  TABLE: 'table',
  LETTERHEAD: 'letterhead',
  PARTIES: 'parties',
  SIGNATURES: 'signatures',
  STAMP: 'stamp',
});

export const OFFICE_SPLIT_POLICY = Object.freeze({
  KEEP: 'keep',
  FLOW: 'flow',
  ROWS: 'rows',
});

export const OFFICE_GRID_COLUMNS = 12;
export const OFFICE_FIELD_GRID_COLUMNS = 48;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

export function normalizeOfficeSpan(value, fallback = OFFICE_GRID_COLUMNS) {
  const span = Number(value);
  if (!Number.isFinite(span)) return fallback;
  return Math.round(clamp(span, 1, OFFICE_GRID_COLUMNS));
}

export function normalizeOfficeFieldSpan(value, fallback = 12) {
  const span = Number(value);
  if (!Number.isFinite(span)) return fallback;
  return Math.round(clamp(span, 4, OFFICE_FIELD_GRID_COLUMNS));
}

export function resolveOfficeBlockKind(section = {}) {
  if (section.kind === 'table') return OFFICE_BLOCK_KIND.TABLE;
  if (section.kind === 'totals') return OFFICE_BLOCK_KIND.SUMMARY;
  if (section.kind === 'text') return OFFICE_BLOCK_KIND.PROSE;
  if (section.kind === 'letterhead') return OFFICE_BLOCK_KIND.LETTERHEAD;
  if (section.kind === 'parties') return OFFICE_BLOCK_KIND.PARTIES;
  if (section.kind === 'signatures') return OFFICE_BLOCK_KIND.SIGNATURES;
  if (section.kind === 'stampbox') return OFFICE_BLOCK_KIND.STAMP;
  return OFFICE_BLOCK_KIND.INFO;
}

export function defaultOfficeBlockSpan(section = {}) {
  if (section.officeSpan != null) return normalizeOfficeSpan(section.officeSpan);
  const kind = resolveOfficeBlockKind(section);
  if (kind === OFFICE_BLOCK_KIND.INFO || kind === OFFICE_BLOCK_KIND.SUMMARY) return 6;
  return OFFICE_GRID_COLUMNS;
}

export function resolveOfficeSplitPolicy(section = {}) {
  if (section.split === OFFICE_SPLIT_POLICY.KEEP || section.split === OFFICE_SPLIT_POLICY.FLOW || section.split === OFFICE_SPLIT_POLICY.ROWS) {
    return section.split;
  }
  const kind = resolveOfficeBlockKind(section);
  if (kind === OFFICE_BLOCK_KIND.TABLE) return OFFICE_SPLIT_POLICY.ROWS;
  if (kind === OFFICE_BLOCK_KIND.PROSE) return OFFICE_SPLIT_POLICY.FLOW;
  return OFFICE_SPLIT_POLICY.KEEP;
}

export function resolveOfficeFieldSpan(field = {}, section = {}) {
  if (field.officeSpan != null) return normalizeOfficeFieldSpan(field.officeSpan);
  if (field.span != null) return normalizeOfficeFieldSpan(field.span);

  const columns = clamp(section.fieldColumns || section.columnsCount || 4, 1, 4);
  return Math.max(4, Math.round(OFFICE_FIELD_GRID_COLUMNS / columns));
}

export function officeBlockDescriptor(section = {}) {
  return Object.freeze({
    id: section.id || section.key || section.kind || 'block',
    kind: resolveOfficeBlockKind(section),
    span: defaultOfficeBlockSpan(section),
    split: resolveOfficeSplitPolicy(section),
    canShareRow: section.canShareRow !== false,
  });
}

export function officeComposition(sections = []) {
  return (Array.isArray(sections) ? sections : []).map((section) => ({
    section,
    ...officeBlockDescriptor(section),
  }));
}
