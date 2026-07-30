// محرك المعادلات: العلاقات بيانات لا كود — نفس فكرة LogicLink

export const OPS = {
  multiply:  { label: 'ضرب (أ × ب)',            arity: 2 },
  add:       { label: 'جمع (أ + ب)',             arity: 2 },
  subtract:  { label: 'طرح (أ − ب)',             arity: 2 },
  divide:    { label: 'قسمة (أ ÷ ب)',            arity: 2 },
  percent:   { label: 'نسبة (أ × ب٪)',           arity: 2 },
  copy:      { label: 'نسخ قيمة (أ)',            arity: 1 },
  sum_column: { label: 'مجموع عمود في الجدول',   arity: 1 },
  condition: { label: 'شرط: إذا تحقق فخُذ قيمة', arity: 3 },
};

export const CMP = { lt:'أصغر من', lte:'أصغر أو يساوي', gt:'أكبر من',
                     gte:'أكبر أو يساوي', eq:'يساوي', neq:'لا يساوي' };

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(v * 100) / 100;

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

// يُطبَّق على أسطر الجدول (scope: row) وعلى الحقول العامة
export function applyLogic(payload, rows, logic) {
  const p = { ...(payload || {}) };
  let rws = (rows || []).map((x) => ({ ...x }));
  const rules = logic || [];

  // ١) قواعد على مستوى السطر
  rules.filter((L) => L.scope === 'row').forEach((L) => {
    rws = rws.map((row) => {
      const a = n(row[L.a]), b = n(row[L.b]);
      let out = row[L.target];
      if (L.op === 'multiply') out = r2(a * b);
      else if (L.op === 'add') out = r2(a + b);
      else if (L.op === 'subtract') out = r2(a - b);
      else if (L.op === 'divide') out = b === 0 ? 0 : r2(a / b);
      else if (L.op === 'percent') out = r2(a * b / 100);
      else if (L.op === 'copy') out = row[L.a];
      return { ...row, [L.target]: out };
    });
  });

  // ٢) قواعد عامة بالترتيب — فيمكن أن تبني قاعدة على ناتج سابقة
  rules.filter((L) => L.scope !== 'row').forEach((L) => {
    const a = n(p[L.a]), b = n(p[L.b]);
    switch (L.op) {
      case 'multiply':  p[L.target] = r2(a * b); break;
      case 'add':       p[L.target] = r2(a + b); break;
      case 'subtract':  p[L.target] = r2(a - b); break;
      case 'divide':    p[L.target] = b === 0 ? 0 : r2(a / b); break;
      case 'percent':   p[L.target] = r2(a * b / 100); break;
      case 'copy':      p[L.target] = p[L.a]; break;
      case 'sum_column':
        p[L.target] = r2(rws.reduce((t, row) => t + n(row[L.a]), 0)); break;
      case 'condition':
        p[L.target] = compare(a, b, L.cmp || 'lt') ? (p[L.then] ?? L.then_value ?? 0) : 0;
        break;
      default: break;
    }
  });

  return { payload: p, rows: rws };
}

// كل مفاتيح الحقول المتاحة في النموذج — لقوائم اختيار المعادلات
export function allKeys(layout) {
  const keys = [];
  (layout?.sections || []).forEach((s) => {
    (s.fields || []).forEach((f) => keys.push({ key: f.key, label: f.label, where: s.title || s.kind }));
    (s.columns || []).forEach((c) => keys.push({ key: c.key, label: c.label, where: 'عمود جدول' }));
    if (s.kind === 'text' && s.key) keys.push({ key: s.key, label: s.title || s.key, where: 'نص' });
  });
  return keys;
}

export const SECTION_KINDS = {
  cards:      'بطاقات معلومات',
  table:      'جدول بنود',
  text:       'نص حر',
  totals:     'صندوق حسابات',
  signatures: 'تواقيع',
};

export const FIELD_TYPES = {
  text: 'نص', number: 'رقم', money: 'مبلغ', date: 'تاريخ', select: 'قائمة',
};

export const uid = () => Math.random().toString(36).slice(2, 9);
