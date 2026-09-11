import { supabase } from '@/lib/supabase';

export async function loadAttendanceReportReadModel(importId){
  if(!importId)return {days:[],punches:[]};
  const [dayQ,punchQ]=await Promise.all([
    supabase.from('v_hr_attendance_processing_days')
      .select('*')
      .eq('import_id',importId)
      .order('subject_no')
      .order('subject_name')
      .order('work_date'),
    supabase.from('hr_attendance_punches')
      .select('employee_id,external_person_id,external_employee_no,external_employee_name,punch_local,punch_date')
      .eq('import_id',importId)
      .order('punch_local'),
  ]);
  if(dayQ.error)throw dayQ.error;
  if(punchQ.error)throw punchQ.error;
  return {days:dayQ.data||[],punches:punchQ.data||[]};
}
