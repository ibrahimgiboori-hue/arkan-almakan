import { supabase } from '@/lib/supabase';

export async function submitAttendanceJustification({attendanceDayId,type,text=null,reference=null,approvedOn=null}){
  const query=await supabase.rpc('hr_submit_attendance_justification_v2',{
    p_attendance_day_id:attendanceDayId,
    p_justification_type:type,
    p_justification_text:text,
    p_paper_reference:reference,
    p_paper_approved_on:approvedOn,
  });
  if(query.error)throw query.error;
  return query.data;
}

export async function decideAttendanceJustification({justificationId,decision,note=null,reference=null,approvedOn=null}){
  const query=await supabase.rpc('hr_decide_attendance_justification',{
    p_justification_id:justificationId,
    p_decision:decision,
    p_decision_note:note,
    p_paper_reference:reference,
    p_paper_approved_on:approvedOn,
  });
  if(query.error)throw query.error;
  return query.data??true;
}
