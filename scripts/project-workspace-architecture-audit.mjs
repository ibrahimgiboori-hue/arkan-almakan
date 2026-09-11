import fs from 'node:fs';
import path from 'node:path';
import {
  buildProjectWorkspaceAccess,
  normalizeProjectWorkspacePatch,
  projectSetupState,
  projectWorkspaceCanWrite,
  projectWorkspaceOverview,
  selectProjectSetupAction,
} from '../lib/project-workspace.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-workspace.mjs',
  adapter:'lib/adapters/project-workspace-supabase.js',
  service:'lib/application/project-workspace-service.js',
  presentation:'app/dashboard/projects/[id]/page.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project workspace domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'PROJECT_WORKSPACE_EDITABLE_FIELDS','buildProjectWorkspaceAccess','projectWorkspaceCanWrite',
    'normalizeProjectWorkspacePatch','selectProjectSetupAction','projectWorkspaceOverview','projectSetupState',
  ])if(!source.includes(required))fail(`project workspace domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project workspace adapter must own Supabase.');
  for(const required of [
    'projectWorkspaceSupabaseRepository','loadProjectWorkspaceSource','loadProjectWorkspaceFinancials',
    'loadProjectSetupApprovalQueue','updateProjectWorkspace','submitProjectSetupApproval','loadProjectSetupApprovalProof',
    "from('projects')","from('v_project_financials')","from('v_project_totals')","from('v_my_capabilities')",
    "rpc('fn_project_approval_queue'","rpc('fn_submit_project_setup_for_approval'","rpc('fn_approval_get'",
    ".select('*').maybeSingle()",
  ])if(!source.includes(required))fail(`project workspace adapter missing persistence contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project workspace service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectWorkspaceService','createProjectWorkspaceService','loadWorkspace','loadFinancials','loadSetupAction','patchProject','submitSetupForApproval',
    'projectWorkspaceSupabaseRepository','Promise.allSettled','readErrors','normalizeProjectWorkspacePatch','loadSetupApprovalProof',
    'proof?.workflow?.id',
  ])if(!source.includes(required))fail(`project workspace service missing orchestration contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-workspace-service"))fail('project workspace presentation must use the application service.');
  if(!source.includes("@/lib/project-workspace.mjs"))fail('project workspace presentation must use domain projections.');
  for(const forbidden of [
    "@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(',
    'fn_project_approval_queue','fn_submit_project_setup_for_approval','fn_approval_get',
    'v_project_financials','v_project_totals','v_my_capabilities','fn_is_primary_user',
  ])if(source.includes(forbidden))fail(`project workspace presentation leaked persistence/auth detail: ${forbidden}`);
  for(const required of [
    'projectWorkspaceService.loadWorkspace','projectWorkspaceService.patchProject','projectWorkspaceService.submitSetupForApproval',
    'projectWorkspaceCanWrite','projectWorkspaceOverview','projectSetupState','workspace.readErrors',
    'ProjScope','ProjProgress','ProjClaims','ProjDocs','ProjGuarantees','data-project-setup-journey="true"',
  ])if(!source.includes(required))fail(`project workspace presentation lost governed behavior: ${required}`);
}

const access=buildProjectWorkspaceAccess({
  projectId:'p1',
  capabilities:[
    {capability_key:'projects.scope.edit',module_key:'projects',scope_type:'project',scope_key:'p1',source_key:'role'},
    {capability_key:'projects.progress.edit',module_key:'projects',scope_type:'project',scope_key:'p2',source_key:'role'},
  ],
});
if(access.full||access.keys.length!==1||access.keys[0]!=='projects.scope.edit')fail('project workspace scoped-access invariant changed.');
const fullAccess=buildProjectWorkspaceAccess({
  projectId:'p1',
  capabilities:[{capability_key:'projects.projects.edit',module_key:'projects',scope_type:'project',scope_key:'p1',source_key:'projects_full_access'}],
});
if(!fullAccess.full)fail('project workspace full-access source invariant changed.');
if(!projectWorkspaceCanWrite('scope',access)||projectWorkspaceCanWrite('progress',access))fail('project workspace view-write invariant changed.');

const patch=normalizeProjectWorkspacePatch({name_ar:'مشروع',city:'الرياض',evil_field:'no'});
if(patch.name_ar!=='مشروع'||patch.city!=='الرياض'||Object.hasOwn(patch,'evil_field'))fail('project workspace patch whitelist invariant changed.');
try{normalizeProjectWorkspacePatch({evil_field:'no'});fail('project workspace patch whitelist accepted an empty allowed patch.');}catch{}

const setup=selectProjectSetupAction([{source_type:'other',id:'1'},{source_type:'project_setup',id:'2',approval_status:'returned'}]);
if(setup?.id!=='2'||!projectSetupState(setup).returned)fail('project setup action/state invariant changed.');
const overview=projectWorkspaceOverview({contract_value:100},{current_profit:'25',days_remaining:-2},{contract_value_effective:150,contract_value_approved:true});
if(overview.contractValue!==150||!overview.contractApproved||overview.profit!==25||overview.daysLeft!==-2)fail('project workspace overview invariant changed.');

if(failures.length){
  console.error('\nProject workspace architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project workspace architecture audit passed: project identity, scoped access, financial projections, settings writes and setup approval orchestration are separated from persistence and presentation.');
