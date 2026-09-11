import fs from 'node:fs';
import path from 'node:path';
import {
  ProgressClaimImpactError,
  assertProgressClaimImpactAcknowledged,
  buildProgressEditPayload,
  buildProgressRecordPayload,
  buildProjectProgressWorkspace,
  progressEntryClaimImpact,
} from '../lib/project-progress.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-progress.mjs',
  adapter:'lib/adapters/project-progress-supabase.js',
  service:'lib/application/project-progress-service.js',
  presentation:'components/ProjProgress.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project progress domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'ProgressClaimImpactError','buildProjectProgressWorkspace','progressEntryClaimImpact','assertProgressClaimImpactAcknowledged',
    'buildProgressRecordPayload','buildProgressEditPayload','progressClaimImpactMessage','PROJECT_PROGRESS_CLAIM_STAGE_LABELS',
  ])if(!source.includes(required))fail(`project progress domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project progress adapter must own Supabase.');
  for(const required of [
    'projectProgressSupabaseRepository',"from('v_item_progress')","from('progress_entries')","from('progress_claims')",
    'loadProjectProgressEntry','createProjectProgressEntry','updateProjectProgressEntry','deleteProjectProgressEntry',
    ".select('*').single()",".select('*').maybeSingle()",".select('id').maybeSingle()",
  ])if(!source.includes(required))fail(`project progress adapter missing persistence/proof contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project progress service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectProgressService','createProjectProgressService','loadWorkspace','record','loadMutationImpact','updateEntry','deleteEntry',
    'projectProgressSupabaseRepository','assertProgressClaimImpactAcknowledged','todayIsoInRiyadh','repository.loadEntry','repository.loadClaim',
  ])if(!source.includes(required))fail(`project progress service missing orchestration/claim-impact contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-progress-service"))fail('project progress presentation must use the application service.');
  if(!source.includes("@/lib/project-progress.mjs"))fail('project progress presentation must consume domain contracts.');
  if(!source.includes('data-project-progress-workspace="engineered-v1"'))fail('project progress presentation must declare the engineered workspace.');
  for(const forbidden of [
    "@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(',"from('progress_entries')","from('progress_claims')",
  ])if(source.includes(forbidden))fail(`project progress presentation leaked persistence detail: ${forbidden}`);
  for(const required of [
    'projectProgressService.loadWorkspace','projectProgressService.record','projectProgressService.updateEntry','projectProgressService.deleteEntry',
    'CLAIM_IMPACT_CONFIRM_REQUIRED','progressClaimImpactMessage',
  ])if(!source.includes(required))fail(`project progress presentation lost guarded behavior: ${required}`);
}

const workspace=buildProjectProgressWorkspace({
  progressRows:[{project_item_id:'i1'}],
  entries:[{id:'e1',project_item_id:'i1',claim_id:'c1'}],
  claims:[{id:'c1',claim_no:'CL-1',status:'submitted'}],
});
if(workspace.rows.length!==1||workspace.entries.length!==1||workspace.claims.c1?.claim_no!=='CL-1')fail('project progress workspace projection invariant changed.');

const impact=progressEntryClaimImpact({id:'e1',claim_id:'c1'},{id:'c1',claim_no:'CL-1',status:'submitted'});
if(!impact.linked||!impact.leftDraft||impact.claimStageLabel!=='مقدَّم للمالك')fail('project progress claim-impact projection invariant changed.');
try{
  assertProgressClaimImpactAcknowledged({id:'e1',claim_id:'c1'},{id:'c1',status:'draft'},false);
  fail('project progress mutation accepted claim impact without acknowledgement.');
}catch(error){
  if(!(error instanceof ProgressClaimImpactError)||error.code!=='CLAIM_IMPACT_CONFIRM_REQUIRED')fail('project progress claim-impact guard returned the wrong error contract.');
}

const record=buildProgressRecordPayload({item:{project_item_id:'i1'},form:{qty:'12.5',pct:'50',notes:' test '},defaultDate:'2026-09-12'});
if(record.project_item_id!=='i1'||record.qty_done!==12.5||record.manual_pct!==50||record.notes!=='test'||record.entry_date!=='2026-09-12')fail('project progress record payload invariant changed.');
const edit=buildProgressEditPayload({entry:{id:'e1',entry_date:'2026-09-01',notes:'قديم'},draft:{entry_date:'2026-09-02',qty_done:'9',manual_pct:''},reason:' تصحيح ',editDate:'2026-09-12'});
if(edit.qty_done!==9||edit.manual_pct!==null||edit.notes!=='قديم | تعديل 2026-09-12: تصحيح')fail('project progress edit/audit-stamp invariant changed.');

if(failures.length){
  console.error('\nProject progress architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project progress architecture audit passed: progress projection, creation, claim-impact acknowledgement, verified mutation persistence and presentation are separated and guarded.');
