export const PROJECT_CLAIM_JOURNEY=Object.freeze([
  Object.freeze(['measurement','القياس']),
  Object.freeze(['internal','الاعتماد الداخلي']),
  Object.freeze(['client_submit','التقديم للعميل']),
  Object.freeze(['client_approve','اعتماد العميل']),
  Object.freeze(['collection','التحصيل']),
  Object.freeze(['invoice','الفاتورة']),
]);

export const PROJECT_CLAIM_STAGE_LABELS=Object.freeze({
  draft:'مسودة',
  submitted:'مقدَّم للمالك',
  owner_approved:'معتمد',
  invoiced:'مفوتر',
  collected:'محصَّل',
});

const number=(value)=>Number(value||0);
const text=(value)=>String(value||'').trim();

export function buildProjectClaimsWorkspace({claims=[],available=[],items=[],attachments=[],claimLines=[],journeyContexts=[]}={}){
  const docs={};
  for(const row of attachments||[])(docs[row.entity_id]=docs[row.entity_id]||[]).push(row);
  const lines={};
  for(const row of claimLines||[])(lines[row.claim_id]=lines[row.claim_id]||[]).push(row);
  const journeys={};
  for(const entry of journeyContexts||[]){
    if(entry?.claimId&&!entry?.error)journeys[entry.claimId]=entry.data||{};
  }
  return Object.freeze({
    claims:Object.freeze([...(claims||[])]),
    available:Object.freeze([...(available||[])]),
    items:Object.freeze([...(items||[])]),
    docs:Object.freeze(docs),
    claimLines:Object.freeze(lines),
    journeys:Object.freeze(journeys),
  });
}

export function projectClaimDocsAt(docs={},claimId,stage,code=null){
  return (docs?.[claimId]||[]).filter((doc)=>doc.stage===stage&&(!code||doc.doc_code===code));
}

export function projectClaimJourneyState(claim={},context={},invoiceFile=false){
  const workflow=context?.approval?.workflow;
  const internalDone=claim.status!=='draft';
  const clientSubmitted=Boolean(claim.client_submitted_at);
  const ownerApproved=['owner_approved','collected'].includes(claim.status);
  const collected=claim.status==='collected';
  const invoiceDone=collected&&Boolean(claim.invoice_no&&claim.invoiced_at&&invoiceFile);
  return Object.freeze({
    measurement:'done',
    internal:internalDone?'done':(workflow?.status==='pending'?'current':'current'),
    client_submit:internalDone?(clientSubmitted?'done':'current'):'future',
    client_approve:clientSubmitted?(ownerApproved?'done':'current'):'future',
    collection:ownerApproved?(collected?'done':'current'):'future',
    invoice:collected?(invoiceDone?'done':'current'):'future',
    invoiceDone,
  });
}

export function projectClaimCurrentJourneyLabel(state={}){
  return PROJECT_CLAIM_JOURNEY.find(([key])=>state?.[key]==='current')?.[1]||(state?.invoiceDone?'مكتمل':'—');
}

export function projectClaimSelectedMeasurements(available=[],selected=[]){
  const ids=new Set(selected||[]);
  const rows=(available||[]).filter((row)=>ids.has(row.measurement_id));
  return Object.freeze({
    rows:Object.freeze(rows),
    total:rows.reduce((sum,row)=>sum+number(row.amount),0),
  });
}

export function buildProjectMeasurementPayload(measure={}){
  if(!measure?.item||!measure?.from||!measure?.to||!measure?.qty)throw new Error('أدخل البند والفترة والكمية');
  if(measure.from>measure.to)throw new Error('بداية فترة القياس يجب ألا تتجاوز نهايتها.');
  const qty=number(measure.qty);
  if(qty<=0)throw new Error('الكمية المقاسة يجب أن تكون أكبر من صفر.');
  const price=measure.price===''||measure.price==null?null:Number(measure.price);
  if(price!==null&&(!Number.isFinite(price)||price<0))throw new Error('راجع فئة السعر.');
  return Object.freeze({
    p_project_item:measure.item,
    p_period_from:measure.from,
    p_period_to:measure.to,
    p_qty:qty,
    p_unit_price:price,
    p_document_ref:text(measure.ref)||null,
    p_notes:text(measure.notes)||null,
    p_measured_by_employee:null,
  });
}

export function buildHistoricalMeasurementStart(value,measurement={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))||value>measurement?.period_to)throw new Error('راجع تاريخ بداية الفترة');
  return Object.freeze({period_from:value});
}

export function buildMeasurementEdit({from,to,qty,price}={}){
  if(!from||!to||from>to||number(qty)<=0||number(price)<0)throw new Error('راجع فترة القياس والكمية والسعر');
  return Object.freeze({
    period_from:from,
    period_to:to,
    qty_measured:number(qty),
    unit_price:number(price),
  });
}

export function buildCreateClaimPayload(projectId,measurementIds=[]){
  const ids=[...new Set((measurementIds||[]).filter(Boolean))];
  if(!projectId)throw new Error('المشروع غير محدد.');
  if(!ids.length)throw new Error('اختر تمتيراً واحداً على الأقل');
  return Object.freeze({p_project:projectId,p_measurement_ids:Object.freeze(ids)});
}

