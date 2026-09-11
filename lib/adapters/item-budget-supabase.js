import { supabase } from '@/lib/supabase';

export async function loadItemBudgetRecord(projectItemId){
  const query=await supabase.from('item_budgets').select('*').eq('project_item_id',projectItemId).maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

export async function createItemBudgetRecord(payload){
  const query=await supabase.from('item_budgets').insert(payload).select('*').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function loadItemBudgetProjection(budgetId){
  const [viewQ,linesQ]=await Promise.all([
    supabase.from('v_item_budget').select('*').eq('budget_id',budgetId).maybeSingle(),
    supabase.from('budget_lines').select('*').eq('budget_id',budgetId).order('sort_order'),
  ]);
  const error=[viewQ,linesQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {view:viewQ.data||null,lines:linesQ.data||[]};
}

export async function updateItemBudgetRecord(budgetId,fields){
  const query=await supabase.from('item_budgets').update(fields).eq('id',budgetId).select('*').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('لم تتغير الميزانية؛ ربما عُدلت أو حُذفت من جهة أخرى.');
  return query.data;
}

export async function createItemBudgetLine(payload){
  const query=await supabase.from('budget_lines').insert(payload).select('*').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function updateItemBudgetLine(lineId,fields){
  const query=await supabase.from('budget_lines').update(fields).eq('id',lineId).select('*').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('لم يتغير بند الصرف؛ ربما عُدل أو حُذف من جهة أخرى.');
  return query.data;
}

export async function deleteItemBudgetLine(lineId){
  const query=await supabase.from('budget_lines').delete().eq('id',lineId).select('id').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('لم يُحذف بند الصرف؛ ربما حُذف من جهة أخرى.');
  return true;
}

export async function suggestItemBudgetCrew({budgetId,laborLineId,lock}){
  const query=await supabase.rpc('suggest_crew',{
    p_budget:budgetId,
    p_labor_line:laborLineId,
    p_lock:lock,
  });
  if(query.error)throw query.error;
  return query.data||{};
}

export const itemBudgetSupabaseRepository=Object.freeze({
  loadBudget:loadItemBudgetRecord,
  createBudget:createItemBudgetRecord,
  loadProjection:loadItemBudgetProjection,
  updateBudget:updateItemBudgetRecord,
  createLine:createItemBudgetLine,
  updateLine:updateItemBudgetLine,
  deleteLine:deleteItemBudgetLine,
  suggestCrew:suggestItemBudgetCrew,
});
