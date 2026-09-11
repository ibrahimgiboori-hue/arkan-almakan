import fs from 'node:fs';
import path from 'node:path';
import {
  EXTERNAL_PAYROLL_REPORT_COLUMNS,
  buildExternalPayrollReport,
} from '../lib/attendance/external-payroll-report.js';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/attendance/external-payroll.js',
  adapter:'lib/adapters/external-payroll-supabase.js',
  service:'lib/application/external-payroll-workspace-service.js',
  presentation:'components/attendance/ExternalPayrollWorkspaceEngineered.js',
  page:'app/dashboard/attendance/payroll/page.js',
  reportDomain:'lib/attendance/external-payroll-report.js',
  reportAdapter:'lib/adapters/external-payroll-report-supabase.js',
  reportService:'lib/application/external-payroll-report-service.js',
  reportPresentation:'components/print/ExternalPayrollRunReport.js',
  reportRoute:'app/print/external-payroll/[batchId]/page.js',
  reportShortcut:'components/attendance/ExternalPayrollReportShortcut.js',
};

for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','.from(','.rpc(','window.','document.']){
    if(source.includes(forbidden))fail(`payroll domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['calculateExternalPayroll','salaryBreakdown','PAYMENT_METHODS','NATIONALITY_CATEGORIES']){
    if(!source.includes(required))fail(`payroll domain missing rule/contract: ${required}`);
  }
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('payroll adapter must own the Supabase dependency.');
  for(const required of [
    'externalPayrollSupabaseRepository',
    'listExternalPayrollReadyImports',
    'loadExternalPayrollAttendanceDays',
    'createExternalPayrollBatch',
    'loadExternalPayrollProfiles',
    'loadExternalPayrollLines',
    'updateExternalPayrollBatch',
    'updateExternalPayrollProfile',
    'updateExternalPayrollLine',
    'uploadExternalPayrollBrandAsset',
  ])if(!source.includes(required))fail(`payroll adapter missing persistence operation: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','storage.from(','window.','document.']){
    if(source.includes(forbidden))fail(`payroll application service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'createExternalPayrollWorkspaceService',
    'externalPayrollWorkspaceService',
    'loadWorkspace',
    'saveInputs',
    'saveProfile',
    'saveImportedRow',
    'uploadLetterhead',
    'persistCalculation',
    'finishCalculation',
  ])if(!source.includes(required))fail(`payroll application service missing use case: ${required}`);
  if(!source.includes('externalPayrollSupabaseRepository'))fail('payroll application service must depend on the repository contract.');
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/external-payroll-workspace-service"))fail('payroll presentation must use the application service.');
  for(const forbidden of [
    "@/lib/supabase",
    '.from(',
    '.rpc(',
    'storage.from(',
    'hr_external_payroll_batches',
    'hr_external_payroll_lines',
    'hr_client_external_employee_profiles',
    'v_hr_attendance_processing_days',
    "storage.from('brand')",
  ])if(source.includes(forbidden))fail(`payroll presentation leaked persistence detail: ${forbidden}`);
}

if(exists(files.page)){
  const source=read(files.page);
  if(!source.includes('ExternalPayrollWorkspaceEngineered'))fail('payroll route must use the engineered workspace.');
  if(!source.includes('ExternalPayrollReportShortcut'))fail('payroll route must expose the governed monthly report entry point.');
  if(source.includes('ExternalPayrollWorkspace\'' )||source.includes('ExternalPayrollWorkspace"'))fail('payroll route still references the legacy workspace.');
}

if(exists(files.reportDomain)){
  const source=read(files.reportDomain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','.from(','.rpc(','window.','document.']){
    if(source.includes(forbidden))fail(`payroll report projection leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['EXTERNAL_PAYROLL_REPORT_GROUPS','EXTERNAL_PAYROLL_REPORT_COLUMNS','buildExternalPayrollReport','otherAllowances','otherDeductions','reconciliationOk']){
    if(!source.includes(required))fail(`payroll report projection missing contract: ${required}`);
  }
}

if(exists(files.reportAdapter)){
  const source=read(files.reportAdapter);
  if(!source.includes("@/lib/supabase"))fail('payroll report adapter must own the Supabase dependency.');
  for(const required of ['findExternalPayrollRunByImport','loadExternalPayrollRunSource','externalPayrollReportSupabaseRepository']){
    if(!source.includes(required))fail(`payroll report adapter missing read operation: ${required}`);
  }
}

if(exists(files.reportService)){
  const source=read(files.reportService);
  for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','window.','document.']){
    if(source.includes(forbidden))fail(`payroll report service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['createExternalPayrollReportService','externalPayrollReportService','findRunByImport','loadRun','buildExternalPayrollReport']){
    if(!source.includes(required))fail(`payroll report service missing contract: ${required}`);
  }
}

if(exists(files.reportPresentation)){
  const source=read(files.reportPresentation);
  for(const forbidden of ['@/lib/supabase','.from(','hr_external_payroll_lines','hr_attendance_imports']){
    if(source.includes(forbidden))fail(`payroll report presentation leaked persistence detail: ${forbidden}`);
  }
  for(const required of ['PRINT_FLOW_KIND.REPEATABLE_TABLE','مسير الرواتب الشهري','بدلات أخرى','خصم الاشتراكات','صافي الراتب المستحق']){
    if(!source.includes(required))fail(`payroll report presentation missing report contract: ${required}`);
  }
}

if(exists(files.reportRoute)){
  const source=read(files.reportRoute);
  for(const forbidden of ['@/lib/supabase','.from(','hr_external_payroll_lines','hr_attendance_imports']){
    if(source.includes(forbidden))fail(`payroll report route leaked persistence detail: ${forbidden}`);
  }
  for(const required of ['externalPayrollReportService','ConstitutionPrintFrame','documentKey="payroll_run"','ExternalPayrollRunReport']){
    if(!source.includes(required))fail(`payroll report route missing governed layer: ${required}`);
  }
}

if(exists(files.reportShortcut)){
  const source=read(files.reportShortcut);
  if(!source.includes('externalPayrollReportService'))fail('payroll report shortcut must resolve the active run through the report service.');
  if(!source.includes('/print/external-payroll/'))fail('payroll report shortcut must target the governed print route.');
}

if(exists('components/attendance/ExternalPayrollWorkspace.js'))fail('legacy external payroll workspace still exists; remove the direct-persistence implementation.');

const otherAllowanceColumn=EXTERNAL_PAYROLL_REPORT_COLUMNS.find((column)=>column.key==='otherAllowances');
if(!otherAllowanceColumn||otherAllowanceColumn.label!=='بدلات أخرى')fail('payroll report must permanently expose the other allowances column.');

const reportFixture=buildExternalPayrollReport({
  lines:[{
    id:'audit-line',external_person_id:'audit-person',source_employee_key:'external:audit-person',calculated_at:'2026-09-11T00:00:00Z',
    calculation_snapshot:{
      employee:{employee_no:'E001',display_name:'Audit Employee'},
      salary:{basic_salary:1000,housing_allowance:200,transport_allowance:100,other_allowances:50,gosi_employee_deduction:100},
      attendance:{absence_days:1,missing_in_count:1,missing_out_count:0},
      calculation:{absence_amount:30,missing_punch_amount:10,time_amount:20,manual_additions:5,manual_deductions:15,final_net_salary:1220},
    },
  }],
  days:[
    {external_person_id:'audit-person',day_status:'complete'},
    {external_person_id:'audit-person',day_status:'complete'},
  ],
});
if(!reportFixture.reconciliationOk)fail('payroll report fixture does not reconcile visible earnings/deductions to stored net salary.');
if(reportFixture.rows[0]?.completeDays!==2)fail('payroll report attendance projection does not count complete attendance days.');
if(reportFixture.rows[0]?.otherAllowances!==50)fail('payroll report lost other allowances.');
if(reportFixture.totals?.netPay!==1220)fail('payroll report totals do not preserve stored net salary.');

if(failures.length){
  console.error('\nExternal payroll architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('External payroll architecture audit passed: payroll rules, persistence, report projection, accounting reconciliation, governed printing and presentation have explicit boundaries.');
