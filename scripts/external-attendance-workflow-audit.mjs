import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const fail=(message)=>failures.push(message);

for(const file of [
  'lib/core/external-attendance-state.js',
  'lib/application/external-attendance-workflow.js',
  'lib/adapters/external-attendance-supabase.js',
  'app/dashboard/attendance/layout.js',
  'components/attendance/DeleteExternalAttendanceBatchButton.js',
]){
  if(!exists(file))fail(`${file}: missing required workflow layer.`);
}

if(exists('lib/core/external-attendance-state.js')){
  const source=read('lib/core/external-attendance-state.js');
  for(const forbidden of ['react','next/','supabase','window.','document.','.css']){
    if(source.includes(forbidden))fail(`external attendance core leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['uploaded','parsed','calibrated','analyzed','justifications','recalculated','ready_to_post','closed']){
    if(!source.includes(`'${required}'`))fail(`external attendance state contract missing status: ${required}`);
  }
}

if(exists('lib/application/external-attendance-workflow.js')){
  const source=read('lib/application/external-attendance-workflow.js');
  for(const required of [
    'EXTERNAL_ATTENDANCE_NAV',
    'EXTERNAL_ATTENDANCE_ACTION_OWNER',
    'create_import:EXTERNAL_ATTENDANCE_STAGE.LAB',
    'submit_justification:EXTERNAL_ATTENDANCE_STAGE.REVIEW',
    'approve_review_result:EXTERNAL_ATTENDANCE_STAGE.REVIEW',
    'calculate_payroll:EXTERNAL_ATTENDANCE_STAGE.PAYROLL',
    'delete_batch:EXTERNAL_ATTENDANCE_STAGE.SHELL',
  ]){
    if(!source.includes(required))fail(`workflow ownership contract missing: ${required}`);
  }
}

if(exists('app/dashboard/attendance/layout.js')){
  const source=read('app/dashboard/attendance/layout.js');
  if(!source.includes("EXTERNAL_ATTENDANCE_NAV"))fail('attendance layout must consume the shared workflow navigation contract.');
  if(source.includes('const ITEMS ='))fail('attendance layout must not keep a second local workflow navigation registry.');
}

if(exists('components/attendance/DeleteExternalAttendanceBatchButton.js')){
  const source=read('components/attendance/DeleteExternalAttendanceBatchButton.js');
  if(!source.includes("@/lib/adapters/external-attendance-supabase"))fail('batch delete control must use the external attendance adapter.');
  if(source.includes("@/lib/supabase"))fail('batch delete presentation must not import Supabase directly.');
  if(source.includes("hr_delete_external_attendance_import"))fail('batch delete RPC name must remain inside the adapter.');
}

if(failures.length){
  console.error('\nExternal attendance workflow audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('External attendance workflow audit passed: state, action ownership, navigation and destructive persistence boundaries are centralized.');
