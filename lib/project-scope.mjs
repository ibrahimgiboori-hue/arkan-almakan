import { itemExecutionState } from './projects.js';

export const PROJECT_SCOPE_ITEM_PATCH_FIELDS=Object.freeze([
  'description_ar','unit','contract_qty','sell_price','budget_cost',
]);
export const PROJECT_SCOPE_CALC_FIELDS=Object.freeze(['contract_qty','sell_price','budget_cost']);
export const PROJECT_SCOPE_END_REASONS=Object.freeze({
  completed:'اكتمال',
  mutual:'اتفاق',
  underperformance:'تقصير',
  dispute:'خلاف',
  other:'أخرى',
});

const numberOrNull=(value)=>value===''||value===undefined||value===null?null:Number(value);
const number=(value)=>Number(value||0);

export function buildProjectScopeWorkspace({items=[],executions=[],contractors=[],budgets=[],states=[],totals=[],actuals=[]}={}){
  return Object.freeze({
    items:Object.freeze([...(items||[])]),
    executions:Object.freeze([...(executions||[])]),
    contractors:Object.freeze([...(contractors||[])]),
    budgets:Object.freeze([...(budgets||[])]),
    states:Object.freeze([...(states||[])]),
    totals:Object.freeze([...(totals||[])]),
    actuals:Object.freeze([...(actuals||[])]),
  });
}

export function numberProjectScopeItems(items=[]){
  let top=0,sub=0,inTitle=false;
  return (items||[]).map((item)=>{
    let numberLabel='';
    if(item.kind==='title'){
      top+=1;sub=0;inTitle=true;numberLabel=String(top);
    }else if(inTitle){
      sub+=1;numberLabel=`${top}-${sub}`;
    }else{
      top+=1;numberLabel=String(top);
    }
    return Object.freeze({...item,number:numberLabel});
  });
}

export function summarizeProjectScope(items=[],executions=[]){
  return Object.freeze({
    totalContract:(items||[]).reduce((sum,item)=>sum+number(item?.contract_value),0),
    totalBudget:(items||[]).reduce((sum,item)=>sum+number(item?.budget_value),0),
    noDecision:(items||[]).filter((item)=>item?.kind==='item'&&!(executions||[]).some((execution)=>execution.project_item_id===item.id)).length,
  });
}

export function projectScopeAssignmentsOf(executions=[],projectItemId){
  return (executions||[]).filter((execution)=>execution.project_item_id===projectItemId);
}

export function projectScopeCurrentAssignment(executions=[],projectItemId){
  const list=projectScopeAssignmentsOf(executions,projectItemId);
  const open=list.filter((assignment)=>!assignment.end_date);
  return open.find((assignment)=>assignment.start_date&&assignment.is_active!==false)
    ||open.find((assignment)=>!assignment.start_date)
    ||list[list.length-1]
    ||null;
}

export function projectScopeDeleteImpact(executions=[],projectItemId){
  const list=projectScopeAssignmentsOf(executions,projectItemId);
  const started=list.filter((assignment)=>itemExecutionState(assignment)!=='planned');
  return Object.freeze({
    assignments:Object.freeze(list),
    started:Object.freeze(started),
    plannedCount:list.length-started.length,
    startedCount:started.length,
  });
}

export function buildProjectScopeNewItem({projectId,sortOrder,kind}){
  if(!projectId)throw new Error('المشروع غير محدد.');
  if(!['item','title'].includes(kind))throw new Error('نوع سطر النطاق غير مدعوم.');
  return Object.freeze({
    project_id:projectId,
    sort_order:Number(sortOrder||0),
    kind,
    description_ar:kind==='title'?'عنوان قسم':'',
    unit:kind==='item'?'م2':null,
    contract_qty:1,
    sell_price:0,
    budget_cost:0,
  });
}

export function normalizeProjectScopeItemPatch(fields={}){
  const allowed=new Set(PROJECT_SCOPE_ITEM_PATCH_FIELDS);
  const patch={};
  for(const [key,value] of Object.entries(fields||{}))if(allowed.has(key))patch[key]=value;
  if(!Object.keys(patch).length)throw new Error('لا توجد حقول بند مسموح بحفظها.');
  return Object.freeze(patch);
}

export function projectScopePatchNeedsCalculation(fields={}){
  return Object.keys(fields||{}).some((key)=>PROJECT_SCOPE_CALC_FIELDS.includes(key));
}

export function buildProjectScopeInsertAfter({projectId,afterOrder,kind}){
  if(!projectId||!['item','title'].includes(kind))throw new Error('بيانات إدراج السطر غير مكتملة.');
  return Object.freeze({p_project:projectId,p_after_order:Number(afterOrder||0),p_kind:kind});
}

export function buildProjectExecutionAssignmentPayload({itemId,form={},executionId=null}){
  if(!itemId)throw new Error('البند غير محدد.');
  if(!form?.mode)throw new Error('طريقة التنفيذ مطلوبة.');
  return Object.freeze({
    p_project_item_id:itemId,
    p_mode:form.mode,
    p_contractor_id:form.contractor_id||null,
    p_agreed_rate:numberOrNull(form.agreed_rate),
    p_worker_daily:numberOrNull(form.worker_daily),
    p_tech_daily:numberOrNull(form.tech_daily),
    p_target_output:numberOrNull(form.target_output),
    p_shortfall_deduction:numberOrNull(form.shortfall_deduction),
    p_planned_cost:numberOrNull(form.planned_cost),
    p_share_qty:numberOrNull(form.share_qty),
    p_share_percent:numberOrNull(form.share_percent),
    p_notes:String(form.notes||'').trim()||null,
    p_execution_id:executionId||null,
  });
}

export function buildProjectExecutionStartPayload(executionId,date=null){
  if(!executionId)throw new Error('الإسناد غير محدد.');
  return Object.freeze({p_execution_id:executionId,p_start_date:date||null});
}

export function buildProjectExecutionEndPayload({executionId,form={}}){
  if(!executionId)throw new Error('الإسناد غير محدد.');
  if(!form.date)throw new Error('تاريخ الإنهاء مطلوب.');
  if(!form.reason)throw new Error('سبب الإنهاء مطلوب.');
  return Object.freeze({
    p_exec:executionId,
    p_end_date:form.date,
    p_end_reason:form.reason,
    p_closing_qty:numberOrNull(form.qty),
    p_notes:String(form.notes||'').trim()||null,
  });
}
