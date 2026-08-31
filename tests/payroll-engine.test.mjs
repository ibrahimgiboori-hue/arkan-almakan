import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayrollLine, getPayrollEntitlement } from '../lib/payroll-engine.mjs';

test('full month keeps the exact monthly salary even in a 31-day month', () => {
  const value = getPayrollEntitlement({
    runMonth:'2026-08-01',
    hireDate:'2026-01-01',
    monthlyBasic:6700,
  });
  assert.equal(value.eligibleDays, 30);
  assert.equal(value.payableBasic, 6700);
  assert.equal(value.absenceDeduction, 0);
});

test('full month keeps the exact monthly salary in February', () => {
  const value = getPayrollEntitlement({
    runMonth:'2026-02-01',
    hireDate:'2026-01-01',
    monthlyBasic:6700,
  });
  assert.equal(value.eligibleDays, 30);
  assert.equal(value.payableBasic, 6700);
});

test('Nedim starting 23 August receives 9/30 of 6700', () => {
  const row = calculatePayrollLine({ absence_days:0 }, {
    id:'nedim', hire_date:'2026-08-23', basic_salary:6700,
    housing_allowance:0, transport_allowance:0, other_allowance:0,
  }, '2026-08-01');
  assert.equal(row.eligible_days, 9);
  assert.equal(row.basic_salary, 2010);
  assert.equal(row.gross_pay, 2010);
  assert.equal(row.net_pay, 2010);
});

test('absence deduction is automatic from the 30-day monthly rate', () => {
  const row = calculatePayrollLine({ absence_days:2 }, {
    id:'employee', hire_date:'2026-01-01', basic_salary:6700,
    housing_allowance:0, transport_allowance:0, other_allowance:0,
  }, '2026-08-01');
  assert.equal(row.eligible_days, 30);
  assert.equal(row.absence_deduction, 446.67);
  assert.equal(row.net_pay, 6253.33);
});

test('absence is also deducted from a partial-month entitlement', () => {
  const row = calculatePayrollLine({ absence_days:1 }, {
    id:'nedim', hire_date:'2026-08-23', basic_salary:6700,
    housing_allowance:0, transport_allowance:0, other_allowance:0,
  }, '2026-08-01');
  assert.equal(row.eligible_days, 9);
  assert.equal(row.absence_deduction, 223.33);
  assert.equal(row.net_pay, 1786.67);
});

test('an employee who has not started in the selected month has no entitlement', () => {
  const value = getPayrollEntitlement({
    runMonth:'2026-08-01', hireDate:'2026-09-01', monthlyBasic:6700,
  });
  assert.equal(value.eligibleDays, 0);
  assert.equal(value.payableBasic, 0);
});

test('missing historic hire date remains backward compatible but is flagged', () => {
  const value = getPayrollEntitlement({
    runMonth:'2026-08-01', hireDate:null, monthlyBasic:6700,
  });
  assert.equal(value.eligibleDays, 30);
  assert.equal(value.payableBasic, 6700);
  assert.equal(value.missingHireDate, true);
});

test('absence days cannot exceed the eligible days in the month', () => {
  const value = getPayrollEntitlement({
    runMonth:'2026-08-01', hireDate:'2026-08-23', monthlyBasic:6700, absenceDays:20,
  });
  assert.equal(value.eligibleDays, 9);
  assert.equal(value.absenceDays, 9);
  assert.equal(value.absenceDeduction, 2010);
});
