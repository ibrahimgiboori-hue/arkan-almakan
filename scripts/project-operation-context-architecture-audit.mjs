import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  adapter:'lib/adapters/project-operation-context-supabase.js',
  service:'lib/application/project-operation-context-service.js',
  presentation:'app/dashboard/projects/[id]/operations/tool-shell.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project operation context adapter must own Supabase.');
  for(const required of ['projectOperationContextSupabaseRepository','loadProjectOperationLinks','loadProjectOperationAssignments','loadProjectOperationContractors']){
    if(!source.includes(required))fail(`project operation context adapter missing persistence contract: ${required}`);
  }
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.from(','supabase.rpc(','window.','document.']){
    if(source.includes(forbidden))fail(`project operation context service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['createProjectOperationContextService','projectOperationContextService','loadContractors','selectRosterAssignmentsForDate','projectOperationContextSupabaseRepository']){
    if(!source.includes(required))fail(`project operation context service missing contract: ${required}`);
  }
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-operation-context-service"))fail('operation tool shell must use the application service.');
  for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.from(','project_contractors','labor_project_assignments',"from('contractors')",'selectRosterAssignmentsForDate']){
    if(source.includes(forbidden))fail(`operation tool shell leaked infrastructure/orchestration detail: ${forbidden}`);
  }
  for(const required of ['OutputPanel','DirectExpensePanel','FinancePanel'])if(!source.includes(required))fail(`operation tool shell lost shared tool: ${required}`);
}

if(failures.length){
  console.error('\nProject operation context architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project operation context architecture audit passed: shared contractor context is separated from presentation and reused across operation tools.');
