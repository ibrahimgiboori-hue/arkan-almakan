import { supabase } from '@/lib/supabase';
import { submitAttendanceJustification, decideAttendanceJustification } from './attendance-review-supabase.js';

const IMPORT_SUMMARY_FIELDS='id,client_name_snapshot,client_reference,period_from,period_to,processing_scope,uploaded_at,status,review_revision,recalculated_at,ready_to_post_at';

export async function getExternalAttendanceImportById(id) {
  if (!id) return null;
  const query=await supabase.from('hr_attendance_imports')
    .select(IMPORT_SUMMARY_FIELDS)
    .eq('id',id)
    .eq('processing_scope','external')
    .maybeSingle();
  if (query.error) throw query.error;
  return query.data || null;
}

export async function listRecentExternalAttendanceImports(limit=2) {
  const query=await supabase.from('hr_attendance_imports')
    .select(IMPORT_SUMMARY_FIELDS)
    .eq('processing_scope','external')
    .order('uploaded_at',{ascending:false})
    .limit(Math.max(1,Number(limit)||1));
  if (query.error) throw query.error;
  return query.data || [];
}

export async function listExternalAttendanceImportsByStatus(statuses=[],limit=40) {
  let query=supabase.from('hr_attendance_imports')
    .select(IMPORT_SUMMARY_FIELDS)
    .eq('processing_scope','external')
    .order('uploaded_at',{ascending:false})
    .limit(Math.max(1,Number(limit)||1));
  if(statuses.length)query=query.in('status',statuses);
  const result=await query;
  if(result.error)throw result.error;
  return result.data||[];
}

export async function loadExternalAttendanceProcessingDays(importId) {
  if(!importId)return [];
  const query=await supabase.from('v_hr_attendance_processing_days')
    .select('*')
    .eq('import_id',importId)
    .order('subject_name')
    .order('work_date');
  if(query.error)throw query.error;
  return query.data||[];
}

export async function startExternalAttendanceReview(importId) {
  const query=await supabase.rpc('hr_start_attendance_review',{p_import_id:importId});
  if(query.error)throw query.error;
  return query.data??true;
}

export async function submitExternalAttendanceJustification(input) {
  return submitAttendanceJustification(input);
}

export async function decideExternalAttendanceJustification(input) {
  return decideAttendanceJustification(input);
}

export async function recalculateExternalAttendanceImport(importId) {
  const query=await supabase.rpc('hr_recalculate_attendance_import',{p_import_id:importId});
  if(query.error)throw query.error;
  return query.data;
}

export async function deleteExternalAttendanceImport(id) {
  if (!id) throw new Error('معرّف الدفعة مطلوب.');
  const query=await supabase.rpc('hr_delete_external_attendance_import',{p_import_id:id});
  if (query.error) throw query.error;
  return query.data ?? true;
}

export const externalAttendanceSupabaseRepository=Object.freeze({
  getImport:getExternalAttendanceImportById,
  listImports:listExternalAttendanceImportsByStatus,
  loadProcessingDays:loadExternalAttendanceProcessingDays,
  startReview:startExternalAttendanceReview,
  submitJustification:submitExternalAttendanceJustification,
  decideJustification:decideExternalAttendanceJustification,
  recalculateImport:recalculateExternalAttendanceImport,
  deleteImport:deleteExternalAttendanceImport,
});
