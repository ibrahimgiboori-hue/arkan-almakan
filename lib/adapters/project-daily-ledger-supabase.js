import { supabase } from '@/lib/supabase';

export async function loadProjectDailyLedger({projectId,date}){
  const query=await supabase.rpc('fn_project_daily_ledger',{
    p_project_id:projectId,
    p_date:date,
  });
  if(query.error)throw query.error;
  return query.data||{};
}

export const projectDailyLedgerSupabaseRepository=Object.freeze({
  load:loadProjectDailyLedger,
});
