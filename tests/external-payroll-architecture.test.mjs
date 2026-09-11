import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const engine = read('lib/attendance/external-payroll.js');
const service = read('lib/application/external-payroll-workspace-service.js');
const adapter = read('lib/adapters/external-payroll-supabase.js');
const workspace = read('components/attendance/ExternalPayrollWorkspaceEngineered.js');
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

test('payroll workspace delegates persistence and orchestration to the application service', () => {
  assert.match(workspace, /from '@\/lib\/application\/external-payroll-workspace-service'/);
  assert.equal(workspace.includes("@/lib/supabase"), false);
  assert.equal(workspace.includes('supabase.from('), false);
  assert.equal(workspace.includes('supabase.rpc('), false);
  assert.equal(workspace.includes('hr_external_payroll_batches'), false);
  assert.equal(workspace.includes('hr_external_payroll_lines'), false);
  assert.equal(workspace.includes('hr_client_external_employee_profiles'), false);
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

test('payroll application service is infrastructure-agnostic and adapter owns Supabase', () => {
  assert.match(service, /externalPayrollSupabaseRepository/);
  assert.equal(service.includes("@/lib/supabase"), false);
  assert.equal(service.includes('supabase.from('), false);
  assert.equal(service.includes('supabase.rpc('), false);
  assert.match(adapter, /from '@\/lib\/supabase'/);
  assert.match(adapter, /externalPayrollSupabaseRepository/);
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
