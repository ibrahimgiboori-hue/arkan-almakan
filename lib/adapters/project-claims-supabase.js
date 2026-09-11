import { supabase } from '@/lib/supabase';

const CLAIM_DOC_BUCKET='docs';
const CLAIM_LINE_FIELDS='claim_id,project_item_id,qty_this,unit_price,amount,measurement_id,measurement_no_snapshot,measurement_period_from,measurement_period_to,description_snapshot,unit_snapshot';

export async function loadProjectClaimsPrimarySource(projectId){
  const [claimsQ,availableQ,itemsQ]=await Promise.all([
    supabase.from('progress_claims').select('*').eq('project_id',projectId).order('seq_no'),
    supabase.from('v_available_measurements').select('*').eq('project_id',projectId).order('period_to').order('measurement_no'),
    supabase.from('v_item_measurement_status').select('*').eq('project_id',projectId).order('description_ar'),
  ]);
  const error=[claimsQ,availableQ,itemsQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {
    claims:claimsQ.data||[],
    available:availableQ.data||[],
    items:itemsQ.data||[],
  };
}

export async function loadProjectClaimsDetailSource(claimIds=[]){
  const ids=[...new Set((claimIds||[]).filter(Boolean))];
  if(!ids.length)return {attachments:[],claimLines:[],journeyContexts:[]};
  const [attachmentsQ,linesQ,...contexts]=await Promise.all([
    supabase.from('op_attachments').select('*').eq('entity_type','claim').in('entity_id',ids).order('created_at'),
    supabase.from('claim_lines').select(CLAIM_LINE_FIELDS).in('claim_id',ids),
    ...ids.map(async(claimId)=>{
      const query=await supabase.rpc('fn_claim_journey_context',{p_claim_id:claimId});
      return {claimId,data:query.data||{},error:query.error||null};
    }),
  ]);
  if(attachmentsQ.error)throw attachmentsQ.error;
  if(linesQ.error)throw linesQ.error;
  return {
    attachments:attachmentsQ.data||[],
    claimLines:linesQ.data||[],
    journeyContexts:contexts,
  };
}

export async function loadProjectClaimJourneyContext(claimId){
  const query=await supabase.rpc('fn_claim_journey_context',{p_claim_id:claimId});
  if(query.error)throw query.error;
  return query.data||{};
}

export async function loadProjectClaimProof(claimId){
  const query=await supabase.from('progress_claims').select('*').eq('id',claimId).single();
  if(query.error)throw query.error;
  return query.data;
}

export async function recordProjectItemMeasurement(payload){
  const query=await supabase.rpc('record_item_measurement',payload);
  if(query.error)throw query.error;
  return Array.isArray(query.data)?query.data[0]:query.data;
}

export async function updateAvailableProjectMeasurement(measurementId,fields){
  return supabase.from('item_measurements')
    .update(fields)
    .eq('id',measurementId)
    .eq('status','available')
    .select('id');
}

export async function createProjectClaimFromMeasurements(payload){
  const query=await supabase.rpc('create_claim_from_measurements',payload);
  if(query.error)throw query.error;
  return Array.isArray(query.data)?query.data[0]:query.data;
}

export async function insertProjectClaimAttachment(payload){
  const query=await supabase.from('op_attachments').insert(payload).select('*').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function submitProjectClaimForApproval(claimId){
  const query=await supabase.rpc('fn_submit_progress_claim_for_approval',{p_claim_id:claimId,p_note:null});
  if(query.error)throw query.error;
  return query.data;
}

export async function decideProjectClaimApproval(payload){
  const query=await supabase.rpc('fn_approval_decide',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function recordProjectClaimClientSubmission(payload){
  const query=await supabase.rpc('record_claim_client_submission',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function recordProjectClaimOwnerApproval(payload){
  const query=await supabase.rpc('advance_claim',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function collectProjectClaimToTreasury(payload){
  const query=await supabase.rpc('fn_claim_collect_to_treasury',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function recordProjectClaimInvoice(payload){
  const query=await supabase.rpc('record_claim_invoice',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function updateDraftProjectClaim(claimId,fields){
  return supabase.from('progress_claims')
    .update(fields)
    .eq('id',claimId)
    .eq('status','draft')
    .select('*')
    .maybeSingle();
}

export async function deleteProjectClaimDeep(claimId){
  const query=await supabase.rpc('delete_claim_deep',{p_claim:claimId});
  if(query.error)throw query.error;
  return Array.isArray(query.data)?query.data[0]:query.data;
}

export async function uploadProjectClaimDocument({claimId,code,file,fileName}){
  const path=`claims/${claimId}/${code}_${Date.now()}_${fileName}`;
  const query=await supabase.storage.from(CLAIM_DOC_BUCKET).upload(path,file);
  if(query.error)throw query.error;
  return path;
}

export async function removeProjectClaimDocuments(paths=[]){
  const values=[...new Set((paths||[]).filter(Boolean))];
  if(!values.length)return true;
  const query=await supabase.storage.from(CLAIM_DOC_BUCKET).remove(values);
  if(query.error)throw query.error;
  return true;
}

export async function createProjectClaimDocumentUrl(path){
  const query=await supabase.storage.from(CLAIM_DOC_BUCKET).createSignedUrl(path,120);
  if(query.error)throw query.error;
  if(!query.data?.signedUrl)throw new Error('تعذر إنشاء رابط الملف.');
  return query.data.signedUrl;
}

export const projectClaimsSupabaseRepository=Object.freeze({
  loadPrimary:loadProjectClaimsPrimarySource,
  loadDetails:loadProjectClaimsDetailSource,
  loadJourneyContext:loadProjectClaimJourneyContext,
  loadClaimProof:loadProjectClaimProof,
  recordMeasurement:recordProjectItemMeasurement,
  updateAvailableMeasurement:updateAvailableProjectMeasurement,
  createClaimFromMeasurements:createProjectClaimFromMeasurements,
  insertAttachment:insertProjectClaimAttachment,
  submitForApproval:submitProjectClaimForApproval,
  decideApproval:decideProjectClaimApproval,
  recordClientSubmission:recordProjectClaimClientSubmission,
  recordOwnerApproval:recordProjectClaimOwnerApproval,
  collectToTreasury:collectProjectClaimToTreasury,
  recordInvoice:recordProjectClaimInvoice,
  updateDraftClaim:updateDraftProjectClaim,
  deleteClaimDeep:deleteProjectClaimDeep,
  uploadDocument:uploadProjectClaimDocument,
  removeDocuments:removeProjectClaimDocuments,
  createDocumentUrl:createProjectClaimDocumentUrl,
});
