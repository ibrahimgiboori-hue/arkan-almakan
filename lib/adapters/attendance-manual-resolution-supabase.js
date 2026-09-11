import { supabase } from '@/lib/supabase';

export const ATTENDANCE_MANUAL_RESOLUTION_ACTIVE_STATUSES=Object.freeze([
  'analyzed','justifications','recalculated','ready_to_post',
]);

const IMPORT_FIELDS='id,source_file_name,period_from,period_to,status,processing_scope,client_name_snapshot,client_reference,uploaded_at';

export async function loadAttendanceManualResolutionQueue(limit=1200){
  const dayQuery=await supabase.from('v_hr_attendance_processing_days')
    .select('*')
    .eq('day_status','needs_review')
    .in('processing_status',ATTENDANCE_MANUAL_RESOLUTION_ACTIVE_STATUSES)
    .order('work_date',{ascending:false})
    .limit(Math.max(1,Number(limit)||1));
  if(dayQuery.error)throw dayQuery.error;
  const rows=dayQuery.data||[];
  const ids=[...new Set(rows.map((row)=>row.import_id).filter(Boolean))];
  if(!ids.length)return {rows,imports:[]};
  const importQuery=await supabase.from('hr_attendance_imports')
    .select(IMPORT_FIELDS)
    .in('id',ids)
    .order('uploaded_at',{ascending:false});
  if(importQuery.error)throw importQuery.error;
  return {rows,imports:importQuery.data||[]};
}

export async function loadAttendanceDayPunches(day){
  if(!day?.import_id||!day?.work_date)return [];
  let query=supabase.from('hr_attendance_punches')
    .select('id,punch_local,source_sheet,source_row,match_method')
    .eq('import_id',day.import_id)
    .eq('punch_date',day.work_date)
    .order('punch_local');
  query=day.employee_id?query.eq('employee_id',day.employee_id):query.eq('external_person_id',day.external_person_id);
  const result=await query;
  if(result.error)throw result.error;
  return result.data||[];
}

export async function resolveAttendanceDayManually({attendanceDayId,checkIn=null,checkOut=null,note=null}){
  const result=await supabase.rpc('hr_resolve_attendance_day_manual',{
    p_attendance_day_id:attendanceDayId,
    p_check_in:checkIn,
    p_check_out:checkOut,
    p_note:note,
  });
  if(result.error)throw result.error;
  return result.data||null;
}
