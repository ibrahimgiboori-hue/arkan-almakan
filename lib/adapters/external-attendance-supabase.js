import { supabase } from '@/lib/supabase';

const IMPORT_SUMMARY_FIELDS='id,client_name_snapshot,period_from,period_to,processing_scope,uploaded_at,status';

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

export async function deleteExternalAttendanceImport(id) {
  if (!id) throw new Error('معرّف الدفعة مطلوب.');
  const query=await supabase.rpc('hr_delete_external_attendance_import',{p_import_id:id});
  if (query.error) throw query.error;
  return query.data ?? true;
}
