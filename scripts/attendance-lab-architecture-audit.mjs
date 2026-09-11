import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  adapter:'lib/adapters/attendance-lab-workspace-supabase.js',
  service:'lib/application/attendance-lab-workspace-service.js',
  presentation:'components/attendance/AttendanceLabWorkspaceEngineered.js',
  page:'app/dashboard/attendance/page.js',
  debt:'lib/architecture/attendance-presentation-debt.mjs',
};

for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('lab adapter must own the Supabase dependency.');
  for(const required of ['attendanceLabWorkspaceSupabaseRepository','listAttendanceLabImports','listAttendanceEmployees','loadAttendanceLabImport','importAttendancePunches','loadAttendanceSchedule','saveAttendanceSchedule','runAttendanceLabStage','loadAttendanceLabExportData'])if(!source.includes(required))fail(`lab adapter missing persistence operation: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.from(','supabase.rpc(','storage.from(','window.','document.'])if(source.includes(forbidden))fail(`lab application service leaked infrastructure/presentation: ${forbidden}`);
  for(const required of ['createAttendanceLabWorkspaceService','attendanceLabWorkspaceService','createBatch','loadSchedule','saveSchedule','runStage','loadExportData'])if(!source.includes(required))fail(`lab application service missing use case: ${required}`);
  if(!source.includes('attendanceLabWorkspaceSupabaseRepository'))fail('lab application service must depend on the repository contract.');
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/attendance-lab-workspace-service"))fail('lab presentation must use the application service.');
  for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.from(','supabase.rpc(','storage.from(','hr_attendance_imports','hr_attendance_processing_events','hr_attendance_external_people','hr_save_external_attendance_schedule','hr_save_employee_work_schedule','hr_import_attendance_punches'])if(source.includes(forbidden))fail(`lab presentation leaked persistence detail: ${forbidden}`);
  if(!source.includes('nu-latn'))fail('lab presentation must render localized dates with Latin digits.');
}

if(exists(files.page)){
  const source=read(files.page);
  if(!source.includes('AttendanceLabWorkspaceEngineered'))fail('attendance route must use the engineered lab workspace.');
  if(source.includes("@/lib/supabase"))fail('attendance route must not import Supabase directly.');
}

if(exists(files.debt)){
  const source=read(files.debt);
  if(!source.includes('ATTENDANCE_PRESENTATION_INFRASTRUCTURE_DEBT = Object.freeze([])'))fail('attendance presentation debt ledger must be empty after lab retirement.');
}

if(failures.length){
  console.error('\nAttendance lab architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Attendance lab architecture audit passed: lab presentation, orchestration and persistence are separated and presentation debt is zero.');
