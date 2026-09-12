import { supabase } from '@/lib/supabase';

function fail(error,fallback){
  if(error)throw new Error(error.message || fallback);
}

export const projectQuotesSupabaseRepository=Object.freeze({
  async loadQuotes(projectId){
    const {data,error}=await supabase.from('quotations').select('*')
      .eq('project_id',projectId).order('created_at',{ascending:false});
    fail(error,'تعذر تحميل عروض المشروع.');
    return data || [];
  },

  async loadTotals(quoteIds){
    const ids=(quoteIds || []).filter(Boolean);
    if(!ids.length)return [];
    const {data,error}=await supabase.from('v_quote_totals').select('*').in('id',ids);
    fail(error,'تعذر تحميل إجماليات عروض المشروع.');
    return data || [];
  },

  async loadCapabilities(){
    const {data,error}=await supabase.from('v_my_capabilities')
      .select('capability_key,scope_type,scope_key,source_key');
    fail(error,'تعذر تحميل صلاحيات عروض الأسعار.');
    return data || [];
  },

  async isPrimaryUser(){
    const {data,error}=await supabase.rpc('fn_is_primary_user');
    fail(error,'تعذر التحقق من المستخدم الرئيسي.');
    return data === true;
  },

  async loadApprovalState(quoteId){
    const {data,error}=await supabase.rpc('fn_quotation_approval_state',{p_quote_id:quoteId});
    fail(error,'تعذر تحميل حالة مراجعة عرض السعر.');
    return data || null;
  },

  async nextDocumentNumber({docType,prefix}){
    const {data,error}=await supabase.rpc('next_document_number',{p_doc_type:docType,p_prefix:prefix});
    fail(error,'تعذر إصدار رقم العرض.');
    if(!data)throw new Error('لم يعد الخادم برقم عرض صالح.');
    return data;
  },

  async loadSettings(){
    const {data,error}=await supabase.from('app_settings')
      .select('quote_terms_default,vat_rate').eq('id',1).maybeSingle();
    fail(error,'تعذر تحميل إعدادات عروض الأسعار.');
    return data || {};
  },

  async insertQuote(record){
    const {data,error}=await supabase.from('quotations').insert(record)
      .select('id,project_id,quote_no,doc_kind,language').single();
    fail(error,'تعذر إنشاء عرض السعر.');
    return data;
  },
});
