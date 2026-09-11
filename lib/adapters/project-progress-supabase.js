import { supabase } from '@/lib/supabase';

export async function loadProjectProgressRows(projectId){
  const query=await supabase.from('v_item_progress').select('*').eq('project_id',projectId);
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadProjectProgressEntries(projectItemIds=[]){
  const ids=[...new Set((projectItemIds||[]).filter(Boolean))];
  if(!ids.length)return [];
  const query=await supabase.from('progress_entries').select('*')
    .in('project_item_id',ids)
    .order('entry_date',{ascending:false});
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadProjectProgressClaims(claimIds=[]){
  const ids=[...new Set((claimIds||[]).filter(Boolean))];
  if(!ids.length)return [];
  const query=await supabase.from('progress_claims').select('id,claim_no,status').in('id',ids);
  if(query.error)throw query.error;
  return query.data||[];
}

export async function loadProjectProgressEntry(entryId){
  const query=await supabase.from('progress_entries').select('*').eq('id',entryId).maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

export async function loadProjectProgressClaim(claimId){
  if(!claimId)return null;
  const query=await supabase.from('progress_claims').select('id,claim_no,status').eq('id',claimId).maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

export async function createProjectProgressEntry(payload){
  const query=await supabase.from('progress_entries').insert(payload).select('*').single();
  if(query.error)throw query.error;
  return query.data;
}

export async function updateProjectProgressEntry(entryId,payload){
  const query=await supabase.from('progress_entries').update(payload).eq('id',entryId).select('*').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('لم يتغير تسجيل الإنجاز؛ ربما عُدّل أو حُذف من جهة أخرى.');
  return query.data;
}

export async function deleteProjectProgressEntry(entryId){
  const query=await supabase.from('progress_entries').delete().eq('id',entryId).select('id').maybeSingle();
  if(query.error)throw query.error;
  if(!query.data)throw new Error('لم يُحذف تسجيل الإنجاز؛ ربما عُدّل أو حُذف من جهة أخرى.');
  return true;
}

export const projectProgressSupabaseRepository=Object.freeze({
  loadProgressRows:loadProjectProgressRows,
  loadEntries:loadProjectProgressEntries,
  loadClaims:loadProjectProgressClaims,
  loadEntry:loadProjectProgressEntry,
  loadClaim:loadProjectProgressClaim,
  createEntry:createProjectProgressEntry,
  updateEntry:updateProjectProgressEntry,
  deleteEntry:deleteProjectProgressEntry,
});
