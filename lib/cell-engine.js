// محرك الخلايا والمعادلات المركزي — القيم المالية وحدها ملزمة بخانتين عشريتين.

export const CELL_TYPES = Object.freeze({
  TEXT: 'text',
  NUMBER: 'number',
  QUANTITY: 'quantity',
  MONEY: 'money',
  PERCENT: 'percent',
  DATE: 'date',
});

const n = (value) => {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
};

export function roundTo(value, decimals) {
  if (decimals == null) return n(value);
  const d = Math.max(0, Number(decimals) || 0);
  const p = 10 ** d;
  return Math.round((n(value) + Number.EPSILON) * p) / p;
}

export function normalizeCellValue(value, type = CELL_TYPES.NUMBER, precision = null) {
  if (type === CELL_TYPES.MONEY) return roundTo(value, 2);
  if (precision != null) return roundTo(value, precision);
  // الكميات والأرقام والنسب لا تفقد دقتها تلقائيًا.
  return n(value);
}

export function calculateCell(op, a, b, { type = CELL_TYPES.NUMBER, precision = null } = {}) {
  const x = n(a);
  const y = n(b);
  let out = 0;

  switch (op) {
    case 'multiply': out = x * y; break;
    case 'add': out = x + y; break;
    case 'subtract': out = x - y; break;
    case 'divide': out = y === 0 ? 0 : x / y; break;
    case 'percent': out = x * y / 100; break;
    default: out = x; break;
  }

  return normalizeCellValue(out, type, precision);
}

export function fieldTypeMap(layout) {
  const map = {};
  (layout?.sections || []).forEach((section) => {
    [...(section.fields || []), ...(section.columns || [])].forEach((field) => {
      if (field?.key) map[field.key] = field.type || CELL_TYPES.TEXT;
    });
  });
  return map;
}

export function formulaResultType(rule, typeMap = {}) {
  return rule?.result_type || rule?.target_type || typeMap?.[rule?.target] || CELL_TYPES.NUMBER;
}
