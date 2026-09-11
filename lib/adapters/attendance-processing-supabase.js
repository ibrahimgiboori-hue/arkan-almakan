import { supabase } from '@/lib/supabase';

export async function loadAttendanceJustificationSubmitters(justificationIds=[]){
  const ids=[...new Set((justificationIds||[]).filter(Boolean))];
  if(!ids.length)return {};
  const [justificationQuery,userQuery]=await Promise.all([
    supabase.from('hr_attendance_justifications').select('id,submitted_by,submitted_at').in('id',ids),
    supabase.rpc('fn_workspace_user_directory'),
  ]);
  if(justificationQuery.error)throw justificationQuery.error;
  if(userQuery.error)throw userQuery.error;
  const users=new Map((userQuery.data||[]).map((user)=>[user.user_id,user.display_name]));
  const result={};
  for(const item of justificationQuery.data||[]){
    result[item.id]={
      name:users.get(item.submitted_by)||(item.submitted_by?'مستخدم النظام':''),
      submittedAt:item.submitted_at||null,
    };
  }
  return result;
}
