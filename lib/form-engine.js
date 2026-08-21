import { calculateCell, fieldTypeMap, formulaResultType, normalizeCellValue, CELL_TYPES } from '@/lib/cell-engine';

// محرك المعادلات: العلاقات بيانات لا كود — نفس فكرة LogicLink

export const OPS = {
  multiply:  { label: 'ضرب (أ × ب)',            arity: 2 },
  add:       { label: 'جمع (أ + ب)',             arity: 2 },
  subtract:  { label: 'طرح (أ − ب)',            arity: 2 },
  divide:    { label: 'قسمة (أ ÷ ب)',            arity: 2 },
  percent:   { label: 'نسبة (أ × ب٪)',           arity: 2 },
  copy:      { label: 'نسخ قيمة (أ)',            arity: 1 },
  sum_column:{ label: 'مجموع عمود في الجدول',    arity: 1 },
  condition: { label: 'شرط: إذا تحقق فخُذ قيمة', arity: 3 },
};

export const CMP = { lt:'أصغر من', lte:'أصغر أو يساوي', gt:'أكبر من',
                     gte:'أكبر أو يساوي', eq:'يساوي', neq:'لا يساوي' };

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

function compare(a, b, cmp) {
  switch (cmp) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'eq': return a === b;
    case 'neq': return a !== b;
    default: return false;
  }
}

function normalizeRuleValue(value, rule, types) {
  const type = formulaResultType(rule, types);
  if ([CELL_TYPES.MONEY, CELL_TYPES.NUMBER, CELL_TYPES.QUANTITY, CELL_TYPES.PERCENT].includes(type)) {
    return normalizeCellValue(value, type, rule?.precision ?? null);
  }
  return value;
}

// يُطبَّق على أسطر الجدول (scope: row) وعلى الحقول العامة.
// layout اختياري للتوافق مع المستندات القديمة؛ وعند تمريره يحدد نوع ناتج كل خلية تلقائيًا.
export function applyLogic(payload, rows, logic, layout = null) {
  const p = { ...(payload || {}) };
  let rws = (rows || []).map((x) => ({ ...x }));
  const rules = logic || [];
  const types = fieldTypeMap(layout);

  rules.filter((L) => L.scope === 'row').forEach((L) => {
    rws = rws.map((row) => {
      const a = n(row[L.a]);
      const b = n(row[L.b]);
      let out = row[L.target];
      const type = formulaResultType(L, types);
      const opts = { type, precision: L.precision ?? null };

      if (['multiply','add','subtract','divide','percent'].includes(L.op)) {
        out = calculateCell(L.op, a, b, opts);
      } else if (L.op === 'copy') {
        out = normalizeRuleValue(row[L.a], L, types);
      }
      return { ...row, [L.target]: out };
    });
  });

  rules.filter((L) => L.scope !== 'row').forEach((L) => {
    const a = n(p[L.a]);
    const b = n(p[L.b]);
    const type = formulaResultType(L, types);
    const opts = { type, precision: L.precision ?? null };

    switch (L.op) {
      case 'multiply':
      case 'add':
      case 'subtract':
      case 'divide':
      case 'percent':
        p[L.target] = calculateCell(L.op, a, b, opts);
        break;
      case 'copy':
        p[L.target] = normalizeRuleValue(p[L.a], L, types);
        break;
      case 'sum_column':
        p[L.target] = normalizeCellValue(
          rws.reduce((t, row) => t + n(row[L.a]), 0),
          type,
          L.precision ?? null,
        );
        break;
      case 'condition': {
        const raw = compare(a, b, L.cmp || 'lt') ? (p[L.then] ?? L.then_value ?? 0) : 0;
        p[L.target] = normalizeRuleValue(raw, L, types);
        break;
      }
      default: break;
    }
  });

  return { payload: p, rows: rws };
}

// كل مفاتيح الحقول المتاحة في النموذج — مع نوع الخلية لاستخدامه في المعادلات.
export function allKeys(layout) {
  const keys = [];
  (layout?.sections || []).forEach((s) => {
    (s.fields || []).forEach((f) => keys.push({ key:f.key, label:f.label, type:f.type, where:s.title || s.kind }));
    (s.columns || []).forEach((c) => keys.push({ key:c.key, label:c.label, type:c.type, where:'عمود جدول' }));
    if (s.kind === 'text' && s.key) keys.push({ key:s.key, label:s.title || s.key, type:'text', where:'نص' });
  });
  return keys;
}

export const SECTION_KINDS = {
  cards:      'بطاقات معلومات',
  parties:    'بطاقات الأطراف',
  table:      'جدول بنود',
  text:       'نص حر',
  totals:     'صندوق حسابات',
  signatures: 'تواقيع',
};

export const FIELD_TYPES = {
  text: 'نص',
  number: 'رقم',
  quantity: 'كمية',
  money: 'مبلغ',
  percent: 'نسبة',
  date: 'تاريخ',
  select: 'قائمة',
};

export const uid = () => Math.random().toString(36).slice(2, 9);