export function projectClaimApprovalDecision({workflowId,decision,note=''}){
  if(!workflowId)throw new Error('رحلة الاعتماد غير محددة.');
  if(!['approve','return','reject'].includes(decision))throw new Error('قرار الاعتماد غير مدعوم.');
  const cleanNote=text(note);
  if(decision!=='approve'&&!cleanNote)throw new Error('اكتب سبب الإرجاع أو الرفض');
  return Object.freeze({
    p_workflow_id:workflowId,
    p_decision:decision,
    p_comment:cleanNote||null,
    p_next_user_id:null,
    p_next_capability:null,
    p_next_reason:null,
  });
}

export function buildClaimClientSubmission({claimId,date,reference}={}){
  if(!claimId||!date)throw new Error('المستخلص وتاريخ التقديم مطلوبان.');
  return Object.freeze({p_claim:claimId,p_submission_date:date,p_ref:text(reference)||null});
}

export function buildClaimOwnerApproval({claimId,reference}={}){
  if(!claimId)throw new Error('المستخلص غير محدد.');
  return Object.freeze({p_claim:claimId,p_to:'owner_approved',p_ref:text(reference)||null,p_amount:null});
}

export function buildClaimCollection({claimId,accountId,date,reference}={}){
  if(!claimId)throw new Error('المستخلص غير محدد.');
  if(!accountId)throw new Error('اختر الحساب الذي استلم المبلغ');
  if(!date)throw new Error('تاريخ التحصيل مطلوب.');
  return Object.freeze({
    p_claim_id:claimId,
    p_account_id:accountId,
    p_collection_date:date,
    p_reference:text(reference)||null,
  });
}

export function buildClaimInvoice({claimId,invoiceNo,date}={}){
  const no=text(invoiceNo);
  if(!claimId)throw new Error('المستخلص غير محدد.');
  if(!no)throw new Error('رقم الفاتورة مطلوب');
  if(!date)throw new Error('تاريخ الفاتورة مطلوب.');
  return Object.freeze({p_claim:claimId,p_invoice_no:no,p_invoice_date:date});
}

export function normalizeDraftClaimPatch(fields={}){
  const allowed=new Set(['retention_amount','advance_recovery']);
  const patch={};
  for(const [key,value] of Object.entries(fields||{}))if(allowed.has(key))patch[key]=number(value);
  if(!Object.keys(patch).length)throw new Error('لا يوجد تعديل مسموح للمستخلص.');
  return Object.freeze(patch);
}

export function buildClaimAttachment({claimId,stage,code,direction,title,filePath=null,reference=null,notes=null}={}){
  if(!claimId||!stage||!code||!direction||!title)throw new Error('بيانات مستند المستخلص غير مكتملة.');
  return Object.freeze({
    entity_type:'claim',
    entity_id:claimId,
    stage,
    doc_code:code,
    direction,
    title,
    file_path:filePath||null,
    ref_no:text(reference)||null,
    notes:text(notes)||null,
  });
}

export function safeClaimFileName(name='document'){
  return String(name||'document').replace(/[^\w.\-]/g,'_');
}

/* ---------- the measurements sheet ---------- */

const measurementDraftId=()=>globalThis?.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createMeasurementDraft(seed={},idFactory=measurementDraftId){
  return {_id:idFactory(),persisted:false,item:'',from:'',to:'',qty:'',price:'',ref:'',...seed};
}

/** A measurement waiting for a claim, as a sheet row (its period, quantity and price stay editable). */
export function measurementSheetRow(m){
  return {
    _id:m?.measurement_id,persisted:true,measurement:m,
    item:m?.project_item_id||'',label:m?.description_ar||'',no:m?.measurement_no??'',
    from:m?.period_from||'',to:m?.period_to||'',
    qty:m?.qty_measured==null?'':String(m.qty_measured),price:m?.unit_price==null?'':String(m.unit_price),
    ready:Boolean(m?.ready_for_claim),amount:number(m?.amount),ref:'',
  };
}

export function measurementLineValue(row){
  const qty=number(row?.qty);
  const price=row?.price===''||row?.price==null?null:number(row.price);
  if(qty>0&&price!==null)return Math.round(qty*price*100)/100;
  return row?.persisted?number(row?.amount):null;
}

export function measurementDraftUsed(row){
  return !row?.persisted&&(number(row?.qty)>0||Boolean(row?.item)&&Boolean(row?.to)||Boolean(String(row?.ref||'').trim()));
}

/** New measurement rows that pass the same rule as a single recorded measurement, with errors by sheet row. */
export function validateMeasurementDrafts(rows=[]){
  const ready=[];
  const errors=[];
  (rows||[]).forEach((row,index)=>{
    if(!measurementDraftUsed(row))return;
    try{buildProjectMeasurementPayload(row);ready.push(row);}
    catch(error){errors.push(`الصف ${index+1}: ${error.message}`);}
  });
  return Object.freeze({ready,errors});
}

/** What changed on an existing measurement row: nothing, its missing start date only, or a full edit. */
export function measurementSheetChange(row){
  const m=row?.measurement||{};
  const same=(a,b)=>String(a??'')===String(b??'');
  const fromChanged=!same(row.from,m.period_from);
  const otherChanged=!same(row.to,m.period_to)||number(row.qty)!==number(m.qty_measured)||number(row.price)!==number(m.unit_price);
  if(!fromChanged&&!otherChanged)return 'none';
  if(!m.period_from&&fromChanged&&!otherChanged)return 'start';
  return 'edit';
}
