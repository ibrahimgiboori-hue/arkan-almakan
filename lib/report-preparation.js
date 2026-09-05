// طبقة إعداد التقرير تسبق القبطان ولا تغيّر حقيقة المصدر.
// الفلترة والترتيب والتقسيم الدلالي هي طريقة عرض مشتقة؛ القبطان يملك الصفحات فقط.

export const REPORT_PREPARATION_POLICY = Object.freeze({
  id:'filter-sort-group-before-print-v1',
  owner:'report-definition',
  sourceMutation:'forbidden',
  filterResult:'derived-read-only-view',
  sortResult:'derived-read-only-view',
  grouping:'semantic-sections-not-physical-pages',
  captainRole:'pagination-only',
  reportCreatesTruth:false,
});

export const REPORT_SORT_DIRECTION = Object.freeze({
  ASC:'asc',
  DESC:'desc',
});

function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ar');
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'ar', {
    numeric:true,
    sensitivity:'base',
  });
}

function compareNumber(left, right) {
  const a = Number(left);
  const b = Number(right);
  const safeA = Number.isFinite(a) ? a : 0;
  const safeB = Number.isFinite(b) ? b : 0;
  return safeA - safeB;
}

function compareDate(left, right) {
  const a = left ? Date.parse(String(left)) : Number.NaN;
  const b = right ? Date.parse(String(right)) : Number.NaN;
  const safeA = Number.isFinite(a) ? a : Number.POSITIVE_INFINITY;
  const safeB = Number.isFinite(b) ? b : Number.POSITIVE_INFINITY;
  return safeA - safeB;
}

function compareField(left, right, type) {
  if (type === 'number' || type === 'money') return compareNumber(left, right);
  if (type === 'date') return compareDate(left, right);
  return compareText(left, right);
}

export function prepareReportRows(rows, {
  search = '',
  searchFields = [],
  filters = {},
  sort = null,
} = {}) {
  const source = Array.isArray(rows) ? rows : [];
  const needle = normalizeText(search);

  let prepared = source.filter((row) => {
    if (needle && searchFields.length) {
      const matches = searchFields.some((field) => normalizeText(row?.[field]).includes(needle));
      if (!matches) return false;
    }

    for (const [field, expected] of Object.entries(filters || {})) {
      if (expected === undefined || expected === null || expected === '' || expected === 'all') continue;
      const actual = row?.[field];
      if (Array.isArray(expected)) {
        if (!expected.map(String).includes(String(actual ?? ''))) return false;
      } else if (String(actual ?? '') !== String(expected)) {
        return false;
      }
    }
    return true;
  });

  if (sort?.field) {
    const direction = sort.direction === REPORT_SORT_DIRECTION.DESC ? -1 : 1;
    const indexed = prepared.map((row,index)=>({ row,index }));
    indexed.sort((a,b) => {
      const compared = compareField(a.row?.[sort.field], b.row?.[sort.field], sort.type || 'text');
      return compared === 0 ? a.index - b.index : compared * direction;
    });
    prepared = indexed.map((entry)=>entry.row);
  }

  return prepared;
}

export function groupPreparedReportRows(rows, {
  field = '',
  labelFor = null,
  emptyLabel = 'غير مصنف',
} = {}) {
  const source = Array.isArray(rows) ? rows : [];
  if (!field) return [{ key:'all', label:'', rows:source }];

  const groups = new Map();
  for (const row of source) {
    const raw = row?.[field];
    const key = String(raw ?? '').trim() || '__empty__';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label:typeof labelFor === 'function' ? labelFor(raw, row) : (String(raw ?? '').trim() || emptyLabel),
        rows:[],
      });
    }
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}
