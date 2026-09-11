import fs from 'node:fs';
import path from 'node:path';
import {
  buildProjectExecutionAssignmentPayload,
  buildProjectExecutionEndPayload,
  buildProjectScopeNewItem,
  normalizeProjectScopeItemPatch,
  numberProjectScopeItems,
  projectScopeCurrentAssignment,
  projectScopeDeleteImpact,
  projectScopePatchNeedsCalculation,
  summarizeProjectScope,
} from '../lib/project-scope.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/project-scope.mjs',
  adapter:'lib/adapters/project-scope-supabase.js',
  service:'lib/application/project-scope-service.js',
  presentation:'components/ProjScope.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project scope domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'PROJECT_SCOPE_ITEM_PATCH_FIELDS','PROJECT_SCOPE_CALC_FIELDS','PROJECT_SCOPE_END_REASONS','buildProjectScopeWorkspace',
    'numberProjectScopeItems','summarizeProjectScope','projectScopeAssignmentsOf','projectScopeCurrentAssignment','projectScopeDeleteImpact',
    'buildProjectScopeNewItem','normalizeProjectScopeItemPatch','projectScopePatchNeedsCalculation','buildProjectScopeInsertAfter',
    'buildProjectExecutionAssignmentPayload','buildProjectExecutionStartPayload','buildProjectExecutionEndPayload',
  ])if(!source.includes(required))fail(`project scope domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('project scope adapter must own Supabase.');
  for(const required of [
    'projectScopeSupabaseRepository',"from('project_items')","from('v_item_execution_assignments')","from('contractors')",
    "from('v_item_budget')","from('v_item_execution_state')","from('v_item_assignment_totals')","from('v_item_assignment_actuals')",
    ".in('exec_id',ids)","rpc('project_item_insert_after'","rpc('fn_delete_project_item_safely'",
    "rpc('fn_save_item_execution_assignment'","rpc('fn_start_item_execution_assignment'","rpc('end_item_assignment'",
    "rpc('fn_cancel_item_execution_assignment'",'swapProjectScopeItemOrders','setProjectScopeItemOrder',
  ])if(!source.includes(required))fail(`project scope adapter missing persistence/execution contract: ${required}`);
  if(/from\('v_item_assignment_actuals'\)\.select\('\*'\)(?!\.in\('exec_id')/.test(source))fail('project scope actuals must be constrained to this project execution ids.');
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`project scope service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'projectScopeService','createProjectScopeService','loadWorkspace','loadCalculations','addLine','insertAfter','updateItem','deleteItem',
    'moveItem','saveExecutionAssignment','startExecution','endExecution','cancelExecution','projectScopeSupabaseRepository',
    'repository.loadActuals','repository.swapOrders','repository.loadExecution','proof.start_date','proof.end_date','itemExecutionState',
  ])if(!source.includes(required))fail(`project scope service missing orchestration/proof contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/project-scope-service"))fail('project scope presentation must use the application service.');
  if(!source.includes("@/lib/project-scope.mjs"))fail('project scope presentation must consume domain contracts.');
  if(!source.includes('data-project-scope-workspace="engineered-v1"'))fail('project scope presentation must declare the engineered workspace.');
  for(const forbidden of [
    "@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(',
    'fn_save_item_execution_assignment','fn_start_item_execution_assignment','fn_cancel_item_execution_assignment','fn_delete_project_item_safely',
  ])if(source.includes(forbidden))fail(`project scope presentation leaked persistence/execution detail: ${forbidden}`);
  for(const required of [
    'projectScopeService.loadWorkspace','projectScopeService.addLine','projectScopeService.insertAfter','projectScopeService.updateItem',
    'projectScopeService.deleteItem','projectScopeService.moveItem','projectScopeService.saveExecutionAssignment',
    'projectScopeService.startExecution','projectScopeService.endExecution','projectScopeService.cancelExecution',
    'numberProjectScopeItems','summarizeProjectScope','projectScopeDeleteImpact','projectScopeCurrentAssignment',
  ])if(!source.includes(required))fail(`project scope presentation lost governed behavior: ${required}`);
}

const numbered=numberProjectScopeItems([
  {id:'t1',kind:'title'},{id:'i1',kind:'item'},{id:'i2',kind:'item'},{id:'t2',kind:'title'},{id:'i3',kind:'item'},
]);
if(numbered.map((row)=>row.number).join(',')!=='1,1-1,1-2,2,2-1')fail('project scope hierarchical numbering invariant changed.');

const executions=[
  {id:'e1',project_item_id:'i1',start_date:null,end_date:null,is_active:true},
  {id:'e2',project_item_id:'i2',start_date:'2026-09-01',end_date:null,is_active:true},
];
const summary=summarizeProjectScope([
  {id:'i1',kind:'item',contract_value:100,budget_value:70},
  {id:'i2',kind:'item',contract_value:200,budget_value:150},
  {id:'i3',kind:'item',contract_value:50,budget_value:30},
],executions);
if(summary.totalContract!==350||summary.totalBudget!==250||summary.noDecision!==1)fail('project scope summary/no-decision invariant changed.');
if(projectScopeCurrentAssignment(executions,'i2')?.id!=='e2')fail('project scope current-assignment invariant changed.');
const impact=projectScopeDeleteImpact(executions,'i2');
if(impact.startedCount!==1||impact.plannedCount!==0)fail('project scope delete-impact invariant changed.');

const newItem=buildProjectScopeNewItem({projectId:'p1',sortOrder:4,kind:'item'});
if(newItem.project_id!=='p1'||newItem.sort_order!==4||newItem.unit!=='م2'||newItem.contract_qty!==1)fail('project scope new-item defaults invariant changed.');
const patch=normalizeProjectScopeItemPatch({description_ar:'بند',sell_price:12,evil:'x'});
if(patch.description_ar!=='بند'||patch.sell_price!==12||Object.hasOwn(patch,'evil'))fail('project scope item-patch whitelist invariant changed.');
if(!projectScopePatchNeedsCalculation({sell_price:12})||projectScopePatchNeedsCalculation({description_ar:'x'}))fail('project scope calculation-refresh invariant changed.');
const assignment=buildProjectExecutionAssignmentPayload({itemId:'i1',form:{mode:'piecework',contractor_id:'c1',agreed_rate:'15',share_qty:'100',notes:' test '}});
if(assignment.p_agreed_rate!==15||assignment.p_share_qty!==100||assignment.p_notes!=='test')fail('project execution assignment payload invariant changed.');
const end=buildProjectExecutionEndPayload({executionId:'e1',form:{date:'2026-09-12',reason:'completed',qty:'80',notes:' done '}});
if(end.p_closing_qty!==80||end.p_notes!=='done')fail('project execution end payload invariant changed.');

if(failures.length){
  console.error('\nProject scope architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Project scope architecture audit passed: item identity, hierarchical numbering, scoped actuals, assignment lifecycle, verified mutations and presentation are separated and guarded.');
