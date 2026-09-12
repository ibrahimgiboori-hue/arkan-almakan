import { supabase } from '@/lib/supabase';

function fail(error,fallback){
  if(error)throw new Error(error.message || fallback);
}

export const projectDocumentsSupabaseRepository=Object.freeze({
  async loadSiteDocuments(projectId){
    const {data,error}=await supabase.from('site_documents').select('*')
      .eq('project_id',projectId).order('doc_date',{ascending:false});
    fail(error,'تعذر تحميل مستندات الموقع.');
    return data || [];
  },

  async loadCentralDocuments(projectId){
    const {data,error}=await supabase.from('documents')
      .select('id,doc_number,subject,status,created_at,updated_at,template_code,internal_approval_status')
      .eq('project_id',projectId).order('created_at',{ascending:false});
    fail(error,'تعذر تحميل مستندات المشروع النظامية.');
    return data || [];
  },

  async loadMaterials(projectId){
    const {data,error}=await supabase.from('project_materials').select('*')
      .eq('project_id',projectId).order('received_at',{ascending:false});
    fail(error,'تعذر تحميل مواد المشروع.');
    return data || [];
  },

  async uploadSiteDocument(path,file){
    const {error}=await supabase.storage.from('site-docs').upload(path,file);
    fail(error,'تعذر رفع ملف المستند.');
    return path;
  },

  async removeSiteFiles(paths){
    const clean=(paths || []).filter(Boolean);
    if(!clean.length)return true;
    const {error}=await supabase.storage.from('site-docs').remove(clean);
    fail(error,'تعذر حذف ملف المستند من التخزين.');
    return true;
  },

  async insertSiteDocument(record){
    const {data,error}=await supabase.from('site_documents').insert(record).select('*').single();
    fail(error,'تعذر حفظ مستند الموقع.');
    return data;
  },

  async createSiteDocumentUrl(path){
    const {data,error}=await supabase.storage.from('site-docs').createSignedUrl(path,300);
    fail(error,'تعذر فتح ملف المستند.');
    if(!data?.signedUrl)throw new Error('لم يعد التخزين برابط صالح للملف.');
    return data.signedUrl;
  },

  async deleteSiteDocument(projectId,id){
    const {data,error}=await supabase.from('site_documents').delete()
      .eq('project_id',projectId).eq('id',id).select('id,file_path');
    fail(error,'تعذر حذف مستند الموقع.');
    return data || [];
  },

  async insertMaterial(record){
    const {data,error}=await supabase.from('project_materials').insert(record).select('*').single();
    fail(error,'تعذر تسجيل المادة.');
    return data;
  },

  async updateMaterial(projectId,id,fields){
    const {data,error}=await supabase.from('project_materials').update(fields)
      .eq('project_id',projectId).eq('id',id).select('*');
    fail(error,'تعذر تعديل المادة.');
    return data || [];
  },

  async deleteMaterial(projectId,id){
    const {data,error}=await supabase.from('project_materials').delete()
      .eq('project_id',projectId).eq('id',id).select('id');
    fail(error,'تعذر حذف المادة.');
    return data || [];
  },
});
