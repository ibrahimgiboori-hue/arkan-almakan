// تسوية المقاول — قواعد الكشف (بلا قاعدة بيانات وبلا واجهة).
//
// معادلة المالك: المستحق عن الأعمال + مصروفات دفعها المقاول على أركان/المالك + إضافات
//   − ما صرفته أركان عنه (عهدة/مباشر) − الدفعات المباشرة له في الفترة − الخصومات
//   − السلف المستردة (من السلف المفتوحة، دون أن تتجاوز المستحق) = الصافي.
// القاعدة تحسب نفس المعادلة عند الحفظ (fn_build_period_settlement)؛ هذا الملف يعرضها سطرًا سطرًا.

const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export const SETTLEMENT_BASIS_LABELS = Object.freeze({
  item: 'حسب البند (المقطوعية إن سُجّلت وإلا اليوميات)',
  daywork: 'باليومية (الحضور × اليومية)',
  piecework: 'بالمقطوعية (الكمية × سعر الوحدة)',
});

/** The basis that matches the contractor's agreement on the project. */
export function defaultSettlementBasis(projectBasis) {
  if (projectBasis === 'piecework') return 'piecework';
  if (projectBasis === 'daily' || projectBasis === 'salary') return 'daywork';
  return 'item';
}

export const SETTLEMENT_STATUS_LABELS = Object.freeze({
  draft: 'مسودة — عند المراجعة المالية',
  submitted: 'مرفوعة للمراجعة',
  hr_reviewed: 'دققتها الموارد البشرية',
  accountant_approved: 'اعتمدها المحاسب — بانتظار تعميد المدير',
  ceo_approved: 'معتمدة نهائيًا — جاهزة للصرف',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
});

/** What the next person in the cycle does with a saved settlement (by its financial case status). */
export function settlementNextStep(settlement = {}, caseStatus = '') {
  const status = settlement?.status || 'draft';
  if (status === 'cancelled' || status === 'rejected') return Object.freeze({ key: 'closed', label: 'مغلقة' });
  if (caseStatus === 'paid' || caseStatus === 'closed' || settlement?.paid_at) return Object.freeze({ key: 'paid', label: 'صُرفت' });
  if (caseStatus === 'returned_to_source') return Object.freeze({ key: 'fix', label: 'أُعيدت للتصحيح — أعد الحساب ثم احفظ' });
  if (status === 'ceo_approved' || caseStatus === 'final_approved') return Object.freeze({ key: 'pay', label: 'الصرف من الخزينة' });
  if (status === 'accountant_approved' || caseStatus === 'finance_approved') return Object.freeze({ key: 'final_approve', label: 'تعميد المدير التنفيذي' });
  return Object.freeze({ key: 'finance_approve', label: 'اعتماد المحاسب' });
}

function workDaysText(count) {
  if (count === 0) return 'لا أيام عمل';
  if (count === 1) return 'يوم عمل واحد';
  if (count === 2) return 'يوما عمل';
  return count <= 10 ? `${count} أيام عمل` : `${count} يوم عمل`;
}

/** Sum of the open advances (what may be recovered from this settlement). */
export function openAdvanceTotal(advances = []) {
  return round2((advances || []).reduce((sum, advance) => sum + Math.max(0, n(advance?.remaining)), 0));
}

/**
 * The statement of a period before saving.
 * preview: one row of fn_settlement_preview. When the database does not deduct direct payments yet,
 * preview.payments_amount is absent: the statement then shows the payments as NOT deducted and blocks saving.
 */
