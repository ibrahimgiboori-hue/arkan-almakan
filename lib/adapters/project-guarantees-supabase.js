import { supabase } from '@/lib/supabase';

function fail(error,fallback){
  if(error)throw new Error(error.message || fallback);
}

export const projectGuaranteesSupabaseRepository=Object.freeze({
  async loadGuarantees(projectId){
    const {data,error}=await supabase.from('guarantees').select('*')
      .eq('project_id',projectId).order('expiry_date');
    fail(error,'تعذر تحميل الضمانات.');
    return data || [];
  },

  async loadRetentions(projectId){
    const {data,error}=await supabase.from('retentions').select('*')
      .eq('project_id',projectId).order('held_at');
    fail(error,'تعذر تحميل المحتجزات.');
    return data || [];
  },

  async insertGuarantee(record){
    const {data,error}=await supabase.from('guarantees').insert(record).select('*').single();
    fail(error,'تعذر إضافة الضمان.');
    return data;
  },
});
