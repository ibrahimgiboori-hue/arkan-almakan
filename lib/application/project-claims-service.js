import { projectClaimsSupabaseRepository } from '@/lib/adapters/project-claims-supabase';
import { interpretGuardedWrite } from '@/lib/guarded-write.mjs';
import {
  buildClaimAttachment,
  buildClaimClientSubmission,
  buildClaimCollection,
  buildClaimInvoice,
  buildClaimOwnerApproval,
  buildCreateClaimPayload,
  buildHistoricalMeasurementStart,
  buildMeasurementEdit,
  buildProjectClaimsWorkspace,
  buildProjectMeasurementPayload,
  normalizeDraftClaimPatch,
  projectClaimApprovalDecision,
  safeClaimFileName,
} from '@/lib/project-claims.mjs';

function requireGuardedSuccess(result,conflictMessage){
  const outcome=interpretGuardedWrite(result,{conflictMessage});
  if(!outcome.ok)throw new Error(outcome.message);
  return outcome;
}

async function verifyClaim(repository,claimId,predicate,message){
  const proof=await repository.loadClaimProof(claimId);
  if(!proof?.id||!predicate(proof))throw new Error(message);
  return proof;
}

export function createProjectClaimsService(repository=projectClaimsSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const primary=await repository.loadPrimary(projectId);
      const claimIds=(primary.claims||[]).map((claim)=>claim.id).filter(Boolean);
      const details=claimIds.length?await repository.loadDetails(claimIds):{attachments:[],claimLines:[],journeyContexts:[]};
      return buildProjectClaimsWorkspace({...primary,...details});
    },

    async recordMeasurement({measure}){
      const result=await repository.recordMeasurement(buildProjectMeasurementPayload(measure));
      if(!result)throw new Error('لم يعد الخادم بإثبات تسجيل القياس.');
      return result;
    },

    async completeHistoricalStart({measurement,value}){
      const fields=buildHistoricalMeasurementStart(value,measurement);
      const result=await repository.updateAvailableMeasurement(measurement.measurement_id,fields);
      requireGuardedSuccess(result,'لم يعد التمتير متاحًا للتعديل');
      return true;
    },

    async editMeasurement({measurement,from,to,qty,price}){
      const fields=buildMeasurementEdit({from,to,qty,price});
      const result=await repository.updateAvailableMeasurement(measurement.measurement_id,fields);
      requireGuardedSuccess(result,'لم يعد التمتير متاحًا للتعديل');
      return true;
    },

    async cancelMeasurement({measurement}){
      const result=await repository.updateAvailableMeasurement(measurement.measurement_id,{status:'cancelled'});
      requireGuardedSuccess(result,'لم يعد التمتير متاحًا للإلغاء');
      return true;
    },

    async createClaim({projectId,measurementIds}){
      const created=await repository.createClaimFromMeasurements(buildCreateClaimPayload(projectId,measurementIds));
      const claimId=created?.claim_id;
      if(!claimId)throw new Error('لم يعد الخادم بمعرّف المستخلص الجديد.');
      const proof=await verifyClaim(repository,claimId,(claim)=>claim.project_id===projectId,'تعذر إثبات إنشاء المستخلص داخل المشروع.');
      return Object.freeze({...created,proof});
    },

    async ensureMeasureSheet({claimId,alreadyExists=false}){
      if(!claimId)throw new Error('المستخلص غير محدد.');
      if(alreadyExists)return Object.freeze({created:false});
      const attachment=await repository.insertAttachment(buildClaimAttachment({
        claimId,
        stage:'draft',
        code:'claim_sheet',
        direction:'out',
        title:'محضر قياس وحصر الأعمال',
        notes:'أُصدر من رحلة المستخلص',
      }));
      if(!attachment?.id)throw new Error('تعذر إثبات إنشاء محضر القياس.');
      return Object.freeze({created:true,attachment});
    },

    async submitInternal({claimId}){
      if(!claimId)throw new Error('المستخلص غير محدد.');
      await repository.submitForApproval(claimId);
      const context=await repository.loadJourneyContext(claimId);
      const workflow=context?.approval?.workflow;
      if(!workflow?.id||!['pending','returned','approved'].includes(workflow.status))throw new Error('تعذر إثبات انتقال المستخلص إلى رحلة الاعتماد الداخلي.');
      return Object.freeze({context,workflow});
    },

    async decideApproval({workflowId,decision,note}){
      const payload=projectClaimApprovalDecision({workflowId,decision,note});
      const result=await repository.decideApproval(payload);
      return Object.freeze({result});
    },

    async recordClientSubmission({claimId,date,reference}){
      await repository.recordClientSubmission(buildClaimClientSubmission({claimId,date,reference}));
      const proof=await verifyClaim(repository,claimId,(claim)=>Boolean(claim.client_submitted_at),'تعذر إثبات تسجيل تقديم المطالبة للعميل.');
      return proof;
    },

    async recordOwnerApproval({claimId,reference}){
      await repository.recordOwnerApproval(buildClaimOwnerApproval({claimId,reference}));
      return verifyClaim(repository,claimId,(claim)=>['owner_approved','collected'].includes(claim.status),'تعذر إثبات اعتماد العميل للمستخلص.');
    },

    async collectClaim({claimId,accountId,date,reference}){
      await repository.collectToTreasury(buildClaimCollection({claimId,accountId,date,reference}));
      return verifyClaim(repository,claimId,(claim)=>claim.status==='collected','تعذر إثبات التحصيل في المستخلص بعد ترحيله للخزينة.');
    },

    async recordInvoice({claimId,invoiceNo,date}){
      const payload=buildClaimInvoice({claimId,invoiceNo,date});
      await repository.recordInvoice(payload);
      return verifyClaim(repository,claimId,(claim)=>claim.invoice_no===payload.p_invoice_no&&Boolean(claim.invoiced_at),'تعذر إثبات بيانات الفاتورة على المستخلص.');
    },

    async uploadDocument({claimId,doc,file,reference}){
      if(!file)throw new Error('اختر الملف أولًا.');
      const fileName=safeClaimFileName(file.name);
      let path=null;
      try{
        path=await repository.uploadDocument({claimId,code:doc.code,file,fileName});
        const attachment=await repository.insertAttachment(buildClaimAttachment({
          claimId,
          stage:doc.stage,
          code:doc.code,
          direction:doc.direction,
          title:doc.name_ar,
          filePath:path,
          reference,
        }));
        if(!attachment?.id)throw new Error('تعذر إثبات ربط الملف بالمستخلص.');
        return Object.freeze({path,attachment});
      }catch(error){
        if(path){try{await repository.removeDocuments([path]);}catch{}}
        throw error;
      }
    },

    async openDocument(path){
      if(!path)throw new Error('مسار الملف غير موجود.');
      return repository.createDocumentUrl(path);
    },

    async updateDraftClaim({claimId,fields}){
      const patch=normalizeDraftClaimPatch(fields);
      const result=await repository.updateDraftClaim(claimId,patch);
      requireGuardedSuccess(result,'لم يعد المستخلص في حالة مسودة قابلة للتعديل. حدّث الرحلة قبل المحاولة.');
      return result.data;
    },

    async hardDelete({claimId}){
      if(!claimId)throw new Error('المستخلص غير محدد.');
      const result=await repository.deleteClaimDeep(claimId);
      const files=Array.isArray(result?.files)?result.files:[];
      let cleanupWarning='';
      if(files.length){
        try{await repository.removeDocuments(files);}
        catch(error){cleanupWarning='تم حذف المستخلص، لكن تعذر تنظيف بعض ملفاته من التخزين: '+(error?.message||error);}
      }
      return Object.freeze({result,cleanupWarning});
    },
  });
}

export const projectClaimsService=createProjectClaimsService();
