export const PROJECT_GUARANTEE_KINDS=Object.freeze({
  advance:'دفعة مقدمة',
  performance:'حسن تنفيذ',
  final:'نهائي',
  maintenance:'صيانة',
  other:'أخرى',
});

const textOrNull=(value)=>{
  const text=String(value ?? '').trim();
  return text || null;
};

const amountNumber=(value)=>{
  const number=Number(value || 0);
  if(!Number.isFinite(number))throw new Error('قيمة الضمان غير صحيحة.');
  return number;
};

const isoDayNumber=(value)=>{
  const match=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!match)return null;
  return Math.floor(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))/86400000);
};

export function guaranteeExpiryState(expiryDate,todayIso){
  if(!expiryDate)return null;
  const expiry=isoDayNumber(expiryDate);
  const today=isoDayNumber(todayIso);
  if(expiry===null||today===null)return null;
  const daysLeft=expiry-today;
  return Object.freeze({
    daysLeft,
    tone:daysLeft<0?'bad':daysLeft<=30?'warn':'ok',
    label:daysLeft<0?`منتهٍ منذ ${Math.abs(daysLeft)} يوم`:`${daysLeft} يوم`,
  });
}

export function buildGuaranteeRecord({projectId,form}){
  if(!projectId)throw new Error('المشروع غير محدد.');
  const kind=Object.hasOwn(PROJECT_GUARANTEE_KINDS,form?.kind)?form.kind:'performance';
  return Object.freeze({
    project_id:projectId,
    kind,
    issuer:textOrNull(form?.issuer),
    reference_no:textOrNull(form?.reference_no),
    amount:amountNumber(form?.amount),
    expiry_date:textOrNull(form?.expiry_date),
  });
}

export function buildProjectGuaranteesWorkspace({guarantees=[],retentions=[],todayIso}={}){
  return Object.freeze({
    guarantees:Object.freeze((guarantees || []).map((row)=>Object.freeze({
      ...row,
      expiry_state:guaranteeExpiryState(row.expiry_date,todayIso),
    }))),
    retentions:Object.freeze([...(retentions || [])]),
  });
}
