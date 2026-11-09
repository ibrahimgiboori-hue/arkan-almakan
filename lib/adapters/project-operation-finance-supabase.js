import { supabase } from '@/lib/supabase';
import { readAllPages } from '@/lib/adapters/supabase-paging';

/** Project advances and payments over a period (every contractor, or one). */
export async function loadProjectFinanceRange({projectId,from,to,contractorId=''}){
  const scoped=(query)=>(contractorId?query.eq('contractor_id',contractorId):query);
  const [advances,payments]=await Promise.all([
    readAllPages(()=>scoped(supabase.from('contractor_advances')
      .select('id,contractor_id,advance_date,amount,remaining,notes,created_at')
      .eq('project_id',projectId)
      .gte('advance_date',from)
      .lte('advance_date',to))
      .order('advance_date').order('created_at').order('id')),
    readAllPages(()=>scoped(supabase.from('contractor_payments')
      .select('id,contractor_id,payment_date,amount,kind,source,reference,notes,created_at')
      .eq('project_id',projectId)
      .gte('payment_date',from)
      .lte('payment_date',to))
      .order('payment_date').order('created_at').order('id')),
  ]);
  return {advances,payments};
}

export const projectOperationFinanceSupabaseRepository=Object.freeze({
  loadRange:loadProjectFinanceRange,
});
