import fs from 'node:fs';
import path from 'node:path';
import {
  buildProjectCustodyTransactionPayload,
  normalizeProjectCustodyWorkspace,
  projectCustodyCanSettle,
  summarizeProjectCustodyTransactions,
} from '../lib/project-custody.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-custody.mjs',
  adapter:'lib/adapters/project-custody-supabase.js',
  service:'lib/application/project-custody-service.js',
  route:'app/dashboard/projects/[id]/operations/custody/page.js',
  presentation:'app/dashboard/projects/[id]/operations/custody/ProjectCustodyWorkspaceEngineered.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','.from(','.rpc(','window.','document.','navigator.'])if(source.includes(forbidden))fail(`custody domain leaked infrastructure/presentation: ${forbidden}`);
  for(const required of ['normalizeProjectCustodyWorkspace','summarizeProjectCustodyTransactions','buildOpenProjectCustodyPayload','buildProjectCustodyTransactionPayload','projectCustodyCanSettle'])if(!source.includes(required))fail(`custody domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('custody adapter must own the Supabase dependency.');
  for(const required of [
    'projectCustodySupabaseRepository',"rpc('fn_open_project_custody'","from('custody_transactions')","from('custodies')",'uploadProjectCustodyEvidence','removeProjectCustodyEvidence','createProjectCustodyEvidenceUrl',
  ])if(!source.includes(required))fail(`custody adapter missing persistence/storage contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','.from(','.rpc(','window.','document.','navigator.'])if(source.includes(forbidden))fail(`custody service leaked infrastructure/presentation: ${forbidden}`);
  for(const required of ['projectCustodyService','loadWorkspace','loadTransactions','openEvidence','openCustody','saveTransaction','settle','interpretGuardedWrite','cleanupEvidence'])if(!source.includes(required))fail(`custody service missing workflow contract: ${required}`);
  if(!source.includes('if(evidencePath&&!insertedId)'))fail('custody service must only delete transaction evidence before ownership transfers to a persisted transaction.');
}

for(const role of ['route','presentation'])if(exists(files[role])){
  const source=read(files[role]);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','fn_open_project_custody','custody-evidence'])if(source.includes(forbidden))fail(`custody ${role} leaked persistence detail: ${forbidden}`);
}
if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-custody-service"))fail('custody presentation must use the application service.');
  if(!source.includes('data-project-custody-workspace="engineered-v1"'))fail('custody presentation must declare the engineered workspace.');
}
if(exists('app/dashboard/projects/[id]/operations/custody/custody-evidence.js'))fail('retired custody evidence helper returned outside the infrastructure adapter.');

const workspace=normalizeProjectCustodyWorkspace({
  balances:[{custody_id:'c1',balance:'75.5'}],
  custodies:[{id:'c1',employee_id:'e1',status:'open'}],
  eligibleEmployees:[{id:'e1',full_name_ar:'موظف 1'}],
});
if(workspace.custodies[0]?.balance!==75.5||workspace.employees.e1!=='موظف 1')fail('custody workspace normalization invariant changed.');
const totals=summarizeProjectCustodyTransactions([{direction:'issue',amount:100},{direction:'spend',amount:'30'},{direction:'return',amount:5}]);
if(totals.issued!==100||totals.spent!==30||totals.returned!==5)fail('custody transaction totals invariant changed.');
const payload=buildProjectCustodyTransactionPayload({
  projectId:'p1',custodyId:'c1',form:{direction:'spend',trx_date:'2026-09-12',amount:'25.5',category:'مواد',beneficiary:'مورد',charge_to:'arkan',contractor_id:'must-clear',notes:' test '},documentPath:'proof.pdf',
});
if(payload.amount!==25.5||payload.contractor_id!==null||payload.notes!=='test'||payload.document_path!=='proof.pdf')fail('custody transaction normalization invariant changed.');
if(!projectCustodyCanSettle({id:'c1',status:'open',balance:0})||projectCustodyCanSettle({id:'c1',status:'open',balance:1})||projectCustodyCanSettle({id:'c1',status:'settled',balance:0}))fail('custody settlement guard invariant changed.');

if(failures.length){
  console.error('\nProject custody architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project custody architecture audit passed: balance projection, guarded financial workflows, evidence storage, persistence and presentation are separated and safety invariants are locked.');
