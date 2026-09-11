export const PROJECT_CUSTODY_DIRECTION_LABELS=Object.freeze({
  issue:'تعزيز العهدة',
  spend:'صرف من العهدة',
  return:'إرجاع متبقي',
});

export const PROJECT_CUSTODY_CHARGE_LABELS=Object.freeze({
  arkan:'أركان',
  contractor:'المقاول',
  owner:'المالك',
});

export const EMPTY_PROJECT_CUSTODY_OPEN_FORM=Object.freeze({
  employee_id:'',
  opened_at:'',
  purpose:'',
  initial_amount:'',
});

export const EMPTY_PROJECT_CUSTODY_TRANSACTION_FORM=Object.freeze({
  direction:'spend',
  trx_date:'',
  amount:'',
  category:'مصروف تشغيلي',
  beneficiary:'',
  charge_to:'arkan',
  contractor_id:'',
  notes:'',
});

const number=(value)=>Number(value||0);

export function normalizeProjectCustodyWorkspace({balances=[],custodies=[],eligibleEmployees=[],missingEmployees=[],contractors=[]}={}){
  const balanceById=new Map((balances||[]).map((row)=>[row.custody_id,row]));
  const rows=(custodies||[]).map((row)=>Object.freeze({
    ...row,
    balance:number(balanceById.get(row.id)?.balance),
  }));
  const allEmployees=[...(eligibleEmployees||[]),...(missingEmployees||[])];
  return Object.freeze({
    custodies:Object.freeze(rows),
    employeeOptions:Object.freeze([...(eligibleEmployees||[])]),
    employees:Object.freeze(Object.fromEntries(allEmployees.map((row)=>[row.id,row.full_name_ar]))),
    contractors:Object.freeze([...(contractors||[])]),
  });
}

export function summarizeProjectCustodyTransactions(rows=[]){
  return Object.freeze((rows||[]).reduce((totals,row)=>{
    const value=number(row?.amount);
    if(row?.direction==='issue')totals.issued+=value;
    if(row?.direction==='spend')totals.spent+=value;
    if(row?.direction==='return')totals.returned+=value;
    return totals;
  },{issued:0,spent:0,returned:0}));
}

export function buildOpenProjectCustodyPayload({projectId,form}){
  if(!projectId)throw new Error('المشروع غير محدد.');
  if(!form?.employee_id)throw new Error('اختر صاحب العهدة.');
  if(!form?.opened_at)throw new Error('حدد تاريخ فتح العهدة.');
  return Object.freeze({
    p_project_id:projectId,
    p_employee_id:form.employee_id,
    p_opened_at:form.opened_at,
    p_purpose:String(form?.purpose||'').trim()||null,
    p_initial_amount:number(form?.initial_amount),
  });
}

export function buildProjectCustodyTransactionPayload({projectId,custodyId,form,documentPath=null}){
  if(!projectId||!custodyId)throw new Error('سياق العهدة غير مكتمل.');
  const amount=number(form?.amount);
  if(amount<=0)throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
  const direction=form?.direction||'spend';
  if(!PROJECT_CUSTODY_DIRECTION_LABELS[direction])throw new Error('نوع حركة العهدة غير مدعوم.');
  if(!form?.trx_date)throw new Error('حدد تاريخ حركة العهدة.');
  if(direction==='spend'&&!String(form?.beneficiary||'').trim())throw new Error('البيان أو المستفيد مطلوب عند الصرف من العهدة.');
  if(direction==='spend'&&form?.charge_to==='contractor'&&!form?.contractor_id)throw new Error('اختر المقاول المحمل عليه المصروف.');

  return Object.freeze({
    custody_id:custodyId,
    direction,
    trx_date:form.trx_date,
    amount,
    project_id:projectId,
    category:direction==='spend'?(String(form?.category||'').trim()||'مصروف تشغيلي'):(direction==='issue'?'تعزيز عهدة':'إرجاع عهدة'),
    beneficiary:direction==='spend'?(String(form?.beneficiary||'').trim()||null):null,
    notes:String(form?.notes||'').trim()||null,
    charge_to:direction==='spend'?(form?.charge_to||'arkan'):null,
    contractor_id:direction==='spend'&&form?.charge_to==='contractor'?(form?.contractor_id||null):null,
    document_path:documentPath||null,
  });
}

export function projectCustodyCanSettle(custody){
  return Boolean(custody?.id&&custody?.status==='open'&&Math.abs(number(custody?.balance))<0.000001);
}

export function projectCustodyRequiresOnline(){
  return Object.freeze({
    open:'فتح عهدة جديدة يحتاج اتصالًا مباشرًا بالخادم.',
    transaction:'حركات العهدة المالية تحتاج اتصالًا مباشرًا حتى نتأكد من الرصيد قبل الحفظ.',
    settle:'تسوية العهدة تحتاج اتصالًا مباشرًا بالخادم.',
  });
}
