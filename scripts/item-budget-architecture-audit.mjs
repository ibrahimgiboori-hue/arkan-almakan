import fs from 'node:fs';
import path from 'node:path';
import {
  buildDefaultItemBudget,
  buildItemBudgetLine,
  itemBudgetFinancialSummary,
  itemBudgetLineAmount,
  normalizeItemBudgetLinePatch,
  normalizeItemBudgetPatch,
} from '../lib/item-budget.mjs';

const root=process.cwd();
const failures=[];
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const fail=(message)=>failures.push(message);

const files={
  domain:'lib/item-budget.mjs',
  adapter:'lib/adapters/item-budget-supabase.js',
  service:'lib/application/item-budget-service.js',
  presentation:'components/ItemBudget.js',
};
for(const [role,file] of Object.entries(files))if(!exists(file))fail(`${role}: missing ${file}`);

if(exists(files.domain)){
  const source=read(files.domain);
  for(const forbidden of ['@/lib/supabase','@supabase/','react','next/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`item budget domain leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'ITEM_BUDGET_KIND_LABELS','ITEM_BUDGET_PATCH_FIELDS','ITEM_BUDGET_LINE_PATCH_FIELDS','buildDefaultItemBudget',
    'normalizeItemBudgetPatch','buildItemBudgetLine','normalizeItemBudgetLinePatch','itemBudgetLineAmount','itemBudgetFinancialSummary',
  ])if(!source.includes(required))fail(`item budget domain missing rule: ${required}`);
}

if(exists(files.adapter)){
  const source=read(files.adapter);
  if(!source.includes("@/lib/supabase"))fail('item budget adapter must own Supabase.');
  for(const required of [
    'itemBudgetSupabaseRepository',"from('item_budgets')","from('v_item_budget')","from('budget_lines')",
    "rpc('suggest_crew'",'createItemBudgetRecord','updateItemBudgetRecord','createItemBudgetLine','updateItemBudgetLine','deleteItemBudgetLine',
    ".select('*').single()",".select('*').maybeSingle()",".select('id').maybeSingle()",
  ])if(!source.includes(required))fail(`item budget adapter missing persistence/proof contract: ${required}`);
}

if(exists(files.service)){
  const source=read(files.service);
  for(const forbidden of ['@/lib/supabase','@supabase/','supabase.','.from(','.rpc(','window.','document.','navigator.']){
    if(source.includes(forbidden))fail(`item budget service leaked infrastructure/presentation: ${forbidden}`);
  }
  for(const required of [
    'itemBudgetService','createItemBudgetService','loadWorkspace','patchBudget','addLine','updateLine','deleteLine','suggestCrew',
    'itemBudgetSupabaseRepository','buildDefaultItemBudget','normalizeItemBudgetPatch','normalizeItemBudgetLinePatch','repository.loadProjection',
  ])if(!source.includes(required))fail(`item budget service missing orchestration contract: ${required}`);
}

if(exists(files.presentation)){
  const source=read(files.presentation);
  if(!source.includes("@/lib/application/item-budget-service"))fail('item budget presentation must use the application service.');
  if(!source.includes("@/lib/item-budget.mjs"))fail('item budget presentation must consume domain contracts.');
  if(!source.includes('data-item-budget-workspace="engineered-v1"'))fail('item budget presentation must declare the engineered workspace.');
  for(const forbidden of ["@/lib/supabase",'@supabase/','supabase.','.from(','.rpc(',"from('item_budgets')","from('budget_lines')",'suggest_crew']){
    if(source.includes(forbidden))fail(`item budget presentation leaked persistence/calculation detail: ${forbidden}`);
  }
  for(const required of [
    'itemBudgetService.loadWorkspace','itemBudgetService.patchBudget','itemBudgetService.addLine','itemBudgetService.updateLine',
    'itemBudgetService.deleteLine','itemBudgetService.suggestCrew','itemBudgetFinancialSummary','itemBudgetLineAmount',
  ])if(!source.includes(required))fail(`item budget presentation lost governed behavior: ${required}`);
}

const defaultBudget=buildDefaultItemBudget('i1');
if(defaultBudget.project_item_id!=='i1'||defaultBudget.target_mode!=='per_unit')fail('item budget default-record invariant changed.');
const patch=normalizeItemBudgetPatch({target_mode:'percent',target_percent:.25,evil:'x'});
if(patch.target_mode!=='percent'||patch.target_percent!==.25||Object.hasOwn(patch,'evil'))fail('item budget patch whitelist invariant changed.');
const line=buildItemBudgetLine({budgetId:'b1',sortOrder:3,kind:'labor'});
if(line.budget_id!=='b1'||line.sort_order!==3||line.worker_daily!==130||line.tech_daily!==180||line.lock_side!=='techs')fail('item budget labor-line defaults invariant changed.');
const linePatch=normalizeItemBudgetLinePatch({workers_count:3,notes:'x',budget_id:'evil'});
if(linePatch.workers_count!==3||linePatch.notes!=='x'||Object.hasOwn(linePatch,'budget_id'))fail('item budget line-patch whitelist invariant changed.');
if(itemBudgetLineAmount({as_percent:.1},1000)!==100||itemBudgetLineAmount({amount:75},1000)!==75)fail('item budget line-amount invariant changed.');
const summary=itemBudgetFinancialSummary({revenue:'1000',target_profit:'250',spend_budget:'750',allocated:'600',remaining:'150',over_budget:false});
if(summary.revenue!==1000||summary.targetProfit!==250||summary.remaining!==150||summary.overBudget)fail('item budget financial-summary invariant changed.');

if(failures.length){
  console.error('\nItem budget architecture audit failed:\n');
  failures.forEach((item)=>console.error(`- ${item}`));
  process.exit(1);
}

console.log('Item budget architecture audit passed: budget projection, line rules, crew suggestion, verified persistence and presentation are separated and guarded.');
