import { projectDocumentsSupabaseRepository } from '@/lib/adapters/project-documents-supabase';
import { todayIsoInRiyadh } from '@/lib/format';
import {
  buildMaterialRecord,
  buildProjectDocumentsWorkspace,
  buildSiteDocumentRecord,
  normalizeMaterialPatch,
  projectDocumentsMode,
  siteDocumentStoragePath,
} from '@/lib/project-documents.mjs';

function requireSingle(rows,message){
  if(!Array.isArray(rows) || rows.length !== 1) throw new Error(message);
  return rows[0];
}

export function createProjectDocumentsService(repository=projectDocumentsSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId,mode='all'}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const {showDocs,showMaterials}=projectDocumentsMode(mode);
      const [siteDocs,centralDocs,materials]=await Promise.all([
        showDocs ? repository.loadSiteDocuments(projectId) : Promise.resolve([]),
        showDocs ? repository.loadCentralDocuments(projectId) : Promise.resolve([]),
        showMaterials ? repository.loadMaterials(projectId) : Promise.resolve([]),
      ]);
      return buildProjectDocumentsWorkspace({siteDocs,centralDocs,materials});
    },

    async addSiteDocument({projectId,draft,file}){
      let path=null;
      try{
        if(file){
          path=siteDocumentStoragePath({projectId,fileName:file.name});
          await repository.uploadSiteDocument(path,file);
        }
        const saved=await repository.insertSiteDocument(buildSiteDocumentRecord({projectId,draft,filePath:path}));
        if(!saved?.id)throw new Error('لم يعد الخادم بإثبات حفظ مستند الموقع.');
        return saved;
      }catch(error){
        if(path){try{await repository.removeSiteFiles([path]);}catch{}}
        throw error;
      }
    },

    async openSiteDocument(path){
      if(!path)throw new Error('لا يوجد ملف مرتبط بهذا المستند.');
      return repository.createSiteDocumentUrl(path);
    },

    async deleteSiteDocument({projectId,id}){
      if(!projectId || !id)throw new Error('المستند أو المشروع غير محدد.');
      const deleted=requireSingle(
        await repository.deleteSiteDocument(projectId,id),
        'لم يُحذف المستند؛ ربما تغيّر أو لا يتبع هذا المشروع.'
      );
      let cleanupWarning='';
      if(deleted.file_path){
        try{await repository.removeSiteFiles([deleted.file_path]);}
        catch(error){cleanupWarning='حُذف سجل المستند، لكن تعذر تنظيف الملف من التخزين: '+(error?.message||error);}
      }
      return Object.freeze({deleted,cleanupWarning});
    },

    async addMaterial({projectId,draft}){
      const saved=await repository.insertMaterial(buildMaterialRecord({
        projectId,
        draft,
        receivedAt:todayIsoInRiyadh(),
      }));
      if(!saved?.id || saved.project_id!==projectId)throw new Error('تعذر إثبات تسجيل المادة داخل المشروع.');
      return saved;
    },

    async updateMaterial({projectId,id,fields}){
      const saved=requireSingle(
        await repository.updateMaterial(projectId,id,normalizeMaterialPatch(fields)),
        'لم تُعدّل المادة؛ ربما تغيّرت أو لا تتبع هذا المشروع.'
      );
      if(saved.project_id!==projectId)throw new Error('تعذر إثبات بقاء المادة داخل المشروع بعد التعديل.');
      return saved;
    },

    async deleteMaterial({projectId,id}){
      requireSingle(
        await repository.deleteMaterial(projectId,id),
        'لم تُحذف المادة؛ ربما تغيّرت أو لا تتبع هذا المشروع.'
      );
      return true;
    },
  });
}

export const projectDocumentsService=createProjectDocumentsService();
