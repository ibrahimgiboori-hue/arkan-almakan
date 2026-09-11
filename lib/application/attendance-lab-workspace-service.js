import { attendanceLabWorkspaceSupabaseRepository } from '@/lib/adapters/attendance-lab-workspace-supabase';

const STAGE_MESSAGE=Object.freeze({
  analyze:'تم التحليل الفني.',
  review:'بدأت مرحلة معالجة التبريرات.',
  recalculate:'تمت إعادة الاحتساب بعد المعالجة.',
  ready:'النتيجة جاهزة للمراجعة النهائية.',
  post:'تم الترحيل إلى سجل HR الرسمي.',
});

export function createAttendanceLabWorkspaceService(repository=attendanceLabWorkspaceSupabaseRepository){
  return Object.freeze({
    listImports(limit=30){return repository.listImports(limit);},
    listEmployees(){return repository.listEmployees();},
    loadImport(importId){return repository.loadImport(importId);},
    async createBatch({file,hash,rows,processingScope,clientName=null,clientReference=null}){
      return repository.importPunches({
        p_file_name:file.name,
        p_file_size:file.size,
        p_file_hash:hash,
        p_rows:rows,
        p_parser_version:'xlsx-lab-v2',
        p_processing_scope:processingScope,
        p_client_entity_id:null,
        p_client_name:processingScope==='external'?String(clientName||'').trim():null,
        p_client_reference:processingScope==='external'?(String(clientReference||'').trim()||null):null,
      });
    },
    loadSchedule({activeImport,subjectId}){
      if(!activeImport?.id||!subjectId)return null;
      return repository.loadSchedule({importId:activeImport.id,processingScope:activeImport.processing_scope,subjectId});
    },
    saveSchedule({activeImport,scheduleId,subjectId,name,validFrom,validTo,days}){
      if(!activeImport?.id)throw new Error('دفعة الحضور غير محددة.');
      return repository.saveSchedule({processingScope:activeImport.processing_scope,scheduleId,importId:activeImport.id,subjectId,name,validFrom,validTo,days});
    },
    async runStage({action,importId}){
      const data=await repository.runStage(action,importId);
      return {data,message:STAGE_MESSAGE[action]||'تمت العملية.'};
    },
    loadExportData(importId){return repository.loadExportData(importId);},
  });
}

export const attendanceLabWorkspaceService=createAttendanceLabWorkspaceService();
