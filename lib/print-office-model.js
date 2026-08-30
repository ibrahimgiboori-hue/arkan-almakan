export const PRINT_OFFICE_MODEL_VERSION = '2.1';

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

export const OFFICE_ROW_MODE = Object.freeze({
  MEASURED: 'measured',
  PACKAGE: 'package',
});

export const OFFICE_COLUMN_ROLE = Object.freeze({
  INDEX: 'index',
  DESCRIPTION: 'description',
  QUANTITY: 'quantity',
  UNIT: 'unit',
  UNIT_PRICE: 'unit-price',
  AMOUNT: 'amount',
  PAID: 'paid',
  PENDING: 'pending',
  REFERENCE: 'reference',
  STATUS: 'status',
  TEXT: 'text',
});

export const OFFICE_GRID_COLUMNS = 12;
export const OFFICE_FIELD_GRID_COLUMNS = 48;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const compact = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

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

  if (kind === OFFICE_BLOCK_KIND.INFO) {
    const fieldCount = Array.isArray(section.fields) ? section.fields.length : 0;
    return fieldCount >= 5 ? 8 : 6;
  }

  if (kind === OFFICE_BLOCK_KIND.SUMMARY) return OFFICE_GRID_COLUMNS;
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

export function resolveOfficeColumnRole(column = {}) {
  if (column.role && Object.values(OFFICE_COLUMN_ROLE).includes(column.role)) return column.role;
  const key = compact(column.key);
  if (['item','description','workitem','service','scope'].includes(key)) return OFFICE_COLUMN_ROLE.DESCRIPTION;
  if (['quantity','qty'].includes(key)) return OFFICE_COLUMN_ROLE.QUANTITY;
  if (['unit','uom'].includes(key)) return OFFICE_COLUMN_ROLE.UNIT;
  if (['rate','unitprice','price'].includes(key)) return OFFICE_COLUMN_ROLE.UNIT_PRICE;
  if (['workvalue','amount','value','total'].includes(key)) return OFFICE_COLUMN_ROLE.AMOUNT;
  if (['paidvalue','paid','collected','received'].includes(key)) return OFFICE_COLUMN_ROLE.PAID;
  if (['pendingvalue','pending','balance','due'].includes(key)) return OFFICE_COLUMN_ROLE.PENDING;
  if (['poreference','reference','ref','po'].includes(key)) return OFFICE_COLUMN_ROLE.REFERENCE;
  if (['status','notes','position','executivestatus'].includes(key)) return OFFICE_COLUMN_ROLE.STATUS;
  return OFFICE_COLUMN_ROLE.TEXT;
}

const ROLE_WEIGHT = Object.freeze({
  [OFFICE_COLUMN_ROLE.DESCRIPTION]: 12,
  [OFFICE_COLUMN_ROLE.QUANTITY]: 5,
  [OFFICE_COLUMN_ROLE.UNIT]: 5.5,
  [OFFICE_COLUMN_ROLE.UNIT_PRICE]: 6.5,
  [OFFICE_COLUMN_ROLE.AMOUNT]: 10,
  [OFFICE_COLUMN_ROLE.PAID]: 10,
  [OFFICE_COLUMN_ROLE.PENDING]: 10,
  [OFFICE_COLUMN_ROLE.REFERENCE]: 10,
  [OFFICE_COLUMN_ROLE.STATUS]: 27,
  [OFFICE_COLUMN_ROLE.TEXT]: 8,
});

export function resolveOfficeTableColumns(columns = []) {
  const list = (Array.isArray(columns) ? columns : []).map((column) => {
    const role = resolveOfficeColumnRole(column);
    const declared = Number(column.officeWeight ?? column.printWeight);
    const weight = Number.isFinite(declared) && declared > 0
      ? declared
      : ROLE_WEIGHT[role] || Math.max(4, Number(column.span || 1));
    return { column, role, weight };
  });

  const total = list.reduce((sum, item) => sum + item.weight, 0) || 1;
  return list.map((item) => ({
    ...item,
    widthPct:(item.weight / total) * 96,
  }));
}

export function resolveOfficeRowMode(row = {}, section = {}) {
  const explicit = compact(row.rowMode || row.row_mode || row.mode || row._rowMode || section.rowMode);
  if (explicit === OFFICE_ROW_MODE.PACKAGE || ['package','lumpsum','lump','مقطوعية','مقطوعيه'].includes(explicit)) {
    return OFFICE_ROW_MODE.PACKAGE;
  }
  if (explicit === OFFICE_ROW_MODE.MEASURED || ['measured','quantity','measurable'].includes(explicit)) {
    return OFFICE_ROW_MODE.MEASURED;
  }

  const evidence = [row.unit, row.item, row.description, row.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (evidence.includes('مقطوع') || evidence.includes('lump sum') || evidence.includes('lumpsum')) {
    return OFFICE_ROW_MODE.PACKAGE;
  }
  return OFFICE_ROW_MODE.MEASURED;
}

export function resolveOfficeRowValue(row = {}, column = {}, mode = OFFICE_ROW_MODE.MEASURED) {
  if (mode !== OFFICE_ROW_MODE.PACKAGE) return row[column.key];
  const role = resolveOfficeColumnRole(column);
  if (role === OFFICE_COLUMN_ROLE.QUANTITY) return row.packageQuantity ?? 1;
  if (role === OFFICE_COLUMN_ROLE.UNIT) return row.packageUnit || 'مقطوعية';
  if (role === OFFICE_COLUMN_ROLE.UNIT_PRICE) return row.packageRate ?? row.work_value ?? row.amount ?? row[column.key];
  return row[column.key];
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
