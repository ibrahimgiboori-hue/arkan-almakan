import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const route='app/dashboard/projects/[id]/operations/labor/page.js';
const presentation='app/dashboard/projects/[id]/operations/labor/ProjectLaborWorkspaceEngineered.js';
const domain='lib/project-labor.mjs';
const service='lib/application/project-labor-service.js';
const adapter='lib/adapters/project-labor-supabase.js';
const retiredContractorRoute='app/dashboard/contractors/[id]/labor/page.js';
const legacyRouter='app/dashboard/labor/page.js';
const retiredSiteOperationsRoute='app/dashboard/site-operations/page.js';
const sourceRoots=['app','components','lib'];
const extensions=new Set(['.js','.jsx','.mjs','.ts','.tsx']);
const failures=[];

function fail(message){failures.push(message);}
function exists(relative){return fs.existsSync(path.join(root,relative));}
function read(relative){return exists(relative)?fs.readFileSync(path.join(root,relative),'utf8'):'';}
function walk(relativeDir){
  const absoluteDir=path.join(root,relativeDir);
  if(!fs.existsSync(absoluteDir))return[];
  return fs.readdirSync(absoluteDir,{withFileTypes:true}).flatMap((entry)=>{
    const relative=path.join(relativeDir,entry.name).replaceAll('\\','/');
    if(entry.isDirectory())return walk(relative);
    return extensions.has(path.extname(entry.name))?[relative]:[];
  });
}

for(const file of [route,presentation,domain,service,adapter])if(!exists(file))fail(`missing canonical labor layer: ${file}`);

const routeSource=read(route);
if(!routeSource.includes('ProjectLaborWorkspaceEngineered'))fail('project labor route must delegate to the engineered workspace.');
for(const forbidden of ['@/lib/supabase','.from(','.rpc(','fn_quick_add_workers'])if(routeSource.includes(forbidden))fail(`labor route leaked implementation detail: ${forbidden}`);

const presentationSource=read(presentation);
if(!presentationSource.includes("@/lib/application/project-labor-service"))fail('labor presentation must use projectLaborService.');
if(!presentationSource.includes('data-canonical-labor-create-form="true"'))fail('labor presentation must visibly declare the single labor-create form.');
for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','fn_quick_add_workers','fn_move_laborer','fn_assign_existing_laborer','fn_update_labor_assignment']){
  if(presentationSource.includes(forbidden))fail(`labor presentation leaked persistence detail: ${forbidden}`);
}

const domainSource=read(domain);
for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','.from(','.rpc(','window.','document.'])if(domainSource.includes(forbidden))fail(`labor domain leaked infrastructure/presentation: ${forbidden}`);
for(const required of ['buildProjectLaborRoster','buildQuickAddWorkersPayload','buildMoveLaborerPayload','buildAssignLaborerPayload','buildUpdateLaborAssignmentPayload'])if(!domainSource.includes(required))fail(`labor domain missing rule: ${required}`);

const serviceSource=read(service);
for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','window.','document.'])if(serviceSource.includes(forbidden))fail(`labor application service leaked infrastructure/presentation: ${forbidden}`);
for(const required of ['projectLaborService','loadWorkspace','quickAdd','transferQuickCandidate','assignWorker','updateWorker','moveWorker','projectLaborSupabaseRepository'])if(!serviceSource.includes(required))fail(`labor service missing use case: ${required}`);

const adapterSource=read(adapter);
if(!adapterSource.includes("@/lib/supabase"))fail('labor adapter must own the Supabase dependency.');
for(const required of ['projectLaborSupabaseRepository',"rpc('fn_quick_add_workers'","rpc('fn_move_laborer'","rpc('fn_assign_existing_laborer'","rpc('fn_update_labor_assignment'"]){
  if(!adapterSource.includes(required))fail(`labor adapter missing persistence contract: ${required}`);
}

const files=sourceRoots.flatMap(walk);
for(const file of files){
  const source=read(file);
  const quickAddCalls=source.match(/fn_quick_add_workers/g)||[];
  if(file!==adapter&&quickAddCalls.length)fail(`alternate quick-add persistence call found outside labor adapter: ${file}`);
  const directLaborInsert=/\.from\(\s*['"]laborers['"]\s*\)[\s\S]{0,800}?\.insert\s*\(/m.test(source);
  if(directLaborInsert)fail(`direct client insert into laborers is forbidden; use the canonical project labor engine: ${file}`);
}

const retiredSource=read(retiredContractorRoute);
if(!retiredSource.includes('data-retired-labor-entry="contractor-level"'))fail('contractor labor route must remain a non-creating project selector.');
for(const forbidden of ['buildLaborerSavePayload','startNew(','.insert(',"sp.get('add')",'إضافة عامل إلى'])if(retiredSource.includes(forbidden))fail(`retired contractor labor route reintroduced creation logic: ${forbidden}`);

const routerSource=read(legacyRouter);
if(routerSource.includes('searchParams?.add')||routerSource.includes('?add=1'))fail('legacy /dashboard/labor router must never reopen an alternate add mode.');

const retiredSiteOperationsSource=read(retiredSiteOperationsRoute);
if(!retiredSiteOperationsSource.includes("redirect('/dashboard/projects')"))fail('legacy site-operations parent route must remain a compatibility redirect to the projects portal.');
for(const forbidden of ['fn_quick_add_workers','parseSiteCommand','openWorkers(',"'use client'"])if(retiredSiteOperationsSource.includes(forbidden))fail(`retired site-operations workspace reintroduced operational UI logic: ${forbidden}`);

for(const file of [
  'app/dashboard/site-operations/page.module.css',
  'lib/labor-profile-write.mjs',
  'tests/labor-profile-write.test.mjs',
  'lib/site-operation-command.js',
  'tests/site-operation-command.test.mjs',
])if(exists(file))fail(`retired duplicate labor/site-operations artifact must stay deleted: ${file}`);

if(failures.length){
  console.error('\nLabor entry governance audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Labor entry governance audit passed: project labor is the single creation surface, business rules and persistence are separated, and alternate labor creation paths cannot return.');
