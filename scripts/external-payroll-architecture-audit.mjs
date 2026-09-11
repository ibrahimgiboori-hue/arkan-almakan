import fs from 'node:fs';
import path from 'node:path';

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
  if(source.includes('ExternalPayrollWorkspace\'' )||source.includes('ExternalPayrollWorkspace"'))fail('payroll route still references the legacy workspace.');
}

if(exists('components/attendance/ExternalPayrollWorkspace.js'))fail('legacy external payroll workspace still exists; remove the direct-persistence implementation.');

if(failures.length){
  console.error('\nExternal payroll architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('External payroll architecture audit passed: payroll rules, orchestration, persistence and presentation have explicit boundaries.');
