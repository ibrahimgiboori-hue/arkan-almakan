import { supabase } from '@/lib/supabase';

export async function loadAttendanceCalibrationSnapshot({importId,processingScope,employeeIds=[]}){
  if(!importId)return {proposals:[],schedules:[],scheduleDays:[]};

  const proposalQ=await supabase.from('hr_attendance_calibration_proposals')
    .select('*')
    .eq('import_id',importId)
    .order('weekday');
  if(proposalQ.error)throw proposalQ.error;

  const external=processingScope==='external';
  let scheduleQ;
  if(external){
    scheduleQ=await supabase.from('hr_attendance_external_schedules')
      .select('id,external_person_id,valid_from,updated_at')
      .eq('import_id',importId)
      .eq('is_active',true)
      .order('valid_from',{ascending:false})
      .order('updated_at',{ascending:false});
  }else{
    const ids=employeeIds.filter(Boolean);
    if(!ids.length)return {proposals:proposalQ.data||[],schedules:[],scheduleDays:[]};
    scheduleQ=await supabase.from('hr_employee_work_schedules')
      .select('id,employee_id,valid_from,updated_at')
      .in('employee_id',ids)
      .eq('is_active',true)
      .order('valid_from',{ascending:false})
      .order('updated_at',{ascending:false});
  }
  if(scheduleQ.error)throw scheduleQ.error;

  const schedules=scheduleQ.data||[];
  const scheduleIds=schedules.map((item)=>item.id).filter(Boolean);
  if(!scheduleIds.length)return {proposals:proposalQ.data||[],schedules,scheduleDays:[]};

  const dayTable=external?'hr_attendance_external_schedule_days':'hr_employee_work_schedule_days';
  const dayQ=await supabase.from(dayTable)
    .select('schedule_id,weekday,is_workday,start_time,end_time')
    .in('schedule_id',scheduleIds)
    .order('weekday');
  if(dayQ.error)throw dayQ.error;

  return {
    proposals:proposalQ.data||[],
    schedules,
    scheduleDays:dayQ.data||[],
  };
}

export async function calibrateAttendanceImport(importId,{snapMinutes=60}={}){
  const query=await supabase.rpc('hr_calibrate_attendance_import',{p_import_id:importId,p_snap_minutes:snapMinutes});
  if(query.error)throw query.error;
  return query.data;
}

export async function applyAttendanceCalibration(importId,{minConfidence='medium'}={}){
  const query=await supabase.rpc('hr_apply_attendance_calibration',{p_import_id:importId,p_min_confidence:minConfidence});
  if(query.error)throw query.error;
  return query.data;
}

export async function analyzeAttendanceImport(importId){
  const query=await supabase.rpc('hr_analyze_attendance_import',{p_import_id:importId});
  if(query.error)throw query.error;
  return query.data;
}

export const attendanceLabSupabaseAdapter=Object.freeze({
  loadCalibrationSnapshot:loadAttendanceCalibrationSnapshot,
  calibrate:calibrateAttendanceImport,
  applyCalibration:applyAttendanceCalibration,
  analyze:analyzeAttendanceImport,
});
