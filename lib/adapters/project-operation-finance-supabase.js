import { supabase } from '@/lib/supabase';

export async function loadProjectFinanceDay({projectId,date,contractorId}){
  const [advancesQ,paymentsQ]=await Promise.all([
    supabase.from('contractor_advances')
      .select('id,amount,remaining,notes')
      .eq('project_id',projectId)
      .eq('contractor_id',contractorId)
      .eq('advance_date',date)
      .order('created_at'),
    supabase.from('contractor_payments')
      .select('id,amount,kind,source,reference,notes')
      .eq('project_id',projectId)
      .eq('contractor_id',contractorId)
      .eq('payment_date',date)
      .order('created_at'),
  ]);
  const error=[advancesQ,paymentsQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {advances:advancesQ.data||[],payments:paymentsQ.data||[]};
}

export const projectOperationFinanceSupabaseRepository=Object.freeze({
  loadDay:loadProjectFinanceDay,
});
