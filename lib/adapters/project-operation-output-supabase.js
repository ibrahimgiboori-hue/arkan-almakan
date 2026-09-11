import { supabase } from '@/lib/supabase';

export async function loadProjectOutputDay({projectId,date,contractorId}){
  const [itemsQ,dayQ,linksQ]=await Promise.all([
    supabase.from('project_items').select('id,description_ar,unit,sort_order').eq('project_id',projectId).eq('kind','item').order('sort_order'),
    supabase.from('timesheet_days').select('id').eq('project_id',projectId).eq('work_date',date).maybeSingle(),
    supabase.from('v_item_assignments').select('project_item_id,contractor_id,start_date,end_date,is_active').eq('project_id',projectId).eq('contractor_id',contractorId),
  ]);
  if(itemsQ.error)throw itemsQ.error;
  if(dayQ.error)throw dayQ.error;
  if(linksQ.error)throw linksQ.error;

  let rows=[];
  if(dayQ.data?.id){
    const rowsQ=await supabase.from('day_items')
      .select('id,project_item_id,contractor_id,group_output,unit,notes')
      .eq('day_id',dayQ.data.id)
      .eq('contractor_id',contractorId);
    if(rowsQ.error)throw rowsQ.error;
    rows=rowsQ.data||[];
  }

  return {
    items:itemsQ.data||[],
    links:linksQ.data||[],
    rows,
  };
}

export const projectOperationOutputSupabaseRepository=Object.freeze({
  loadDay:loadProjectOutputDay,
});
