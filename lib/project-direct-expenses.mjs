export const DIRECT_EXPENSE_CATEGORIES = Object.freeze([
  'وجبات','أجور','ترحيل','سكن','عدد وأدوات','سقالات','مواد','وقود','وقود ومحروقات','تأمين مسترد','تأمين طبي','ضيافة','أخرى',
]);

export const DIRECT_EXPENSE_PAYER_LABELS = Object.freeze({
  contractor:'المقاول',
  arkan_direct:'أركان مباشرة',
  employee:'موظف من ماله الخاص',
});

export const DIRECT_EXPENSE_CHARGE_LABELS = Object.freeze({
  arkan:'أركان',
  contractor:'المقاول',
  owner:'المالك',
});

export const DIRECT_EXPENSE_VALIDATION = Object.freeze({
  EMPTY:'empty',
  INCOMPLETE:'incomplete',
  EMPLOYEE_REQUIRED:'employee_required',
});

export class DirectExpenseValidationError extends Error {
  constructor(code,message){
    super(message);
    this.name='DirectExpenseValidationError';
    this.code=code;
  }
}

const number=(value)=>Number(value||0);
const defaultDraftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createDirectExpenseDraft(date,seed={},idFactory=defaultDraftId){
  return {
    _id:idFactory(),
    id:null,
    persisted:false,
    expense_date:date,
    amount:'',
    notes:'',
    category:'مواد',
    payer:'contractor',
    charge_to:'arkan',
    project_item_id:'',
    paid_by_employee_id:'',
    is_recoverable:false,
    reimbursement_status:null,
    reimbursed_amount:0,
    ...seed,
  };
}

export function storedExpenseToDraft(row,date,idFactory=defaultDraftId){
  return createDirectExpenseDraft(row?.expense_date||date,{
    id:row?.id||null,
    persisted:true,
    expense_date:row?.expense_date||date,
    amount:String(row?.amount??''),
    notes:row?.notes||'',
    category:row?.category||'أخرى',
    payer:row?.paid_by_employee_id?'employee':(row?.payer||'contractor'),
    charge_to:row?.charge_to||'arkan',
    project_item_id:row?.project_item_id||'',
    paid_by_employee_id:row?.paid_by_employee_id||'',
    is_recoverable:!!row?.is_recoverable,
    reimbursement_status:row?.reimbursement_status||null,
    reimbursed_amount:number(row?.reimbursed_amount),
  },idFactory);
}

export function directExpensePayload(row,fallbackDate){
  return {
    expense_date:row?.expense_date||fallbackDate,
    amount:number(row?.amount),
    notes:String(row?.notes||'').trim(),
    category:row?.category||'أخرى',
    payer:row?.payer||'contractor',
    charge_to:row?.charge_to||'arkan',
    project_item_id:row?.project_item_id||null,
    paid_by_employee_id:row?.payer==='employee'?(row?.paid_by_employee_id||null):null,
    is_recoverable:false,
  };
}

export function directExpenseRowUsed(row){
  return number(row?.amount)>0||Boolean(String(row?.notes||'').trim());
}

export function directExpenseRowReady(row){
  return number(row?.amount)>0&&Boolean(String(row?.notes||'').trim());
}

export function validateDirectExpenseGrid(rows=[]){
  const used=(rows||[]).filter(directExpenseRowUsed);
  if(!used.length)throw new DirectExpenseValidationError(DIRECT_EXPENSE_VALIDATION.EMPTY,'لا توجد بيانات جاهزة للحفظ.');
  if(used.some((row)=>!directExpenseRowReady(row)))throw new DirectExpenseValidationError(DIRECT_EXPENSE_VALIDATION.INCOMPLETE,'كل صف مستخدم يحتاج مبلغًا وبيانًا معًا.');
  if(used.some((row)=>row?.payer==='employee'&&!row?.paid_by_employee_id))throw new DirectExpenseValidationError(DIRECT_EXPENSE_VALIDATION.EMPLOYEE_REQUIRED,'اختر الموظف الدافع في كل صف تم دفعه من ماله الخاص.');
  return used;
}

export function summarizeDirectExpenseGrid(rows=[]){
  const list=rows||[];
  const savedRows=list.filter((row)=>row?.persisted);
  const validRows=list.filter(directExpenseRowReady);
  const newRows=validRows.filter((row)=>!row?.persisted);
  const savedTotal=savedRows.reduce((sum,row)=>sum+number(row?.amount),0);
  const currentGridTotal=validRows.reduce((sum,row)=>sum+number(row?.amount),0);
  const employeeDue=savedRows.reduce((sum,row)=>sum+(row?.paid_by_employee_id?Math.max(0,number(row?.amount)-number(row?.reimbursed_amount)):0),0);
  return Object.freeze({savedRows,validRows,newRows,savedTotal,currentGridTotal,employeeDue});
}

export function duplicateDirectExpenseSeed(row,date){
  if(!row)return {};
  return {
    expense_date:row.expense_date||date,
    category:row.category,
    payer:row.payer,
    charge_to:row.charge_to,
    project_item_id:row.project_item_id,
    paid_by_employee_id:row.paid_by_employee_id,
  };
}
