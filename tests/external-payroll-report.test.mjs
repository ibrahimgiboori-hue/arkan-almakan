import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTERNAL_PAYROLL_REPORT_COLUMNS,
  EXTERNAL_PAYROLL_REPORT_GROUPS,
  buildExternalPayrollReport,
} from '../lib/attendance/external-payroll-report.js';

test('external payroll report keeps approved two-level column contract',()=>{
  assert.deepEqual(EXTERNAL_PAYROLL_REPORT_GROUPS.map((group)=>group.label),[
    'البيانات الوظيفية','ملخص الحضور','الاستحقاقات','الإضافات','الاستقطاعات','صافي المستحق',
  ]);
  assert.ok(EXTERNAL_PAYROLL_REPORT_COLUMNS.some((column)=>column.key==='otherAllowances'&&column.label==='بدلات أخرى'));
  assert.ok(EXTERNAL_PAYROLL_REPORT_COLUMNS.some((column)=>column.key==='otherDeductions'&&column.label==='خصومات أخرى'));
  assert.equal(EXTERNAL_PAYROLL_REPORT_COLUMNS.at(-1).key,'netPay');
});

test('external payroll report reconciles visible earnings and deductions to stored net salary',()=>{
  const report=buildExternalPayrollReport({
    batch:{id:'batch-1',status:'calculated'},
    attendanceImport:{client_name_snapshot:'مركز اختبار',period_from:'2026-08-01',period_to:'2026-08-31'},
    profiles:[{source_employee_key:'external:p1',display_employee_no:'E001',display_name:'موظف 1'}],
    days:[
      {external_person_id:'p1',day_status:'complete'},
      {external_person_id:'p1',day_status:'complete'},
      {external_person_id:'p1',day_status:'complete'},
      {external_person_id:'p1',day_status:'off'},
    ],
    lines:[{
      id:'line-1',external_person_id:'p1',source_employee_key:'external:p1',calculated_at:'2026-09-11T00:00:00Z',
      calculation_snapshot:{
        employee:{employee_no:'E001',display_name:'موظف 1'},
        salary:{basic_salary:1000,housing_allowance:200,transport_allowance:100,other_allowances:50,gosi_employee_deduction:100},
        attendance:{absence_days:1,missing_in_count:1,missing_out_count:0},
        calculation:{absence_amount:30,missing_punch_amount:10,time_amount:20,manual_additions:5,manual_deductions:15,final_net_salary:1220},
      },
    }],
  });

  assert.equal(report.rows.length,1);
  assert.equal(report.rows[0].completeDays,3);
  assert.equal(report.rows[0].missingPunches,1);
  assert.equal(report.rows[0].otherAllowances,50);
  assert.equal(report.rows[0].overtimeAddition,20);
  assert.equal(report.rows[0].subscriptionDeduction,100);
  assert.equal(report.rows[0].otherDeductions,25);
  assert.equal(report.totals.deductions,155);
  assert.equal(report.totals.netPay,1220);
  assert.equal(report.reconciliationOk,true);
  assert.equal(report.uncalculatedCount,0);
});

test('external payroll report exposes reconciliation exceptions instead of hiding them',()=>{
  const report=buildExternalPayrollReport({
    lines:[{
      id:'line-x',external_person_id:'p2',source_employee_key:'external:p2',calculated_at:'2026-09-11T00:00:00Z',
      calculation_snapshot:{
        employee:{employee_no:'E002',display_name:'موظف 2'},
        salary:{basic_salary:1000,housing_allowance:0,transport_allowance:0,other_allowances:0,gosi_employee_deduction:0},
        attendance:{absence_days:0,missing_in_count:0,missing_out_count:0},
        calculation:{absence_amount:0,missing_punch_amount:0,time_amount:0,manual_additions:0,manual_deductions:0,final_net_salary:999},
      },
    }],
  });

  assert.equal(report.reconciliationOk,false);
  assert.equal(report.reconciliationExceptions.length,1);
  assert.equal(report.reconciliationExceptions[0].difference,1);
});
