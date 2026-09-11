export const ITEM_BUDGET_KIND_LABELS=Object.freeze({
  material:'مواد',
  labor:'أجور',
  equipment:'معدات',
  transport:'ترحيل',
  custody:'عهدة',
  supervision:'إشراف',
  contingency:'طوارئ',
  other:'أخرى',
});

export const ITEM_BUDGET_PATCH_FIELDS=Object.freeze([
  'target_mode','target_per_unit','target_percent','target_lump','work_days','daily_output',
]);

export const ITEM_BUDGET_LINE_PATCH_FIELDS=Object.freeze([
  'label','amount','as_percent','worker_daily','tech_daily','workers_count','techs_count','lock_side','notes',
]);

const number=(value)=>Number(value||0);

export function buildDefaultItemBudget(itemId){
  if(!itemId)throw new Error('البند غير محدد.');
  return Object.freeze({project_item_id:itemId,target_mode:'per_unit'});
}

export function normalizeItemBudgetPatch(fields={}){
  const allowed=new Set(ITEM_BUDGET_PATCH_FIELDS);
  const patch={};
  for(const [key,value] of Object.entries(fields||{}))if(allowed.has(key))patch[key]=value;
  if(!Object.keys(patch).length)throw new Error('لا توجد حقول ميزانية مسموح بحفظها.');
  if(patch.target_mode&&!['per_unit','percent','lump'].includes(patch.target_mode))throw new Error('طريقة تحديد الربح غير مدعومة.');
  return Object.freeze(patch);
}

export function buildItemBudgetLine({budgetId,sortOrder,kind}){
  if(!budgetId)throw new Error('الميزانية غير محددة.');
  if(!ITEM_BUDGET_KIND_LABELS[kind])throw new Error('نوع بند الصرف غير مدعوم.');
  const base={
    budget_id:budgetId,
    sort_order:Number(sortOrder||0),
    kind,
    label:ITEM_BUDGET_KIND_LABELS[kind],
    amount:0,
  };
  if(kind==='labor')Object.assign(base,{
    worker_daily:130,
    tech_daily:180,
    workers_count:0,
    techs_count:0,
    lock_side:'techs',
  });
  return Object.freeze(base);
}

export function normalizeItemBudgetLinePatch(fields={}){
  const allowed=new Set(ITEM_BUDGET_LINE_PATCH_FIELDS);
  const patch={};
  for(const [key,value] of Object.entries(fields||{}))if(allowed.has(key))patch[key]=value;
  if(!Object.keys(patch).length)throw new Error('لا توجد حقول بند صرف مسموح بحفظها.');
  return Object.freeze(patch);
}

export function itemBudgetLineAmount(line,revenue){
  return line?.as_percent!=null
    ? Math.round(number(revenue)*Number(line.as_percent)*100)/100
    : number(line?.amount);
}

export function itemBudgetFinancialSummary(budget={}){
  return Object.freeze({
    revenue:number(budget.revenue),
    targetProfit:number(budget.target_profit),
    spendBudget:number(budget.spend_budget),
    allocated:number(budget.allocated),
    remaining:number(budget.remaining),
    overBudget:Boolean(budget.over_budget),
  });
}
