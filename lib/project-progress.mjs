import { PROJECT_CLAIM_STAGE_LABELS } from './project-claims.mjs';

export const PROJECT_PROGRESS_CLAIM_STAGE_LABELS=PROJECT_CLAIM_STAGE_LABELS;

const number=(value)=>Number(value||0);
const optionalNumber=(value)=>value===''||value===undefined||value===null?null:Number(value);
const text=(value)=>String(value||'').trim();

export class ProgressClaimImpactError extends Error{
  constructor(impact){
    super('هذا الإنجاز مرتبط بمستخلص؛ يلزم تأكيد أثر التعديل أو الحذف قبل التنفيذ.');
    this.name='ProgressClaimImpactError';
    this.code='CLAIM_IMPACT_CONFIRM_REQUIRED';
    this.impact=impact||null;
  }
}

export function buildProjectProgressWorkspace({progressRows=[],entries=[],claims=[]}={}){
  return Object.freeze({
    rows:Object.freeze([...(progressRows||[])]),
    entries:Object.freeze([...(entries||[])]),
    claims:Object.freeze(Object.fromEntries((claims||[]).map((claim)=>[claim.id,Object.freeze({...claim})]))),
  });
}

export function progressEntryClaimImpact(entry={},claim=null){
  const linked=Boolean(entry?.claim_id);
  return Object.freeze({
    linked,
    claimId:entry?.claim_id||null,
    claimNo:claim?.claim_no||null,
    claimStatus:claim?.status||null,
    claimStageLabel:claim?.status?PROJECT_PROGRESS_CLAIM_STAGE_LABELS[claim.status]||claim.status:null,
    leftDraft:Boolean(claim&&claim.status!=='draft'),
  });
}

export function assertProgressClaimImpactAcknowledged(entry,claim,acknowledged=false){
  const impact=progressEntryClaimImpact(entry,claim);
  if(impact.linked&&acknowledged!==true)throw new ProgressClaimImpactError(impact);
  return impact;
}

export function buildProgressRecordPayload({item,form={},defaultDate}={}){
  if(!item?.project_item_id)throw new Error('البند غير محدد.');
  if(!form.qty&&!form.pct)throw new Error('أدخل الكمية المنفَّذة أو النسبة');
  const qty=number(form.qty);
  const pct=optionalNumber(form.pct);
  if(qty<0)throw new Error('الكمية المنفذة لا يمكن أن تكون سالبة.');
  if(pct!==null&&!Number.isFinite(pct))throw new Error('راجع النسبة اليدوية.');
  return Object.freeze({
    project_item_id:item.project_item_id,
    entry_date:form.date||defaultDate,
    qty_done:qty,
    manual_pct:pct,
    notes:text(form.notes)||null,
  });
}

export function buildProgressEditPayload({entry,draft={},reason='',editDate}={}){
  if(!entry?.id)throw new Error('تسجيل الإنجاز غير محدد.');
  const qty=draft.qty_done===''?0:number(draft.qty_done);
  const pct=optionalNumber(draft.manual_pct);
  if(qty<0)throw new Error('الكمية المنفذة لا يمكن أن تكون سالبة.');
  if(pct!==null&&!Number.isFinite(pct))throw new Error('راجع النسبة اليدوية.');
  const cleanReason=text(reason);
  const stamp=cleanReason
    ? `${entry.notes?`${entry.notes} | `:''}تعديل ${editDate}: ${cleanReason}`
    : (entry.notes||null);
  return Object.freeze({
    entry_date:draft.entry_date||entry.entry_date,
    qty_done:qty,
    manual_pct:pct,
    notes:stamp,
  });
}

export function progressClaimImpactMessage(entry,claim){
  const impact=progressEntryClaimImpact(entry,claim);
  if(!impact.linked)return '';
  const claimName=impact.claimNo||'مستخلص مرتبط';
  const stage=impact.claimStageLabel?` — مرحلته «${impact.claimStageLabel}»`:'';
  return `هذا الإنجاز داخل ${claimName}${stage}.`;
}
