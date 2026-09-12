import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_GUARANTEE_KINDS,
  buildGuaranteeRecord,
  guaranteeExpiryState,
} from '../lib/project-guarantees.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-guarantees.mjs',
  adapter:'lib/adapters/project-guarantees-supabase.js',
  service:'lib/application/project-guarantees-service.js',
  presentation:'components/ProjGuarantees.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project guarantees domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['PROJECT_GUARANTEE_KINDS','guaranteeExpiryState','buildGuaranteeRecord','buildProjectGuaranteesWorkspace']){
    if(!source.includes(required))fail(`project guarantees domain missing rule: ${required}`);
  }
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project guarantees adapter must own Supabase.');
  for(const required of ['projectGuaranteesSupabaseRepository',"from('guarantees')","from('retentions')",".eq('project_id',projectId)"]){
    if(!source.includes(required))fail(`project guarantees adapter missing scoped persistence contract: ${required}`);
  }
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project guarantees service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['projectGuaranteesService','createProjectGuaranteesService','loadWorkspace','addGuarantee','todayIsoInRiyadh','projectGuaranteesSupabaseRepository']){
    if(!source.includes(required))fail(`project guarantees service missing orchestration/proof contract: ${required}`);
  }
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-guarantees-service"))fail('ProjGuarantees must use the project guarantees service.');
  if(!source.includes("@/lib/project-guarantees.mjs"))fail('ProjGuarantees must consume domain guarantee contracts.');
  for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(']){
    if(source.includes(forbidden))fail(`ProjGuarantees leaked persistence detail: ${forbidden}`);
  }
  for(const required of ['projectGuaranteesService.loadWorkspace','projectGuaranteesService.addGuarantee','expiry_state']){
    if(!source.includes(required))fail(`ProjGuarantees lost governed behavior: ${required}`);
  }
}

if(PROJECT_GUARANTEE_KINDS.performance!=='حسن تنفيذ'||PROJECT_GUARANTEE_KINDS.advance!=='دفعة مقدمة')fail('guarantee kind catalog changed unexpectedly.');
const record=buildGuaranteeRecord({projectId:'p1',form:{kind:'performance',issuer:' bank ',reference_no:' 1 ',amount:'2500',expiry_date:'2026-10-12'}});
if(record.project_id!=='p1'||record.issuer!=='bank'||record.reference_no!=='1'||record.amount!==2500)fail('guarantee payload normalization invariant changed.');
const warning=guaranteeExpiryState('2026-10-01','2026-09-12');
const expired=guaranteeExpiryState('2026-09-10','2026-09-12');
if(warning?.daysLeft!==19||warning?.tone!=='warn'||expired?.daysLeft!==-2||expired?.tone!=='bad')fail('guarantee Riyadh calendar expiry invariant changed.');

if(failures.length){
  console.error('\nProject guarantees architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project guarantees architecture audit passed: guarantee rules, Riyadh-calendar expiry projection, scoped persistence, retentions and presentation are separated and guarded.');
