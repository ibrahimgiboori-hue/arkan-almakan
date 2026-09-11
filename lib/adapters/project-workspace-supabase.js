import { supabase } from '@/lib/supabase';

export async function loadProjectWorkspaceSource(projectId){
  const session=(await supabase.auth.getSession()).data.session;
  const [projectQ,employeesQ,entitiesQ,capabilitiesQ,primaryQ,userQ]=await Promise.all([
    supabase.from('projects').select('*').eq('id',projectId).maybeSingle(),
    supabase.from('employees').select('id,full_name_ar,employee_no').order('employee_no'),
    supabase.from('entities').select('id,name_ar').order('name_ar'),
    supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
    supabase.rpc('fn_is_primary_user'),
    session?.user?.id
      ? supabase.from('app_users').select('is_system_admin').eq('id',session.user.id).maybeSingle()
      : Promise.resolve({data:null,error:null}),
  ]);
  const error=[projectQ,employeesQ,entitiesQ,capabilitiesQ,primaryQ,userQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {
    project:projectQ.data||null,
    employees:employeesQ.data||[],
    entities:entitiesQ.data||[],
    capabilities:capabilitiesQ.data||[],
    isPrimaryUser:primaryQ.data===true,
    isSystemAdmin:Boolean(userQ.data?.is_system_admin),
  };
}

export async function loadProjectWorkspaceFinancials(projectId){
  const [financialsQ,totalsQ]=await Promise.all([
    supabase.from('v_project_financials').select('*').eq('project_id',projectId).maybeSingle(),
    supabase.from('v_project_totals').select('*').eq('project_id',projectId).maybeSingle(),
  ]);
  const error=[financialsQ,totalsQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {financials:financialsQ.data||null,totals:totalsQ.data||null};
}

export async function loadProjectSetupApprovalQueue(projectId){
  const query=await supabase.rpc('fn_project_approval_queue',{p_project_id:projectId});
  if(query.error)throw query.error;
  return query.data||[];
}

export async function updateProjectWorkspace(projectId,fields){
  const query=await supabase.from('projects').update(fields).eq('id',projectId).select('*').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('لم يعد الخادم بسجل المشروع بعد الحفظ.');
  return query.data;
}

export async function submitProjectSetupApproval(projectId,note=null){
  const query=await supabase.rpc('fn_submit_project_setup_for_approval',{
    p_project_id:projectId,
    p_note:note,
  });
  if(query.error)throw query.error;
  return query.data||null;
}

export async function loadProjectSetupApprovalProof(workflowId){
  const query=await supabase.rpc('fn_approval_get',{p_workflow_id:workflowId});
  if(query.error)throw query.error;
  return query.data||null;
}

export const projectWorkspaceSupabaseRepository=Object.freeze({
  loadSource:loadProjectWorkspaceSource,
  loadFinancials:loadProjectWorkspaceFinancials,
  loadSetupQueue:loadProjectSetupApprovalQueue,
  updateProject:updateProjectWorkspace,
  submitSetupApproval:submitProjectSetupApproval,
  loadSetupApprovalProof:loadProjectSetupApprovalProof,
});
