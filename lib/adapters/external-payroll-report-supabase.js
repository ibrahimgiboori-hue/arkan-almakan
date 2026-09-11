'use client';

import { supabase } from '@/lib/supabase';

function assertResult(result,label){
  if(result?.error)throw new Error(`${label}: ${result.error.message||String(result.error)}`);
  return result?.data;
}

export async function findExternalPayrollRunByImport(importId){
  if(!importId)return null;
  const result=await supabase.from('hr_external_payroll_batches')
    .select('id,status,attendance_import_id,updated_at')
    .eq('attendance_import_id',importId)
    .order('updated_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  return assertResult(result,'تعذر تحديد مسير الرواتب الحالي')||null;
}

export async function loadExternalPayrollRunSource(batchId){
  if(!batchId)throw new Error('دفعة الرواتب غير محددة.');

  const batch=assertResult(
    await supabase.from('hr_external_payroll_batches').select('*').eq('id',batchId).single(),
    'تعذر تحميل دفعة الرواتب',
  );

  const [importResult,linesResult,profilesResult,daysResult]=await Promise.all([
    supabase.from('hr_attendance_imports')
      .select('id,client_name_snapshot,period_from,period_to,status,source_file_name')
      .eq('id',batch.attendance_import_id)
      .single(),
    supabase.from('hr_external_payroll_lines')
      .select('*')
      .eq('payroll_batch_id',batch.id),
    supabase.from('hr_client_external_employee_profiles')
      .select('source_employee_key,source_employee_no,source_employee_name,display_employee_no,display_name')
      .eq('client_key',batch.client_key),
    supabase.from('v_hr_attendance_processing_days')
      .select('external_person_id,day_status')
      .eq('import_id',batch.attendance_import_id),
  ]);

  return Object.freeze({
    batch,
    attendanceImport:assertResult(importResult,'تعذر تحميل فترة الحضور'),
    lines:assertResult(linesResult,'تعذر تحميل أسطر الرواتب')||[],
    profiles:assertResult(profilesResult,'تعذر تحميل بيانات الموظفين')||[],
    days:assertResult(daysResult,'تعذر تحميل ملخص الحضور')||[],
  });
}

export const externalPayrollReportSupabaseRepository=Object.freeze({
  findRunByImport:findExternalPayrollRunByImport,
  loadRunSource:loadExternalPayrollRunSource,
});
