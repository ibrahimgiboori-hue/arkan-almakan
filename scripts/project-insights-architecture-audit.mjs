import fs from 'node:fs';
import path from 'node:path';
import {
  PROJECT_INSIGHT_SECTIONS,
  buildProjectInsight,
  projectChangesInsight,
  projectInsightCanAccess,
  projectPlanningInsight,
} from '../lib/project-insights.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-insights.mjs',
  adapter:'lib/adapters/project-insights-supabase.js',
  service:'lib/application/project-insights-service.js',
  presentation:'app/dashboard/projects/[id]/insights/[section]/page.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project insights domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'PROJECT_INSIGHT_SECTIONS','projectInsightStatus','projectInsightCanAccess','projectPlanningInsight',
    'projectCostControlInsight','projectChangesInsight','projectCorrespondenceInsight','buildProjectInsight',
  ])if(!source.includes(required))fail(`project insights domain missing rule/projection: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project insights adapter must own Supabase.');
  for(const required of [
    'projectInsightsSupabaseRepository','loadAccessContext','supabase.auth.getSession',"from('app_users')", "from('v_my_capabilities')",
    "rpc('fn_is_primary_user'", "from('projects')",'loadPlanning',"from('project_items')", "from('v_item_duration')",
    "from('project_cashflow_timing')",'loadCostControl',"from('v_project_financials')", "from('project_financial_snapshots')",
    'loadChanges',"from('change_orders')",'loadCorrespondence',"from('site_documents')", "from('documents')",
  ])if(!source.includes(required))fail(`project insights adapter missing scoped persistence/access contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project insights service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectInsightsService','createProjectInsightsService','projectNavRequirement','projectInsightCanAccess','loadAccessContext',
    'loadSource','repository.loadPlanning','repository.loadCostControl','repository.loadChanges','repository.loadCorrespondence',
    'buildProjectInsight','allowed:true','data:null','تعذر تحميل بيانات القسم',
  ])if(!source.includes(required))fail(`project insights service missing orchestration/access contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-insights-service"))fail('project insight presentation must use the application service.');
  if(!source.includes("@/lib/project-insights.mjs"))fail('project insight presentation must use domain section definitions.');
  if(!source.includes('data-project-insight-workspace="engineered-v1"'))fail('project insight presentation must declare the engineered workspace.');
  for(const forbidden of [
    "@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(','supabase.auth','projectNavRequirement','v_my_capabilities',
    "from('project_items')","from('change_orders')","from('v_project_financials')",
  ])if(source.includes(forbidden))fail(`project insight presentation leaked persistence/access detail: ${forbidden}`);
  if(!source.includes('projectInsightsService.loadWorkspace'))fail('project insight presentation lost governed loading.');
}

if(Object.keys(PROJECT_INSIGHT_SECTIONS).join(',')!=='planning,cost-control,changes,correspondence')fail('project insight section catalog changed unexpectedly.');
if(!projectInsightCanAccess({required:['projects.progress.view'],capabilities:[{capability_key:'projects.progress.view'}]})||projectInsightCanAccess({required:['projects.progress.view'],capabilities:[]}))fail('project insight capability invariant changed.');
if(!projectInsightCanAccess({required:['x'],primary:true})||!projectInsightCanAccess({required:['x'],isSystemAdmin:true}))fail('project insight full-access invariant changed.');
const planning=projectPlanningInsight({items:[{id:'i1',sort_order:1,description_ar:'بند',contract_qty:10,unit:'م2'}],durations:[{project_item_id:'i1',first_day:'2026-09-01',days_spent:2,total_output:3}],timing:[]});
if(planning.summary[0].value!==1||planning.summary[2].value!==1||planning.rows[0][1]!=='بند')fail('project planning insight projection invariant changed.');
const changes=projectChangesInsight([{co_number:'CO-1',status:'draft',duration_days:3},{co_number:'CO-2',status:'approved',duration_days:2}]);
if(changes.summary[0].value!==2||changes.summary[1].value!==1||changes.summary[2].value!=='5 يوم')fail('project change insight projection invariant changed.');
if(buildProjectInsight('changes',{changes:[]}).columns[0]!=='رقم التغيير')fail('project insight section dispatch invariant changed.');

if(failures.length){
  console.error('\nProject insights architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project insights architecture audit passed: shared access policy, scoped sources, planning/financial/change/correspondence projections and presentation are separated and guarded.');
