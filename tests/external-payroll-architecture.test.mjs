import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const engine = read('lib/attendance/external-payroll.js');
const workspace = read('components/attendance/ExternalPayrollWorkspace.js');
const payslip = read('app/print/external-payroll/[batchId]/payslip/[lineId]/page.js');

test('external payroll business rules stay outside React and Supabase', () => {
  for (const forbidden of [
    "from 'react'",
    'from "react"',
    "from 'next/",
    'from "next/',
    '@/lib/supabase',
    '@supabase/',
    '.from(',
    '.rpc(',
    'window.',
    'document.',
  ]) {
    assert.equal(engine.includes(forbidden), false, `payroll engine must not contain ${forbidden}`);
  }
  assert.match(engine, /export function salaryBreakdown/);
  assert.match(engine, /export function calculateExternalPayroll/);
  assert.match(engine, /export function resolveEmployeeSocialInsuranceRate/);
});

test('payroll workspace delegates salary and attendance calculations to the engine', () => {
  assert.match(workspace, /from '@\/lib\/attendance\/external-payroll'/);
  assert.match(workspace, /salaryBreakdown\(/);
  assert.match(workspace, /calculateExternalPayroll\(/);

  for (const leakedFormula of [
    /referenceNet\s*\/\s*divisorDays/,
    /gosiEmployeeRate\s*\/\s*100/,
    /netMinutes\s*\/\s*60/,
  ]) {
    assert.equal(leakedFormula.test(workspace), false, `formula leaked into workspace: ${leakedFormula}`);
  }
});

test('overtime and shortage are independent payroll policies owned by the engine', () => {
  assert.match(engine, /const includeOvertime = batch\?\.include_overtime !== false/);
  assert.match(engine, /const includeTimeShortage = batch\?\.include_time_shortage !== false/);
  assert.match(engine, /const extraMinutes = includeOvertime \? rawExtraMinutes : 0/);
  assert.match(engine, /const shortMinutes = includeTimeShortage \? rawShortMinutes : 0/);
  assert.match(workspace, /include_overtime/);
  assert.match(workspace, /include_time_shortage/);
});

test('payslip is a projection of the saved calculation snapshot, not a payroll engine', () => {
  assert.match(payslip, /calculation_snapshot/);
  assert.match(payslip, /ConstitutionPrintFrame/);
  assert.equal(payslip.includes('calculateExternalPayroll('), false);
  assert.equal(payslip.includes('salaryBreakdown('), false);
  assert.equal(payslip.includes('.insert('), false);
  assert.equal(payslip.includes('.update('), false);
  assert.equal(payslip.includes('.delete('), false);
  assert.equal(payslip.includes('.rpc('), false);
});
