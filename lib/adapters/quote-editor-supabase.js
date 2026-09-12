import { supabase } from '@/lib/supabase';
import { QUOTE_PARTY_FIELDS } from '@/lib/quote-editor.mjs';

function fail(error,fallback){
  if(error)throw new Error(error.message || fallback);
}

export const quoteEditorSupabaseRepository=Object.freeze({
  async loadQuote(quoteId){
    const {data,error}=await supabase.from('quotations').select('*').eq('id',quoteId).maybeSingle();
    fail(error,'تعذر تحميل عرض السعر.');
    return data || null;
  },

  async loadLines(quoteId){
    const {data,error}=await supabase.from('quotation_lines').select('*')
      .eq('quotation_id',quoteId).order('sort_order');
    fail(error,'تعذر تحميل بنود عرض السعر.');
    return data || [];
  },

  async loadPayments(quoteId){
    const {data,error}=await supabase.from('quotation_payments').select('*')
      .eq('quotation_id',quoteId).order('sort_order');
    fail(error,'تعذر تحميل دفعات عرض السعر.');
    return data || [];
  },

  async loadWorkItems(){
    const {data,error}=await supabase.from('work_items').select('*')
      .order('use_count',{ascending:false}).limit(300);
    fail(error,'تعذر تحميل دليل البنود.');
    return data || [];
  },

  async loadPresets(){
    const {data,error}=await supabase.from('quote_presets').select('*').order('sort_order');
    fail(error,'تعذر تحميل قوالب العرض.');
    return data || [];
  },

  async updateQuote(quoteId,fields){
    const {data,error}=await supabase.from('quotations').update(fields).eq('id',quoteId).select('*');
    fail(error,'تعذر حفظ عرض السعر.');
    return data || [];
  },

  async insertLine(record){
    const {data,error}=await supabase.from('quotation_lines').insert(record).select('*').single();
    fail(error,'تعذر إضافة بند العرض.');
    return data;
  },

  async insertLineAfter({quoteId,afterOrder,kind}){
    const {error}=await supabase.rpc('quote_line_insert_after',{
      p_quotation:quoteId,p_after_order:afterOrder,p_kind:kind,
    });
    fail(error,'تعذر إدراج البند.');
    return true;
  },

  async updateLine(quoteId,lineId,fields){
    const {data,error}=await supabase.from('quotation_lines').update(fields)
      .eq('quotation_id',quoteId).eq('id',lineId).select('*');
    fail(error,'تعذر حفظ بند العرض.');
    return data || [];
  },

  async setLineSort(quoteId,lineId,sortOrder){
    const {data,error}=await supabase.from('quotation_lines').update({sort_order:sortOrder})
      .eq('quotation_id',quoteId).eq('id',lineId).select('id,sort_order');
    fail(error,'تعذر تغيير ترتيب بند العرض.');
    return data || [];
  },

  async deleteLine(quoteId,lineId){
    const {data,error}=await supabase.from('quotation_lines').delete()
      .eq('quotation_id',quoteId).eq('id',lineId).select('id');
    fail(error,'تعذر حذف بند العرض.');
    return data || [];
  },

  async loadWorkItem(workItemId){
    const {data,error}=await supabase.from('work_items').select('*').eq('id',workItemId).maybeSingle();
    fail(error,'تعذر تحميل بند الدليل.');
    return data || null;
  },

  async setWorkItemUseCount(workItemId,useCount){
    const {data,error}=await supabase.from('work_items').update({use_count:useCount})
      .eq('id',workItemId).select('id,use_count');
    fail(error,'تعذر تحديث استخدام بند الدليل.');
    return data || [];
  },

  async insertWorkItem(record){
    const {data,error}=await supabase.from('work_items').insert(record).select('*').single();
    fail(error,'تعذر إضافة البند إلى الدليل.');
    return data;
  },

  async insertPayment(record){
    const {data,error}=await supabase.from('quotation_payments').insert(record).select('*').single();
    fail(error,'تعذر إضافة الدفعة.');
    return data;
  },

  async updatePayment(quoteId,paymentId,fields){
    const {data,error}=await supabase.from('quotation_payments').update(fields)
      .eq('quotation_id',quoteId).eq('id',paymentId).select('*');
    fail(error,'تعذر حفظ الدفعة.');
    return data || [];
  },

  async deletePayment(quoteId,paymentId){
    const {data,error}=await supabase.from('quotation_payments').delete()
      .eq('quotation_id',quoteId).eq('id',paymentId).select('id');
    fail(error,'تعذر حذف الدفعة.');
    return data || [];
  },

  async loadParty(quoteId){
    const fields=QUOTE_PARTY_FIELDS.join(',');
    const {data,error}=await supabase.from('quotations').select(fields).eq('id',quoteId).maybeSingle();
    fail(error,'تعذر تحميل بيانات أطراف العرض.');
    return data || null;
  },

  async loadActiveEmployees(){
    const {data,error}=await supabase.from('employees')
      .select('id,full_name_ar,job_title,board_role,person_kind,status')
      .eq('status','active').order('full_name_ar');
    fail(error,'تعذر تحميل الموظفين النشطين.');
    return data || [];
  },
});
