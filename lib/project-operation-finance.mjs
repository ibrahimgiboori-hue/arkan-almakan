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

/* ---------- the advances & payments ledger: one sheet for the whole project ---------- */

const draftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createFinanceDraft(seed={},idFactory=draftId){
  return {_id:idFactory(),id:null,persisted:false,date:'',contractor_id:'',kind:'advance',amount:'',source:'bank',reference:'',notes:'',...seed};
}

/** Saved advances and payments as locked ledger rows, oldest first. */
export function storedFinanceRows({advances=[],payments=[]}={}){
  return [
    ...(advances||[]).map((row)=>({_id:`advance-${row.id}`,id:row.id,persisted:true,date:row.advance_date||'',contractor_id:row.contractor_id||'',kind:'advance',amount:String(row.amount??''),source:'',reference:'',notes:row.notes||'',created_at:row.created_at||''})),
    ...(payments||[]).map((row)=>({_id:`payment-${row.id}`,id:row.id,persisted:true,date:row.payment_date||'',contractor_id:row.contractor_id||'',kind:'payment',amount:String(row.amount??''),source:row.source||'bank',reference:row.reference||'',notes:row.notes||'',created_at:row.created_at||''})),
  ].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.created_at).localeCompare(String(b.created_at)));
}

export function financeDraftUsed(row){
  return !row?.persisted&&(number(row?.amount)>0||Boolean(String(row?.notes||'').trim())||Boolean(String(row?.reference||'').trim()));
}

/** Ready new rows and a message per incomplete one. With ledger:true a row also needs its date and contractor. */
export function validateFinanceDrafts(rows=[],{ledger=false,from='',to=''}={}){
  const ready=[];
  const errors=[];
  (rows||[]).forEach((row,index)=>{
    if(!financeDraftUsed(row))return;
    const label=`الصف ${index+1}`;
    if(!PROJECT_FINANCE_KIND_LABELS[row.kind])errors.push(`${label}: اختر سلفة أو دفعة.`);
    else if(!(number(row.amount)>0))errors.push(`${label}: المبلغ مطلوب.`);
    else if(ledger&&!row.date)errors.push(`${label}: اكتب التاريخ.`);
    else if(ledger&&((from&&row.date<from)||(to&&row.date>to)))errors.push(`${label}: التاريخ خارج فترة العرض — وسّع الفلترة لتشمله.`);
    else if(ledger&&!row.contractor_id)errors.push(`${label}: اختر المقاول.`);
    else ready.push(row);
  });
  return Object.freeze({ready,errors});
}

/** Advance and payment totals of the rows shown. */
export function summarizeFinanceLedger(rows=[]){
  let advanceTotal=0;let paymentTotal=0;
  for(const row of rows||[]){
    if(!row?.persisted)continue;
    if(row.kind==='advance')advanceTotal+=number(row.amount);
    else if(row.kind==='payment')paymentTotal+=number(row.amount);
  }
  return Object.freeze({advanceTotal,paymentTotal,total:advanceTotal+paymentTotal});
}
