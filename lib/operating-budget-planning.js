function normalizedNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

export function budgetMonthlyPlannedAmount(line = {}) {
  return line.cash_effect_type === 'reserve_only'
    ? normalizedNumber(line.required_reserve)
    : normalizedNumber(line.expected_amount);
}

export function budgetMonthlyActualAmount(line = {}) {
  if (line.cash_effect_type !== 'due_now' || line.confirmed_amount == null) return null;
  return normalizedNumber(line.confirmed_amount);
}

export function budgetMonthlyPlanTotals(statement = [], safetyMarginPercent = 10) {
  const rows = Array.isArray(statement) ? statement : [];
  const margin = Math.min(100, Math.max(0, normalizedNumber(safetyMarginPercent)));
  let estimated = 0;
  let actual = 0;
  let paid = 0;
  let comparedEstimate = 0;
  let actualCount = 0;

  for (const line of rows) {
    estimated += budgetMonthlyPlannedAmount(line);
    paid += normalizedNumber(line.paid_amount);
    const actualValue = budgetMonthlyActualAmount(line);
    if (actualValue != null) {
      actual += actualValue;
      comparedEstimate += normalizedNumber(line.expected_amount);
      actualCount += 1;
    }
  }

  return {
    estimated,
    actual,
    paid,
    actualCount,
    variance: actual - comparedEstimate,
    safetyMarginPercent: margin,
    safetyMarginAmount: estimated * margin / 100,
    targetFunding: estimated * (1 + margin / 100),
  };
}

export function budgetCatalogFinancialSnapshot({
  calculationType = '',
  rateParams = null,
  bands = [],
  schedule = null,
  rateValidFrom = '',
  scheduleValidFrom = '',
} = {}) {
  return canonicalize({
    calculationType,
    rateParams,
    bands: Array.isArray(bands) ? bands : [],
    schedule,
    rateValidFrom: rateValidFrom || '',
    scheduleValidFrom: scheduleValidFrom || '',
  });
}

export function budgetFinancialRevisionChanged(before, after) {
  return JSON.stringify(canonicalize(before)) !== JSON.stringify(canonicalize(after));
}

export function budgetRevisionEffectiveDates(intent, selectedMonthStart, baseline = {}, fallback = '') {
  if (intent === 'correction') {
    return {
      rateValidFrom: baseline.rateValidFrom || fallback || selectedMonthStart,
      scheduleValidFrom: baseline.scheduleValidFrom || fallback || selectedMonthStart,
    };
  }
  if (intent === 'forward') {
    return { rateValidFrom: selectedMonthStart, scheduleValidFrom: selectedMonthStart };
  }
  return {
    rateValidFrom: fallback || selectedMonthStart,
    scheduleValidFrom: fallback || selectedMonthStart,
  };
}

export const BUDGET_REVISION_INTENTS = Object.freeze({
  correction: Object.freeze({
    label: 'تصحيح بيانات سابقة',
    description: 'المعلومة السابقة كانت مدخلة خطأ. نعيد حساب التقديرات السابقة فقط، ولا نغيّر القيمة الفعلية أو المدفوع.',
  }),
  forward: Object.freeze({
    label: 'تغيير من الدورة الحالية',
    description: 'المعلومة السابقة كانت صحيحة. تبدأ القاعدة الجديدة من الدورة الحالية ويبقى ما قبلها على الإصدار السابق.',
  }),
});
