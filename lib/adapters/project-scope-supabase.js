import { supabase } from '@/lib/supabase';

export async function loadProjectScopePrimarySource(projectId){
  const [itemsQ,executionsQ,contractorsQ,budgetsQ,statesQ,totalsQ]=await Promise.all([
    supabase.from('project_items').select('*').eq('project_id',projectId).order('sort_order'),
    supabase.from('v_item_execution_assignments').select('*').eq('project_id',projectId).order('decided_at',{ascending:true}),
    supabase.from('contractors').select('id,name_ar,worker_daily,tech_daily').eq('is_active',true).order('name_ar'),
    supabase.from('v_item_budget').select('*').eq('project_id',projectId),
    supabase.from('v_item_execution_state').select('*').eq('project_id',projectId),
    supabase.from('v_item_assignment_totals').select('*').eq('project_id',projectId),
  ]);
  const error=[itemsQ,executionsQ,contractorsQ,budgetsQ,statesQ,totalsQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {
    items:itemsQ.data||[],
    executions:executionsQ.data||[],
    contractors:contractorsQ.data||[],
    budgets:budgetsQ.data||[],
    states:statesQ.data||[],
    totals:totalsQ.data||[],
  };
}

export async function loadProjectScopeActuals(executionIds=[]){
  const ids=[...new Set((executionIds||[]).filter(Boolean))];
  if(!ids.length)return [];
  const query=await supabase.from('v_item_assignment_actuals').select('*').in('exec_id',ids);
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadProjectScopeCalculations(projectId){
  const [itemsQ,budgetsQ,statesQ]=await Promise.all([
    supabase.from('project_items').select('*').eq('project_id',projectId).order('sort_order'),
    supabase.from('v_item_budget').select('*').eq('project_id',projectId),
    supabase.from('v_item_execution_state').select('*').eq('project_id',projectId),
  ]);
  const error=[itemsQ,budgetsQ,statesQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {items:itemsQ.data||[],budgets:budgetsQ.data||[],states:statesQ.data||[]};
}

export async function loadProjectScopeItemOrders(projectId){
  const query=await supabase.from('project_items').select('id,sort_order').eq('project_id',projectId).order('sort_order');
  if(query.error)throw query.error;
  return query.data||[];
}

export async function createProjectScopeItem(payload){
  const query=await supabase.from('project_items').insert(payload).select('*').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function insertProjectScopeItemAfter(payload){
  const query=await supabase.rpc('project_item_insert_after',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function updateProjectScopeItem(itemId,fields){
  const query=await supabase.from('project_items').update(fields).eq('id',itemId).select('*').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('لم يتغير البند؛ ربما عُدّل أو حُذف من جهة أخرى.');
  return query.data;
}

async function setProjectScopeItemOrder(itemId,sortOrder){
  const query=await supabase.from('project_items').update({sort_order:sortOrder}).eq('id',itemId).select('id,sort_order').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('تعذر تثبيت ترتيب البند.');
  return query.data;
}

export async function swapProjectScopeItemOrders(first,second){
  let step=0;
  try{
    await setProjectScopeItemOrder(first.id,-1); step=1;
    await setProjectScopeItemOrder(second.id,first.sort_order); step=2;
    await setProjectScopeItemOrder(first.id,second.sort_order); step=3;
  }catch(error){
    try{
      if(step>=2)await setProjectScopeItemOrder(second.id,second.sort_order);
      if(step>=1)await setProjectScopeItemOrder(first.id,first.sort_order);
    }catch{}
    throw error;
  }
  const proof=await supabase.from('project_items').select('id,sort_order').in('id',[first.id,second.id]);
  if(proof.error)throw proof.error;
  const a=(proof.data||[]).find((row)=>row.id===first.id);
  const b=(proof.data||[]).find((row)=>row.id===second.id);
  if(Number(a?.sort_order)!==Number(second.sort_order)||Number(b?.sort_order)!==Number(first.sort_order)){
    throw new Error('تعذر إثبات ترتيب البنود بعد التحريك.');
  }
  return true;
}

export async function deleteProjectScopeItemSafely(itemId){
  const query=await supabase.rpc('fn_delete_project_item_safely',{p_project_item_id:itemId});
  if(query.error)throw query.error;
  return query.data||null;
}

export async function saveProjectScopeExecutionAssignment(payload){
  const query=await supabase.rpc('fn_save_item_execution_assignment',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function loadProjectScopeItemExecutions(projectItemId){
  const query=await supabase.from('v_item_execution_assignments').select('*').eq('project_item_id',projectItemId).order('decided_at',{ascending:true});
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadProjectScopeExecution(executionId){
  const query=await supabase.from('v_item_execution_assignments').select('*').eq('id',executionId).maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

export async function startProjectScopeExecution(payload){
  const query=await supabase.rpc('fn_start_item_execution_assignment',payload);
  if(query.error)throw query.error;
  return query.data||{};
}

export async function endProjectScopeExecution(payload){
  const query=await supabase.rpc('end_item_assignment',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function cancelProjectScopeExecution(executionId){
  const query=await supabase.rpc('fn_cancel_item_execution_assignment',{p_execution_id:executionId});
  if(query.error)throw query.error;
  return query.data;
}

export const projectScopeSupabaseRepository=Object.freeze({
  loadPrimary:loadProjectScopePrimarySource,
  loadActuals:loadProjectScopeActuals,
  loadCalculations:loadProjectScopeCalculations,
  loadItemOrders:loadProjectScopeItemOrders,
  createItem:createProjectScopeItem,
  insertItemAfter:insertProjectScopeItemAfter,
  updateItem:updateProjectScopeItem,
  swapOrders:swapProjectScopeItemOrders,
  deleteItemSafely:deleteProjectScopeItemSafely,
  saveExecutionAssignment:saveProjectScopeExecutionAssignment,
  loadItemExecutions:loadProjectScopeItemExecutions,
  loadExecution:loadProjectScopeExecution,
  startExecution:startProjectScopeExecution,
  endExecution:endProjectScopeExecution,
  cancelExecution:cancelProjectScopeExecution,
});
