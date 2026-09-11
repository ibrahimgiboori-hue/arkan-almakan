import { supabase } from '@/lib/supabase';

const READY_IMPORT_STATUSES=['recalculated','ready_to_post'];
const IMPORT_FIELDS='id,period_from,period_to,status,processing_scope,client_entity_id,client_name_snapshot,client_reference,uploaded_at';

export async function listExternalPayrollReadyImports(limit=30){
  const query=await supabase.from('hr_attendance_imports')
    .select(IMPORT_FIELDS)
    .eq('processing_scope','external')
    .in('status',READY_IMPORT_STATUSES)
    .order('uploaded_at',{ascending:false})
    .limit(Math.max(1,Number(limit)||30));
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadExternalPayrollAttendanceDays(importId){
  if(!importId)return [];
  const query=await supabase.from('v_hr_attendance_processing_days')
    .select('*')
    .eq('import_id',importId)
    .order('subject_name')
    .order('work_date');
  if(query.error)throw query.error;
  return query.data||[];
}

export async function findExternalPayrollBatchByImport(importId){
  const query=await supabase.from('hr_external_payroll_batches').select('*').eq('attendance_import_id',importId).maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

export async function findLatestExternalPayrollBatchByClient(clientKey){
  const query=await supabase.from('hr_external_payroll_batches').select('*').eq('client_key',clientKey).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

export async function loadExternalPayrollDefaults(){
  const query=await supabase.from('hr_attendance_settings').select('missing_punch_deduction_days').eq('id',1).maybeSingle();
  if(query.error)throw query.error;
  return query.data||{};
}

export async function createExternalPayrollBatch(payload){
  const query=await supabase.from('hr_external_payroll_batches').insert(payload).select('*').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function loadExternalPayrollProfiles(clientKey,sourceKeys=[]){
  const keys=[...new Set((sourceKeys||[]).filter(Boolean))];
  if(!keys.length)return [];
  const query=await supabase.from('hr_client_external_employee_profiles').select('*').eq('client_key',clientKey).in('source_employee_key',keys);
  if(query.error)throw query.error;
  return query.data||[];
}

export async function createExternalPayrollProfiles(rows=[]){
  if(!rows.length)return [];
  const query=await supabase.from('hr_client_external_employee_profiles').insert(rows).select('*');
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadExternalPayrollLines(batchId){
  if(!batchId)return [];
  const query=await supabase.from('hr_external_payroll_lines').select('*').eq('payroll_batch_id',batchId);
  if(query.error)throw query.error;
  return query.data||[];
}

export async function createExternalPayrollLines(rows=[]){
  if(!rows.length)return [];
  const query=await supabase.from('hr_external_payroll_lines').insert(rows).select('*');
  if(query.error)throw query.error;
  return query.data||[];
}

export async function updateExternalPayrollBatch(id,patch,{returning=true}={}){
  let query=supabase.from('hr_external_payroll_batches').update(patch).eq('id',id);
  if(returning)query=query.select('*').single();
  const result=await query;
  if(result.error)throw result.error;
  return returning?result.data:true;
}

export async function updateExternalPayrollProfile(id,patch,{returning=true}={}){
  let query=supabase.from('hr_client_external_employee_profiles').update(patch).eq('id',id);
  if(returning)query=query.select('*').single();
  const result=await query;
  if(result.error)throw result.error;
  return returning?result.data:true;
}

export async function updateExternalPayrollLine(id,patch,{returning=true}={}){
  let query=supabase.from('hr_external_payroll_lines').update(patch).eq('id',id);
  if(returning)query=query.select('*').single();
  const result=await query;
  if(result.error)throw result.error;
  return returning?result.data:true;
}

export async function uploadExternalPayrollBrandAsset(path,file){
  const upload=await supabase.storage.from('brand').upload(path,file,{cacheControl:'31536000',upsert:false,contentType:file.type});
  if(upload.error)throw upload.error;
  return upload.data;
}

export const externalPayrollSupabaseRepository=Object.freeze({
  listReadyImports:listExternalPayrollReadyImports,
  loadAttendanceDays:loadExternalPayrollAttendanceDays,
  findBatchByImport:findExternalPayrollBatchByImport,
  findLatestBatchByClient:findLatestExternalPayrollBatchByClient,
  loadDefaults:loadExternalPayrollDefaults,
  createBatch:createExternalPayrollBatch,
  loadProfiles:loadExternalPayrollProfiles,
  createProfiles:createExternalPayrollProfiles,
  loadLines:loadExternalPayrollLines,
  createLines:createExternalPayrollLines,
  updateBatch:updateExternalPayrollBatch,
  updateProfile:updateExternalPayrollProfile,
  updateLine:updateExternalPayrollLine,
  uploadBrandAsset:uploadExternalPayrollBrandAsset,
});
