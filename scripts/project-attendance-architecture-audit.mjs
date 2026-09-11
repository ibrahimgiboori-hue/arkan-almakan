import fs from 'node:fs';
import path from 'node:path';
import {
  assertProjectAttendanceRemoval,
  buildProjectAttendanceWorkspace,
  buildProjectAttendanceWriteRows,
  filterProjectAttendanceWorkers,
  groupProjectAttendanceByContractor,
  optimisticProjectAttendanceMarks,
  projectAttendanceSourceIds,
  summarizeProjectAttendance,
  verifiedProjectAttendanceMarks,
} from '../lib/project-attendance.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-attendance.mjs',
  adapter:'lib/adapters/project-attendance-supabase.js',
  service:'lib/application/project-attendance-service.js',
  presentation:'app/dashboard/projects/[id]/operations/attendance-workspace.js',
  route:'app/dashboard/projects/[id]/operations/page.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project attendance domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectAttendanceSourceIds','buildProjectAttendanceWorkspace','buildProjectAttendanceWriteRows',
    'verifiedProjectAttendanceMarks','optimisticProjectAttendanceMarks','groupProjectAttendanceByContractor',
    'filterProjectAttendanceWorkers','summarizeProjectAttendance','assertProjectAttendanceRemoval',
  ])if(!source.includes(required))fail(`project attendance domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project attendance adapter must own the Supabase dependency.');
  for(const required of [
    'projectAttendanceSupabaseRepository','loadProjectAttendanceDayContextSource','loadProjectAttendanceDayEntities','removeProjectAttendanceEntry',
    "from('timesheet_days')","from('labor_project_assignments')","from('project_contractors')","from('attendance')","rpc('fn_remove_attendance_entry'",
  ])if(!source.includes(required))fail(`project attendance adapter missing persistence contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project attendance service leaked direct infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectAttendanceService','createProjectAttendanceService','loadDay','saveEntries','removeEntry','pendingCount','syncPending',
    'projectAttendanceSupabaseRepository','saveOperationWithQueue','syncPendingOperations','buildProjectAttendanceWriteRows',
  ])if(!source.includes(required))fail(`project attendance service missing orchestration contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-attendance-service"))fail('project attendance presentation must use the application service.');
  if(!source.includes("@/lib/project-attendance.mjs"))fail('project attendance presentation must consume domain projections.');
  if(!source.includes('data-project-attendance-workspace="engineered-v1"'))fail('project attendance presentation must declare the engineered workspace.');
  for(const forbidden of [
    "@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(','fn_remove_attendance_entry',
    'saveOperationWithQueue','syncPendingOperations','pendingOperationCount','selectRosterAssignmentsForDate',
    "from('timesheet_days')","from('attendance')","from('labor_project_assignments')",
  ])if(source.includes(forbidden))fail(`project attendance presentation leaked persistence/write orchestration: ${forbidden}`);
}

if(exists(files.route)&&!read(files.route).includes('AttendanceWorkspace'))fail('project operations route must keep the governed attendance workspace as its daily entry surface.');

const ids=projectAttendanceSourceIds({
  date:'2026-09-12',
  assignmentRows:[
    {id:'a1',laborer_id:'l1',contractor_id:'c1',valid_from:'2026-09-01',valid_to:null,is_active:true},
    {id:'a2',laborer_id:'l2',contractor_id:'c2',valid_from:'2026-09-20',valid_to:null,is_active:true},
  ],
  projectContractorRows:[{contractor_id:'c3'}],
});
if(!ids.contractorIds.includes('c1')||!ids.contractorIds.includes('c3')||ids.contractorIds.includes('c2')||ids.laborerIds.length!==1)fail('project attendance source-id invariant changed.');

const workspace=buildProjectAttendanceWorkspace({
  date:'2026-09-12',
  assignmentRows:[{id:'a1',laborer_id:'l1',contractor_id:'c1',labor_class:'worker',trade:'عامل',daily_rate:90,valid_from:'2026-09-01',valid_to:null,is_active:true}],
  projectContractorRows:[{contractor_id:'c1',basis:'daily'}],
  contractors:[{id:'c1',name_ar:'المقاول'}],
  laborers:[{id:'l1',full_name:'عامل 1',labor_class:'worker',trade:'عامل',daily_rate:80}],
  attendanceRows:[{id:'att1',laborer_id:'l1',status:'leave'}],
});
if(workspace.workers[0]?.daily_rate!==90||workspace.contractors[0]?.project_basis!=='daily'||workspace.marks.l1?.protected!==true)fail('project attendance workspace projection invariant changed.');

const writeRows=buildProjectAttendanceWriteRows([{worker:{id:'l1',daily_rate:'75.5'},status:'half'}]);
if(writeRows[0]?.rate_used!==75.5||writeRows[0]?.status!=='half')fail('project attendance write payload invariant changed.');
try{buildProjectAttendanceWriteRows([{worker:{id:'l1'},status:'leave'}]);fail('project attendance quick-write accepted a protected status.');}catch{}

const verified=verifiedProjectAttendanceMarks([{id:'att1',laborer_id:'l1',status:'stopped'}],'2026-09-12');
const optimistic=optimisticProjectAttendanceMarks([{worker:{id:'l2'},status:'full'}],'2026-09-12','req1');
if(!verified.l1?.protected||optimistic.l2?.pending!==true||optimistic.l2?.request_id!=='req1')fail('project attendance verified/optimistic mark invariant changed.');

const grouped=groupProjectAttendanceByContractor([{id:'c1'},{id:'c2'}],[{id:'l1',contractor_id:'c1'},{id:'l2',contractor_id:'c2'}]);
if(grouped[0]?.workers.length!==1||grouped[1]?.workers.length!==1)fail('project attendance contractor grouping invariant changed.');
const filtered=filterProjectAttendanceWorkers([{id:'l1',contractor_id:'c1',full_name:'أحمد',trade:'نجار',labor_class:'worker'}],'c1','نجار');
if(filtered.length!==1)fail('project attendance worker filter invariant changed.');
const summary=summarizeProjectAttendance([{id:'l1'},{id:'l2'},{id:'l3'}],{l1:{status:'full'},l2:{status:'half'}});
if(summary.total!==3||summary.full!==1||summary.half!==1||summary.absent!==1)fail('project attendance summary invariant changed.');
try{assertProjectAttendanceRemoval({id:'att1',pending:true,protected:false,work_date:'2026-09-12'},'2026-09-12');fail('project attendance removal accepted a pending mark.');}catch{}

if(failures.length){
  console.error('\nProject attendance architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project attendance architecture audit passed: roster projection, verified/offline writes, removal, synchronization, persistence and presentation are separated and attendance invariants are locked.');
