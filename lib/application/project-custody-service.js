import { projectCustodySupabaseRepository } from '@/lib/adapters/project-custody-supabase';
import { interpretGuardedWrite } from '@/lib/guarded-write.mjs';
import {
  buildOpenProjectCustodyPayload,
  buildProjectCustodyTransactionPayload,
  normalizeProjectCustodyWorkspace,
  projectCustodyCanSettle,
  projectCustodyRequiresOnline,
} from '@/lib/project-custody.mjs';

async function cleanupEvidence(repository,path){
  if(!path)return;
  try{await repository.removeEvidence(path);}catch{}
}

export function createProjectCustodyService(repository=projectCustodySupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)return normalizeProjectCustodyWorkspace({});
      return normalizeProjectCustodyWorkspace(await repository.loadWorkspaceSource(projectId));
    },

    async loadTransactions({custodyId}){
      if(!custodyId)return [];
      return repository.loadTransactions(custodyId);
    },

    async openEvidence(path){
      return repository.createEvidenceUrl(path);
    },

    async openCustody({projectId,form,evidenceFile=null,online=true}){
      if(!online)throw new Error(projectCustodyRequiresOnline().open);
      const payload=buildOpenProjectCustodyPayload({projectId,form});
      const created=await repository.openCustody(payload);
      const custodyId=created?.custody_id;
      if(!custodyId)throw new Error('لم يعد الخادم بمعرّف العهدة الجديدة');

      let evidenceWarning='';
      if(evidenceFile&&created?.transaction_id){
        let path=null;
        try{
          path=await repository.uploadEvidence({projectId,custodyId,file:evidenceFile});
          await repository.linkTransactionEvidence(created.transaction_id,path);
        }catch(error){
          await cleanupEvidence(repository,path);
          evidenceWarning='تم فتح العهدة، لكن تعذر ربط إثبات الإصدار: '+(error?.message||error);
        }
      }

      const proof=await repository.loadCustodyProof(custodyId);
      return Object.freeze({
        custodyId,
        custodyNo:proof?.custody_no||'',
        initialAmount:Number(form?.initial_amount||0),
        evidenceWarning,
      });
    },

    async saveTransaction({projectId,custody,form,evidenceFile=null,online=true}){
      if(!online)throw new Error(projectCustodyRequiresOnline().transaction);
      if(!custody?.id)throw new Error('العهدة غير محددة.');
      if(custody.status!=='open')throw new Error('لا يمكن إضافة حركة إلى عهدة غير مفتوحة.');

      let evidencePath=null;
      let insertedId=null;
      try{
        if(evidenceFile)evidencePath=await repository.uploadEvidence({projectId,custodyId:custody.id,file:evidenceFile});
        const payload=buildProjectCustodyTransactionPayload({projectId,custodyId:custody.id,form,documentPath:evidencePath});
        const inserted=await repository.createTransaction(payload);
        insertedId=inserted?.id||null;
        if(!insertedId)throw new Error('لم يعد الخادم بمعرّف حركة العهدة.');
        const proof=await repository.loadTransactionProof(insertedId);
        if(!proof?.id)throw new Error('تمت الكتابة الأولية لكن تعذر إثبات حفظ الحركة؛ حدّث السجل قبل المحاولة مجددًا.');
        return Object.freeze({proof});
      }catch(error){
        if(evidencePath&&!insertedId)await cleanupEvidence(repository,evidencePath);
        throw error;
      }
    },

    async settle({custody,online=true}){
      if(!online)throw new Error(projectCustodyRequiresOnline().settle);
      if(!projectCustodyCanSettle(custody))throw new Error('لا يمكن تسوية العهدة إلا وهي مفتوحة ورصيدها صفر.');
      const result=await repository.settleCustody(custody.id);
      const outcome=interpretGuardedWrite(result,{conflictMessage:'لم تتغيّر حالة العهدة — يبدو أنها سُوّيت أو أُغلقت من جهة أخرى. حدّث العرض.'});
      if(!outcome.ok)throw new Error(outcome.message);
      return Object.freeze(outcome);
    },
  });
}

export const projectCustodyService=createProjectCustodyService();
