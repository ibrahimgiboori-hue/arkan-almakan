// دستور التشغيل المركزي V2 — قواعد مشتركة لا يجب تكرارها داخل الصفحات.
export const SYSTEM_VERSION = '2.1.0-stable';

export const SYSTEM = Object.freeze({
  locale: 'ar-SA',
  direction: 'rtl',
  calendar: 'gregory',
  timezone: 'Asia/Riyadh',
  currency: 'SAR',
  vatRate: 0.15,
  lowLeaveBalanceDays: 7,
  moneyDecimals: 2,
  attendance: Object.freeze({
    fullDay: 1,
    halfDay: 0.5,
    maxPerWorkerPerDate: 1,
    states: Object.freeze({ full: 'full', half: 'half', absent: 'absent' }),
    legacyReadableStates: Object.freeze(['leave', 'stopped']),
  }),
  payroll: Object.freeze({ monthlyDailyDivisor: 30 }),
  print: Object.freeze({
    defaultSize: 'A4',
    defaultOrientation: 'portrait',
    preserveAssetQuality: true,
    splitTableRows: false,
    previewMatchesPrint: true,
    marginsMm: Object.freeze({ top: 19, right: 19, bottom: 19, left: 19 }),
    minAssetOpacity: 1,
    forbidImageFilters: true,
  }),
});

export const WORKFLOW_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const REQUEST_STATUS = Object.freeze({
  DRAFT: WORKFLOW_STATUS.DRAFT,
  SUBMITTED: WORKFLOW_STATUS.SUBMITTED,
  HR_REVIEWED: 'hr_reviewed',
  ACCOUNTANT_APPROVED: 'accountant_approved',
  CEO_APPROVED: 'ceo_approved',
  REJECTED: WORKFLOW_STATUS.REJECTED,
  CANCELLED: WORKFLOW_STATUS.CANCELLED,
});

export const PROJECT_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const CLAIM_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const STATUS_LABELS_AR = Object.freeze({
  draft: 'مسودة',
  submitted: 'مقدّم',
  reviewed: 'تمت المراجعة',
  approved: 'معتمد',
  hr_reviewed: 'تم الإجراء الأول',
  accountant_approved: 'تمت المراجعة المالية',
  ceo_approved: 'معتمد نهائيًا',
  active: 'نشط',
  on_hold: 'متوقف مؤقتًا',
  completed: 'مكتمل',
  partially_paid: 'مسدد جزئيًا',
  paid: 'مسدد',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
});

export function roundValue(value, decimals = SYSTEM.moneyDecimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

export function attendanceValue(status) {
  if (status === SYSTEM.attendance.states.full) return SYSTEM.attendance.fullDay;
  if (status === SYSTEM.attendance.states.half) return SYSTEM.attendance.halfDay;
  return 0;
}

export function dailyRateFromMonthly(monthlySalary) {
  return roundValue(Number(monthlySalary || 0) / SYSTEM.payroll.monthlyDailyDivisor);
}

export function calculateVat(amount, rate = SYSTEM.vatRate) {
  return roundValue(Number(amount || 0) * Number(rate || 0));
}

export function enforceAttendanceLimit(entries = []) {
  const total = entries.reduce((sum, value) => {
    const normalized = typeof value === 'string' ? attendanceValue(value) : Number(value || 0);
    return sum + normalized;
  }, 0);
  return total <= SYSTEM.attendance.maxPerWorkerPerDate;
}

export function inclusiveDays(from, to) {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00+03:00`);
  const end = new Date(`${to}T00:00:00+03:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

export function leaveBalanceState(balance) {
  const days = Number(balance || 0);
  if (days <= 0) return 'blocked';
  if (days < SYSTEM.lowLeaveBalanceDays) return 'warning';
  return 'ok';
}

export function statusLabelAr(status, fallback = '—') {
  return STATUS_LABELS_AR[status] || fallback;
}

export function canMutateWorkflow(status) {
  return [WORKFLOW_STATUS.DRAFT, WORKFLOW_STATUS.SUBMITTED].includes(status);
}

export function canCancelWorkflow(status) {
  return ![
    WORKFLOW_STATUS.REJECTED,
    WORKFLOW_STATUS.CANCELLED,
    CLAIM_STATUS.PAID,
  ].includes(status);
}

export function printMarginStyle(overrides = {}) {
  const m = { ...SYSTEM.print.marginsMm, ...overrides };
  return {
    '--print-margin-top': `${m.top}mm`,
    '--print-margin-right': `${m.right}mm`,
    '--print-margin-bottom': `${m.bottom}mm`,
    '--print-margin-left': `${m.left}mm`,
  };
}
