export const PROJECT_FINANCE_SOURCE_LABELS=Object.freeze({
  bank:'تحويل بنكي',
  cash:'نقدًا',
  custody:'من عهدة',
});

export const PROJECT_FINANCE_KIND_LABELS=Object.freeze({
  advance:'سلفة',
  payment:'دفعة',
});

const number=(value)=>Number(value||0);

export function buildProjectFinancePayload({kind,contractorId,amount,notes,source,reference}){
  const value=number(amount);
  if(!contractorId)throw new Error('المقاول غير محدد.');
  if(!value)throw new Error('المبلغ مطلوب.');
  if(kind==='advance')return {
    contractor_id:contractorId,
    amount:value,
    notes:String(notes||'').trim()||null,
  };
  if(kind==='payment')return {
    contractor_id:contractorId,
    amount:value,
    kind:'on_account',
    source:source||'bank',
    reference:String(reference||'').trim()||null,
    notes:String(notes||'').trim()||null,
  };
  throw new Error('نوع الحركة المالية غير مدعوم.');
}

export function summarizeProjectFinanceDay({advances=[],payments=[]}={}){
  const advanceTotal=(advances||[]).reduce((sum,row)=>sum+number(row?.amount),0);
  const paymentTotal=(payments||[]).reduce((sum,row)=>sum+number(row?.amount),0);
  return Object.freeze({
    advanceTotal,
    paymentTotal,
    total:advanceTotal+paymentTotal,
    count:(advances||[]).length+(payments||[]).length,
  });
}

/* ---------- the advances & payments sheet ---------- */

const draftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createFinanceDraft(seed={},idFactory=draftId){
  return {_id:idFactory(),id:null,persisted:false,kind:'advance',amount:'',source:'bank',reference:'',notes:'',...seed};
}

/** The day's saved advances and payments as locked sheet rows. */
export function storedFinanceRows({advances=[],payments=[]}={}){
  return [
    ...(advances||[]).map((row)=>({_id:`advance-${row.id}`,id:row.id,persisted:true,kind:'advance',amount:String(row.amount??''),source:'',reference:'',notes:row.notes||''})),
    ...(payments||[]).map((row)=>({_id:`payment-${row.id}`,id:row.id,persisted:true,kind:'payment',amount:String(row.amount??''),source:row.source||'bank',reference:row.reference||'',notes:row.notes||''})),
  ];
}

export function financeDraftUsed(row){
  return !row?.persisted&&(number(row?.amount)>0||Boolean(String(row?.notes||'').trim())||Boolean(String(row?.reference||'').trim()));
}

export function validateFinanceDrafts(rows=[]){
  const ready=[];
  const errors=[];
  (rows||[]).forEach((row,index)=>{
    if(!financeDraftUsed(row))return;
    if(!PROJECT_FINANCE_KIND_LABELS[row.kind])errors.push(`الصف ${index+1}: اختر سلفة أو دفعة.`);
    else if(!(number(row.amount)>0))errors.push(`الصف ${index+1}: المبلغ مطلوب.`);
    else ready.push(row);
  });
  return Object.freeze({ready,errors});
}
