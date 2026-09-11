import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const fail=(message)=>failures.push(message);

for(const file of [
  'lib/core/external-attendance-state.js',
  'lib/core/external-attendance-review.js',
  'lib/application/external-attendance-workflow.js',
  'lib/application/external-attendance-review-service.js',
  'lib/adapters/external-attendance-supabase.js',
  'app/dashboard/attendance/layout.js',
  'components/attendance/DeleteExternalAttendanceBatchButton.js',
]){
  if(!exists(file))fail(`${file}: missing required workflow layer.`);
}

for(const coreFile of ['lib/core/external-attendance-state.js','lib/core/external-attendance-review.js']){
  if(!exists(coreFile))continue;
  const source=read(coreFile);
  for(const forbidden of ['react','next/','supabase','window.','document.','.css']){
    if(source.includes(forbidden))fail(`${coreFile}: core leaked infrastructure/presentation: ${forbidden}`);
  }
}

if(exists('lib/core/external-attendance-state.js')){
  const source=read('lib/core/external-attendance-state.js');
  for(const required of ['uploaded','parsed','calibrated','analyzed','justifications','recalculated','ready_to_post','closed']){
    if(!source.includes(`'${required}'`))fail(`external attendance state contract missing status: ${required}`);
  }
}

if(exists('lib/core/external-attendance-review.js')){
  const source=read('lib/core/external-attendance-review.js');
  for(const required of [
    'externalAttendanceReviewGroupForStatus',
    'externalAttendanceReviewCaseState',
    'isExternalAttendanceJustificationAllowed',
    'summarizeExternalAttendanceReview',
  ]){
    if(!source.includes(required))fail(`review core missing rule: ${required}`);
  }
  if(!source.includes("missing_punch")||!source.includes("approved_leave"))fail('review core must own the absence-vs-missing-punch justification policy.');
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

if(exists('lib/application/external-attendance-review-service.js')){
  const source=read('lib/application/external-attendance-review-service.js');
  for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','window.','document.']){
    if(source.includes(forbidden))fail(`review application service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['createExternalAttendanceReviewService','submitMany','decideMany','approveResult','summarizeExternalAttendanceReview']){
    if(!source.includes(required))fail(`review application service missing orchestration contract: ${required}`);
  }
}

if(exists('lib/adapters/external-attendance-supabase.js')){
  const source=read('lib/adapters/external-attendance-supabase.js');
  for(const required of [
    'externalAttendanceSupabaseRepository',
    'loadExternalAttendanceProcessingDays',
    'startExternalAttendanceReview',
    'submitExternalAttendanceJustification',
    'decideExternalAttendanceJustification',
    'recalculateExternalAttendanceImport',
  ]){
    if(!source.includes(required))fail(`external attendance adapter missing persistence operation: ${required}`);
  }
}

if(exists('app/dashboard/attendance/layout.js')){
  const source=read('app/dashboard/attendance/layout.js');
  if(!source.includes('EXTERNAL_ATTENDANCE_NAV'))fail('attendance layout must consume the shared workflow navigation contract.');
  if(source.includes('const ITEMS ='))fail('attendance layout must not keep a second local workflow navigation registry.');
}

if(exists('components/attendance/DeleteExternalAttendanceBatchButton.js')){
  const source=read('components/attendance/DeleteExternalAttendanceBatchButton.js');
  if(!source.includes("@/lib/adapters/external-attendance-supabase"))fail('batch delete control must use the external attendance adapter.');
  if(source.includes("@/lib/supabase"))fail('batch delete presentation must not import Supabase directly.');
  if(source.includes('hr_delete_external_attendance_import'))fail('batch delete RPC name must remain inside the adapter.');
}

if(failures.length){
  console.error('\nExternal attendance workflow audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('External attendance workflow audit passed: state, review rules, application orchestration, navigation and persistence boundaries are centralized.');
