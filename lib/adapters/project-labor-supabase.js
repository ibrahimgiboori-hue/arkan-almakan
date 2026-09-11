import { supabase } from '@/lib/supabase';

export async function loadProjectLaborWorkspaceSource({projectId,date}){
  const linksQ=await supabase.from('project_contractors')
    .select('contractor_id,basis,worker_daily,tech_daily,start_date,end_date,is_active')
    .eq('project_id',projectId)
    .eq('is_active',true)
    .lte('start_date',date)
    .or(`end_date.is.null,end_date.gte.${date}`);
  if(linksQ.error)throw linksQ.error;

  const contractorIds=[...new Set((linksQ.data||[]).map((row)=>row.contractor_id).filter(Boolean))];
  if(!contractorIds.length)return {links:linksQ.data||[],contractors:[],laborers:[],assignments:[]};

  const [contractorsQ,laborersQ]=await Promise.all([
    supabase.from('contractors')
      .select('id,name_ar,operation_alias,contractor_no,worker_daily,tech_daily,is_active')
      .in('id',contractorIds)
      .eq('is_active',true)
      .order('name_ar'),
    supabase.from('laborers')
      .select('id,contractor_id,full_name,labor_class,trade,pay_basis,daily_rate,monthly_salary,salary_days,piece_rate,piece_unit,is_active')
      .in('contractor_id',contractorIds)
      .eq('is_active',true)
      .order('full_name'),
  ]);
  if(contractorsQ.error)throw contractorsQ.error;
  if(laborersQ.error)throw laborersQ.error;

  const laborerIds=(laborersQ.data||[]).map((row)=>row.id);
  const assignmentsQ=laborerIds.length
    ? await supabase.from('labor_project_assignments')
      .select('id,laborer_id,project_id,contractor_id,labor_class,trade,pay_basis,daily_rate,valid_from,valid_to,is_active,created_at')
      .in('laborer_id',laborerIds)
    : {data:[],error:null};
  if(assignmentsQ.error)throw assignmentsQ.error;

  return {
    links:linksQ.data||[],
    contractors:contractorsQ.data||[],
    laborers:laborersQ.data||[],
    assignments:assignmentsQ.data||[],
  };
}

export async function quickAddProjectWorkers(payload){
  const query=await supabase.rpc('fn_quick_add_workers',payload);
  if(query.error)throw query.error;
  return Array.isArray(query.data)?query.data:[];
}

export async function loadProjectLaborer(laborerId){
  const query=await supabase.from('laborers')
    .select('id,full_name,labor_class,trade,pay_basis,daily_rate')
    .eq('id',laborerId)
    .maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

export async function moveProjectLaborer(payload){
  const query=await supabase.rpc('fn_move_laborer',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function assignExistingProjectLaborer(payload){
  const query=await supabase.rpc('fn_assign_existing_laborer',payload);
  if(query.error)throw query.error;
  return query.data;
}

export async function updateProjectLaborAssignment(payload){
  const query=await supabase.rpc('fn_update_labor_assignment',payload);
  if(query.error)throw query.error;
  return query.data;
}

export const projectLaborSupabaseRepository=Object.freeze({
  loadWorkspaceSource:loadProjectLaborWorkspaceSource,
  quickAddWorkers:quickAddProjectWorkers,
  loadLaborer:loadProjectLaborer,
  moveLaborer:moveProjectLaborer,
  assignExistingLaborer:assignExistingProjectLaborer,
  updateAssignment:updateProjectLaborAssignment,
});
