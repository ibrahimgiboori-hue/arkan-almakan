import { supabase } from '@/lib/supabase';

export async function loadProjectOperationLinks({projectId,date}){
  const query=await supabase.from('project_contractors')
    .select('contractor_id,basis,start_date,end_date,is_active')
    .eq('project_id',projectId)
    .eq('is_active',true)
    .lte('start_date',date)
    .or(`end_date.is.null,end_date.gte.${date}`);
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadProjectOperationAssignments({projectId,date}){
  const query=await supabase.from('labor_project_assignments')
    .select('laborer_id,contractor_id,valid_from,valid_to')
    .eq('project_id',projectId)
    .lte('valid_from',date)
    .or(`valid_to.is.null,valid_to.gte.${date}`);
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadProjectOperationContractors(ids=[]){
  const contractorIds=[...new Set((ids||[]).filter(Boolean))];
  if(!contractorIds.length)return [];
  const query=await supabase.from('contractors')
    .select('id,name_ar,operation_alias,contractor_no')
    .in('id',contractorIds);
  if(query.error)throw query.error;
  return query.data||[];
}

export const projectOperationContextSupabaseRepository=Object.freeze({
  loadLinks:loadProjectOperationLinks,
  loadAssignments:loadProjectOperationAssignments,
  loadContractors:loadProjectOperationContractors,
});
