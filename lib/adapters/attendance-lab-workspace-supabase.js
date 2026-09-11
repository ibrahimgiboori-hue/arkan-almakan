import { supabase } from '@/lib/supabase';

const IMPORT_LIST_FIELDS='id,source_file_name,period_from,period_to,status,processing_scope,client_name_snapshot,client_reference,rows_received,matched_punches,unmatched_punches,review_revision,uploaded_at';

export async function listAttendanceLabImports(limit=30){
  const query=await supabase.from('hr_attendance_imports').select(IMPORT_LIST_FIELDS).order('uploaded_at',{ascending:false}).limit(Math.max(1,Number(limit)||30));
  if(query.error)throw query.error;
  return query.data||[];
}

export async function listAttendanceEmployees(){
  const query=await supabase.from('employees').select('id,employee_no,full_name_ar,status').order('employee_no');
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadAttendanceLabImport(importId){
  const [importQ,daysQ,eventsQ,peopleQ]=await Promise.all([
    supabase.from('hr_attendance_imports').select('*').eq('id',importId).single(),
    supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id',importId).order('work_date').order('subject_no'),
    supabase.from('hr_attendance_processing_events').select('*').eq('import_id',importId).order('created_at'),
    supabase.from('hr_attendance_external_people').select('*').eq('import_id',importId).order('external_employee_no').order('external_employee_name'),
  ]);
  if(importQ.error)throw importQ.error;
  return {activeImport:importQ.data,days:daysQ.error?[]:(daysQ.data||[]),events:eventsQ.error?[]:(eventsQ.data||[]),externalPeople:peopleQ.error?[]:(peopleQ.data||[])};
}

export async function importAttendancePunches(payload){
  const query=await supabase.rpc('hr_import_attendance_punches',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function loadAttendanceSchedule({importId,processingScope,subjectId}){
  const external=processingScope==='external';
  const scheduleTable=external?'hr_attendance_external_schedules':'hr_employee_work_schedules';
  let query=supabase.from(scheduleTable).select('*').eq(external?'external_person_id':'employee_id',subjectId).eq('is_active',true).order('valid_from',{ascending:false}).limit(1);
  if(external)query=query.eq('import_id',importId);
  const scheduleQ=await query.maybeSingle();
  if(scheduleQ.error)throw scheduleQ.error;
  if(!scheduleQ.data)return null;
  const dayTable=external?'hr_attendance_external_schedule_days':'hr_employee_work_schedule_days';
  const daysQ=await supabase.from(dayTable).select('*').eq('schedule_id',scheduleQ.data.id).order('weekday');
  if(daysQ.error)throw daysQ.error;
  return {schedule:scheduleQ.data,days:daysQ.data||[]};
}

export async function saveAttendanceSchedule({processingScope,scheduleId,importId,subjectId,name,validFrom,validTo,days}){
  const external=processingScope==='external';
  const query=external
    ? await supabase.rpc('hr_save_external_attendance_schedule',{p_schedule_id:scheduleId,p_import_id:importId,p_external_person_id:subjectId,p_name:name,p_valid_from:validFrom,p_valid_to:validTo||null,p_days:days,p_notes:null})
    : await supabase.rpc('hr_save_employee_work_schedule',{p_schedule_id:scheduleId,p_employee_id:subjectId,p_name:name,p_valid_from:validFrom,p_valid_to:validTo||null,p_days:days,p_notes:null});
  if(query.error)throw query.error;
  return query.data;
}

const STAGE_RPC=Object.freeze({
  analyze:'hr_analyze_attendance_import',
  review:'hr_start_attendance_review',
  recalculate:'hr_recalculate_attendance_import',
  ready:'hr_mark_attendance_ready',
  post:'hr_post_attendance_import',
});

export async function runAttendanceLabStage(action,importId){
  const rpc=STAGE_RPC[action];
  if(!rpc)throw new Error(`إجراء مرحلة غير معروف: ${action}`);
  const query=await supabase.rpc(rpc,{p_import_id:importId});
  if(query.error)throw query.error;
  return query.data;
}

export async function loadAttendanceLabExportData(importId){
  const [punchesQ,eventsQ]=await Promise.all([
    supabase.from('hr_attendance_punches').select('external_employee_no,external_employee_name,punch_local,source_sheet,source_row,match_method').eq('import_id',importId).order('punch_local'),
    supabase.from('hr_attendance_processing_events').select('stage,action_key,summary,created_at').eq('import_id',importId).order('created_at'),
  ]);
  if(punchesQ.error)throw punchesQ.error;
  if(eventsQ.error)throw eventsQ.error;
  return {punches:punchesQ.data||[],events:eventsQ.data||[]};
}

export const attendanceLabWorkspaceSupabaseRepository=Object.freeze({
  listImports:listAttendanceLabImports,
  listEmployees:listAttendanceEmployees,
  loadImport:loadAttendanceLabImport,
  importPunches:importAttendancePunches,
  loadSchedule:loadAttendanceSchedule,
  saveSchedule:saveAttendanceSchedule,
  runStage:runAttendanceLabStage,
  loadExportData:loadAttendanceLabExportData,
});
