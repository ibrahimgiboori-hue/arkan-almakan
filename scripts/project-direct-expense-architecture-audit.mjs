import fs from 'node:fs';
import path from 'node:path';
import {
  DIRECT_EXPENSE_VALIDATION,
  summarizeDirectExpenseGrid,
  validateDirectExpenseGrid,
} from '../lib/project-direct-expenses.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-direct-expenses.mjs',
  adapter:'lib/adapters/project-direct-expense-supabase.js',
  service:'lib/application/project-direct-expense-service.js',
  presentation:'app/dashboard/projects/[id]/operations/direct-expense-panel.js',
};

for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.from(','supabase.rpc(','window.','document.']){
    if(source.includes(forbidden))fail(`direct expense domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'createDirectExpenseDraft','storedExpenseToDraft','directExpensePayload','validateDirectExpenseGrid','summarizeDirectExpenseGrid','duplicateDirectExpenseSeed',
  ])if(!source.includes(required))fail(`direct expense domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('direct expense adapter must own the Supabase dependency.');
  for(const required of [
    'projectDirectExpenseSupabaseRepository','loadProjectDirectExpenseDay','updateProjectDirectExpense','bulkCreateProjectDirectExpenses','deleteProjectDirectExpense',
    "from('contractor_expenses')","rpc('fn_bulk_save_project_expenses'",
  ])if(!source.includes(required))fail(`direct expense adapter missing persistence contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.from(','supabase.rpc(','window.','document.']){
    if(source.includes(forbidden))fail(`direct expense application service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of ['createProjectDirectExpenseService','projectDirectExpenseService','loadDay','saveGrid','deleteExpense','projectDirectExpenseSupabaseRepository','validateDirectExpenseGrid']){
    if(!source.includes(required))fail(`direct expense application service missing use case: ${required}`);
  }
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-direct-expense-service"))fail('direct expense presentation must use the application service.');
  if(!source.includes("@/lib/project-direct-expenses.mjs"))fail('direct expense presentation must consume domain contracts.');
  for(const forbidden of [
    "@/lib/supabase",'@supabase/','supabase.from(','supabase.rpc(',"from('contractor_expenses')",'fn_bulk_save_project_expenses','rowPayload(','fetchDayExpenses(',
  ])if(source.includes(forbidden))fail(`direct expense presentation leaked persistence/business detail: ${forbidden}`);
}

const fixture=[
  {persisted:true,amount:'100',notes:'مواد',payer:'employee',paid_by_employee_id:'e1',reimbursed_amount:25},
  {persisted:false,amount:'50',notes:'وقود',payer:'contractor',paid_by_employee_id:'',reimbursed_amount:0},
];
const summary=summarizeDirectExpenseGrid(fixture);
if(summary.savedTotal!==100||summary.currentGridTotal!==150||summary.employeeDue!==75)fail('direct expense summary invariant changed.');
try{
  validateDirectExpenseGrid([{amount:'10',notes:'',payer:'contractor'}]);
  fail('direct expense validation accepted an incomplete used row.');
}catch(error){
  if(error?.code!==DIRECT_EXPENSE_VALIDATION.INCOMPLETE)fail('direct expense validation returned the wrong invariant code.');
}

if(failures.length){
  console.error('\nProject direct expense architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project direct expense architecture audit passed: expense rules, orchestration, persistence and presentation are separated, and core invariants are locked.');
