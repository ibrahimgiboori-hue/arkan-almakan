import { supabase } from '@/lib/supabase';

/** Every movement of the project between two dates, in one database call. */
export async function loadProjectLedgerRange({projectId,from,to}){
  const query=await supabase.rpc('fn_project_ledger_range',{
    p_project_id:projectId,
    p_from:from,
    p_to:to,
  });
  if(query.error)throw query.error;
  return query.data||{};
}

export const projectDailyLedgerSupabaseRepository=Object.freeze({
  loadRange:loadProjectLedgerRange,
});
