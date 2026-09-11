export const PROJECT_FINANCE_SOURCE_LABELS=Object.freeze({
  bank:'تحويل بنكي',
  cash:'نقدًا',
  custody:'من عهدة',
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
