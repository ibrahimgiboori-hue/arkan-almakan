const MONEY_SCALE = 100;
export const PAYROLL_DIVISOR_DAYS = 30;

const number = (value) => Number(value || 0);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export const roundMoney = (value) => Math.round((number(value) + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;

function parseDateOnly(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function monthWindow(runMonth) {
  const text = String(runMonth || '').slice(0, 7);
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) throw new Error('شهر المسير غير صالح.');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = Date.UTC(year, monthIndex, 1);
  const end = Date.UTC(year, monthIndex + 1, 0);
  return { start, end };
}

function inclusiveDays(start, end) {
  return Math.floor((end - start) / 86400000) + 1;
}

export function monthlyFixedSalary(source = {}) {
  return roundMoney(
    number(source.basic_salary) +
    number(source.housing_allowance) +
    number(source.transport_allowance) +
    number(source.other_allowance)
  );
}

export function getPayrollEntitlement({
  runMonth,
  hireDate,
  endDate = null,
  monthlyBasic = 0,
  monthlyHousing = 0,
  monthlyTransport = 0,
  monthlyOther = 0,
  absenceDays = 0,
} = {}) {
  const { start: monthStart, end: monthEnd } = monthWindow(runMonth);
  const hire = parseDateOnly(hireDate);
  const end = parseDateOnly(endDate);
  const missingHireDate = !hire;

  if ((hire && hire > monthEnd) || (end && end < monthStart)) {
    return {
      eligibleDays: 0,
      fullMonth: false,
      missingHireDate,
      monthlySalary: roundMoney(number(monthlyBasic) + number(monthlyHousing) + number(monthlyTransport) + number(monthlyOther)),
      dailyRate: 0,
      payableBasic: 0,
      payableHousing: 0,
      payableTransport: 0,
      payableOther: 0,
      absenceDays: 0,
      absenceDeduction: 0,
    };
  }

  const effectiveStart = hire ? Math.max(hire, monthStart) : monthStart;
  const effectiveEnd = end ? Math.min(end, monthEnd) : monthEnd;
  if (effectiveStart > effectiveEnd) {
    return {
      eligibleDays: 0,
      fullMonth: false,
      missingHireDate,
      monthlySalary: roundMoney(number(monthlyBasic) + number(monthlyHousing) + number(monthlyTransport) + number(monthlyOther)),
      dailyRate: 0,
      payableBasic: 0,
      payableHousing: 0,
      payableTransport: 0,
      payableOther: 0,
      absenceDays: 0,
      absenceDeduction: 0,
    };
  }

  const fullMonth = effectiveStart === monthStart && effectiveEnd === monthEnd;
  const eligibleDays = fullMonth ? PAYROLL_DIVISOR_DAYS : clamp(inclusiveDays(effectiveStart, effectiveEnd), 0, PAYROLL_DIVISOR_DAYS);
  const factor = eligibleDays / PAYROLL_DIVISOR_DAYS;
  const monthlySalary = roundMoney(number(monthlyBasic) + number(monthlyHousing) + number(monthlyTransport) + number(monthlyOther));
  const safeAbsenceDays = clamp(number(absenceDays), 0, eligibleDays);

  return {
    eligibleDays,
    fullMonth,
    missingHireDate,
    monthlySalary,
    dailyRate: roundMoney(monthlySalary / PAYROLL_DIVISOR_DAYS),
    payableBasic: fullMonth ? roundMoney(monthlyBasic) : roundMoney(number(monthlyBasic) * factor),
    payableHousing: fullMonth ? roundMoney(monthlyHousing) : roundMoney(number(monthlyHousing) * factor),
    payableTransport: fullMonth ? roundMoney(monthlyTransport) : roundMoney(number(monthlyTransport) * factor),
    payableOther: fullMonth ? roundMoney(monthlyOther) : roundMoney(number(monthlyOther) * factor),
    absenceDays: safeAbsenceDays,
    absenceDeduction: roundMoney((monthlySalary / PAYROLL_DIVISOR_DAYS) * safeAbsenceDays),
  };
}

export function calculatePayrollLine(row = {}, employee = {}, runMonth, endDate = null) {
  const entitlement = getPayrollEntitlement({
    runMonth,
    hireDate: employee.hire_date,
    endDate,
    monthlyBasic: employee.basic_salary,
    monthlyHousing: employee.housing_allowance,
    monthlyTransport: employee.transport_allowance,
    monthlyOther: employee.other_allowance,
    absenceDays: row.absence_days,
  });

  const grossPay = roundMoney(
    entitlement.payableBasic +
    entitlement.payableHousing +
    entitlement.payableTransport +
    entitlement.payableOther +
    number(row.overtime_amount) +
    number(row.commission_amount)
  );
  const totalDeductions = roundMoney(
    entitlement.absenceDeduction +
    number(row.advance_deduction) +
    number(row.penalty_deduction) +
    number(row.gosi_deduction) +
    number(row.other_deduction)
  );

  return {
    ...row,
    basic_salary: entitlement.payableBasic,
    housing_allowance: entitlement.payableHousing,
    transport_allowance: entitlement.payableTransport,
    other_allowance: entitlement.payableOther,
    absence_days: entitlement.absenceDays,
    absence_deduction: entitlement.absenceDeduction,
    gross_pay: grossPay,
    total_deductions: totalDeductions,
    net_pay: roundMoney(grossPay - totalDeductions),
    eligible_days: entitlement.eligibleDays,
    monthly_salary_basis: entitlement.monthlySalary,
    payroll_daily_rate: entitlement.dailyRate,
    missing_hire_date: entitlement.missingHireDate,
  };
}

export function createPayrollLine(runId, employee, runMonth, endDate = null) {
  return calculatePayrollLine({
    run_id: runId,
    employee_id: employee.id,
    overtime_amount: 0,
    commission_amount: 0,
    absence_days: 0,
    absence_deduction: 0,
    advance_deduction: 0,
    penalty_deduction: 0,
    gosi_deduction: 0,
    other_deduction: 0,
    notes: null,
  }, employee, runMonth, endDate);
}

export function employeeOverlapsPayrollMonth(employee, runMonth, endDate = null) {
  const entitlement = getPayrollEntitlement({
    runMonth,
    hireDate: employee?.hire_date,
    endDate,
    monthlyBasic: employee?.basic_salary,
    monthlyHousing: employee?.housing_allowance,
    monthlyTransport: employee?.transport_allowance,
    monthlyOther: employee?.other_allowance,
  });
  return entitlement.eligibleDays > 0;
}
