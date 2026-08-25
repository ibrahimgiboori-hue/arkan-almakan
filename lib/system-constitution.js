// دستور التشغيل المركزي V2 — قواعد مشتركة لا يجب تكرارها داخل الصفحات.
export const SYSTEM_VERSION = '2.0.0-stable';

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
  }),
});

export const WORKFLOW_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
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
