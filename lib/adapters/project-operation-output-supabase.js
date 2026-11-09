import { supabase } from '@/lib/supabase';
import { readAllPages } from '@/lib/adapters/supabase-paging';

/** Project output over a period (every contractor, or one), the BOQ items and every item assignment. */
export async function loadProjectOutputRange({projectId,from,to,contractorId=''}){
  const [itemsQ,days,linksQ]=await Promise.all([
    supabase.from('project_items').select('id,description_ar,unit,sort_order').eq('project_id',projectId).eq('kind','item').order('sort_order'),
    readAllPages(()=>supabase.from('timesheet_days').select('id,work_date').eq('project_id',projectId).gte('work_date',from).lte('work_date',to).order('work_date')),
    supabase.from('v_item_assignments').select('project_item_id,contractor_id,start_date,end_date,is_active').eq('project_id',projectId),
  ]);
  if(itemsQ.error)throw itemsQ.error;
  if(linksQ.error)throw linksQ.error;

  const dateByDay=new Map(days.map((day)=>[day.id,day.work_date]));
  const rows=days.length
    ? (await readAllPages(()=>{
      let query=supabase.from('day_items')
        .select('id,day_id,project_item_id,contractor_id,group_output,unit,notes')
        .in('day_id',days.map((day)=>day.id));
      if(contractorId)query=query.eq('contractor_id',contractorId);
      return query.order('id');
    })).map((row)=>({...row,work_date:dateByDay.get(row.day_id)||''}))
    : [];

  return {
    items:itemsQ.data||[],
    links:linksQ.data||[],
    rows,
  };
}

export const projectOperationOutputSupabaseRepository=Object.freeze({
  loadRange:loadProjectOutputRange,
});