export function buildSettlementStatement(preview = {}, { penalty = 0, other = 0, openAdvances = 0, periodPayments = 0, basis = 'item' } = {}) {
  const works = n(preview?.works_amount);
  const reimbursable = n(preview?.reimbursable_amount);
  const charged = n(preview?.charged_amount);
  const paymentsDeducted = preview?.payments_amount !== undefined && preview?.payments_amount !== null;
  const payments = paymentsDeducted ? n(preview.payments_amount) : 0;
  const penaltyAmount = Math.max(0, n(penalty));
  const otherAmount = Math.max(0, n(other));
  const beforeAdvances = round2(works + reimbursable + otherAmount - charged - payments - penaltyAmount);
  const advances = round2(Math.min(Math.max(0, n(openAdvances)), Math.max(beforeAdvances, 0)));
  const net = round2(beforeAdvances - advances);
  const lines = [
    { key: 'works', sign: 1, label: 'المستحق عن الأعمال', note: `${SETTLEMENT_BASIS_LABELS[basis] || ''} · ${workDaysText(n(preview?.days_worked))}`, amount: works },
    { key: 'reimbursable', sign: 1, label: 'مصروفات دفعها المقاول على أركان أو المالك', amount: reimbursable },
    { key: 'other', sign: 1, label: 'إضافات أخرى', amount: otherAmount },
    { key: 'charged', sign: -1, label: 'مصروفات صرفتها أركان عنه (عهدة أو مباشر)', amount: charged },
    { key: 'payments', sign: -1, label: 'دفعات مباشرة له في الفترة', amount: paymentsDeducted ? payments : n(periodPayments), notDeducted: !paymentsDeducted && n(periodPayments) > 0 },
    { key: 'penalty', sign: -1, label: 'خصومات وغرامات', amount: penaltyAmount },
    { key: 'advances', sign: -1, label: 'سلف مستردة', note: `من سلف مفتوحة إجمالها ${round2(n(openAdvances)).toFixed(2)} — لا يتجاوز الاسترداد المستحق`, amount: advances },
  ];
  const warnings = [];
  if (!paymentsDeducted && n(periodPayments) > 0) {
    warnings.push(`توجد دفعات مباشرة للمقاول في الفترة بمبلغ ${round2(n(periodPayments)).toFixed(2)} لا تخصمها القاعدة بعد — الحفظ متوقف حتى يُفعَّل خصم الدفعات.`);
  }
  if (net < 0) warnings.push('الصافي بالسالب: المقاول مدين لأركان بهذا المبلغ في هذه الفترة.');
  return Object.freeze({
    lines: Object.freeze(lines.map((line) => Object.freeze(line))),
    beforeAdvances,
    advances,
    net,
    paymentsDeducted,
    canSave: !(!paymentsDeducted && n(periodPayments) > 0) && (works > 0 || reimbursable > 0 || charged > 0 || payments > 0),
    warnings: Object.freeze(warnings),
  });
}

/** The statement lines of a saved settlement (charged_amount holds expenses + payments). */
export function savedSettlementLines(row = {}) {
  const payments = n(row?.payments_amount);
  return Object.freeze([
    { key: 'works', sign: 1, label: 'المستحق عن الأعمال', amount: n(row?.works_amount) },
    { key: 'reimbursable', sign: 1, label: 'مصروفات دفعها المقاول على أركان أو المالك', amount: n(row?.reimbursable_amount) },
    { key: 'other', sign: 1, label: 'إضافات أخرى', amount: n(row?.other_additions) },
    { key: 'charged', sign: -1, label: 'مصروفات صرفتها أركان عنه (عهدة أو مباشر)', amount: round2(n(row?.charged_amount) - payments) },
    { key: 'payments', sign: -1, label: 'دفعات مباشرة له في الفترة', amount: payments },
    { key: 'penalty', sign: -1, label: 'خصومات وغرامات', amount: n(row?.penalty_amount) },
    { key: 'advances', sign: -1, label: 'سلف مستردة', amount: n(row?.advances_amount) },
  ].map((line) => Object.freeze(line)));
}

/** Expense rows that touch the contractor's account (the rest are Arkan's own costs). */
export function settlementExpenseRows(rows = []) {
  return (rows || []).filter((row) => n(row?.reimbursable) > 0 || n(row?.charged) > 0);
}

/** The value a day contributes under the chosen basis. */
export function settlementDayValue(day = {}, basis = 'item') {
  if (basis === 'daywork') return n(day?.daywork_value);
  if (basis === 'piecework') return n(day?.piecework_value);
  return n(day?.by_item_value);
}
