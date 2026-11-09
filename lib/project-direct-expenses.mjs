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
  QUANTITY_PRICE_PAIR:'quantity_price_pair',
});

export class DirectExpenseValidationError extends Error {
  constructor(code,message){
    super(message);
    this.name='DirectExpenseValidationError';
    this.code=code;
  }
}

const number=(value)=>Number(value||0);
const filled=(value)=>value!==''&&value!==null&&value!==undefined;

/** الكمية × سعر الوحدة when both are given (the database computes the same), else the typed amount. */
export function directExpenseLineTotal(row){
  if(filled(row?.quantity)&&filled(row?.unit_price))return Math.round(number(row.quantity)*number(row.unit_price)*100)/100;
  return number(row?.amount);
}

export function directExpenseHasQuantity(row){
  return filled(row?.quantity)||filled(row?.unit_price);
}
const defaultDraftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createDirectExpenseDraft(date,seed={},idFactory=defaultDraftId){
  return {
    _id:idFactory(),
    id:null,
    persisted:false,
    expense_date:date,
    contractor_id:'',
    amount:'',
    quantity:'',
    unit_price:'',
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
    contractor_id:row?.contractor_id||'',
    amount:String(row?.amount??''),
    quantity:row?.quantity==null?'':String(row.quantity),
    unit_price:row?.unit_price==null?'':String(row.unit_price),
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
  const pair=filled(row?.quantity)&&filled(row?.unit_price);
  return {
    expense_date:row?.expense_date||fallbackDate,
    amount:directExpenseLineTotal(row),
    // Always sent: clearing both on a saved line must clear them in the database too.
    quantity:pair?number(row.quantity):null,
    unit_price:pair?number(row.unit_price):null,
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
  return directExpenseLineTotal(row)>0||directExpenseHasQuantity(row)||Boolean(String(row?.notes||'').trim());
}

export function directExpenseRowReady(row){
  const halfPair=filled(row?.quantity)!==filled(row?.unit_price);
  return !halfPair&&directExpenseLineTotal(row)>0&&Boolean(String(row?.notes||'').trim());
}

export function validateDirectExpenseGrid(rows=[]){
  const used=(rows||[]).filter(directExpenseRowUsed);
  if(!used.length)throw new DirectExpenseValidationError(DIRECT_EXPENSE_VALIDATION.EMPTY,'لا توجد بيانات جاهزة للحفظ.');
  if(used.some((row)=>filled(row?.quantity)!==filled(row?.unit_price)))throw new DirectExpenseValidationError(DIRECT_EXPENSE_VALIDATION.QUANTITY_PRICE_PAIR,'الكمية وسعر الوحدة يُكتبان معًا، أو اتركهما فارغين واكتب المبلغ مباشرة.');
  if(used.some((row)=>!directExpenseRowReady(row)))throw new DirectExpenseValidationError(DIRECT_EXPENSE_VALIDATION.INCOMPLETE,'كل صف مستخدم يحتاج مبلغًا وبيانًا معًا.');
  if(used.some((row)=>row?.payer==='employee'&&!row?.paid_by_employee_id))throw new DirectExpenseValidationError(DIRECT_EXPENSE_VALIDATION.EMPLOYEE_REQUIRED,'اختر الموظف الدافع في كل صف تم دفعه من ماله الخاص.');
  return used;
}

export function summarizeDirectExpenseGrid(rows=[]){
  const list=rows||[];
  const savedRows=list.filter((row)=>row?.persisted);
  const validRows=list.filter(directExpenseRowReady);
  const newRows=validRows.filter((row)=>!row?.persisted);
  const savedTotal=savedRows.reduce((sum,row)=>sum+directExpenseLineTotal(row),0);
  const currentGridTotal=validRows.reduce((sum,row)=>sum+directExpenseLineTotal(row),0);
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

/* ---------- the expense ledger: one sheet for the whole project ---------- */

/** What a saved row stores — compared to know whether a saved line was really edited. */
export function directExpenseSignature(row){
  return JSON.stringify(directExpensePayload(row,row?.expense_date||''));
}

/**
 * The ledger's edits → updates of saved lines that really changed, and new lines grouped by contractor.
 * baseline: { id: signature } of the saved lines as loaded. Messages carry the sheet row number.
 */
export function planDirectExpenseLedger(rows=[],{baseline={},from='',to=''}={}){
  const updates=[];
  const creates=new Map();
  const errors=[];
  (rows||[]).forEach((row,index)=>{
    const label=`الصف ${index+1}`;
    if(row?.persisted){
      if(!row.id||baseline[row.id]===directExpenseSignature(row))return;
    }else if(!directExpenseRowUsed(row))return;
    if(filled(row?.quantity)!==filled(row?.unit_price)){errors.push(`${label}: الكمية وسعر الوحدة يُكتبان معًا، أو اتركهما واكتب المبلغ مباشرة.`);return;}
    if(!(directExpenseLineTotal(row)>0)){errors.push(`${label}: المبلغ مطلوب.`);return;}
    if(!String(row?.notes||'').trim()){errors.push(`${label}: البيان مطلوب.`);return;}
    if(!row?.expense_date){errors.push(`${label}: اكتب التاريخ.`);return;}
    if(!row.persisted&&((from&&row.expense_date<from)||(to&&row.expense_date>to))){errors.push(`${label}: التاريخ خارج فترة العرض — وسّع الفلترة لتشمله.`);return;}
    if(row?.payer==='employee'&&!row?.paid_by_employee_id){errors.push(`${label}: اختر الموظف الدافع.`);return;}
    if(row.persisted){updates.push(row);return;}
    if(!row?.contractor_id){errors.push(`${label}: اختر المقاول.`);return;}
    if(!creates.has(row.contractor_id))creates.set(row.contractor_id,[]);
    creates.get(row.contractor_id).push(row);
  });
  return Object.freeze({
    updates:Object.freeze(updates),
    creates:Object.freeze([...creates.entries()].map(([contractorId,list])=>Object.freeze({contractorId,rows:Object.freeze(list)}))),
    errors:Object.freeze(errors),
  });
}
