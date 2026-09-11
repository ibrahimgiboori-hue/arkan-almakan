import { supabase } from '@/lib/supabase';

export async function loadProjectAttendanceDayContextSource({projectId,date}){
  const [dayQ,assignmentsQ,projectContractorsQ]=await Promise.all([
    supabase.from('timesheet_days')
      .select('id')
      .eq('project_id',projectId)
      .eq('work_date',date)
      .maybeSingle(),
    supabase.from('labor_project_assignments')
      .select('id,laborer_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to')
      .eq('project_id',projectId)
      .lte('valid_from',date)
      .or(`valid_to.is.null,valid_to.gte.${date}`),
    supabase.from('project_contractors')
      .select('contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active')
      .eq('project_id',projectId)
      .eq('is_active',true)
      .lte('start_date',date)
      .or(`end_date.is.null,end_date.gte.${date}`),
  ]);
  const error=[dayQ,assignmentsQ,projectContractorsQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {
    dayId:dayQ.data?.id||null,
    assignmentRows:assignmentsQ.data||[],
    projectContractorRows:projectContractorsQ.data||[],
  };
}

export async function loadProjectAttendanceDayEntities({dayId,contractorIds=[],laborerIds=[]}){
  const [contractorsQ,laborersQ,attendanceQ]=await Promise.all([
    contractorIds.length
      ? supabase.from('contractors').select('id,name_ar,operation_alias,contractor_no').in('id',contractorIds)
      : Promise.resolve({data:[],error:null}),
    laborerIds.length
      ? supabase.from('laborers').select('id,full_name,labor_class,trade,daily_rate,is_active').in('id',laborerIds)
      : Promise.resolve({data:[],error:null}),
    dayId
      ? supabase.from('attendance')
        .select('id,laborer_id,status,rate_used,portal_last_edited_by_name,portal_last_edited_at')
        .eq('day_id',dayId)
      : Promise.resolve({data:[],error:null}),
  ]);
  const error=[contractorsQ,laborersQ,attendanceQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {
    contractors:contractorsQ.data||[],
    laborers:laborersQ.data||[],
    attendanceRows:attendanceQ.data||[],
  };
}

export async function removeProjectAttendanceEntry(attendanceId){
  const query=await supabase.rpc('fn_remove_attendance_entry',{p_attendance_id:attendanceId});
  if(query.error)throw query.error;
  return query.data===true;
}

export const projectAttendanceSupabaseRepository=Object.freeze({
  loadDayContextSource:loadProjectAttendanceDayContextSource,
  loadDayEntities:loadProjectAttendanceDayEntities,
  removeEntry:removeProjectAttendanceEntry,
});
