import { EXTERNAL_ATTENDANCE_STATUS } from '../core/external-attendance-state.js';
import {
  externalAttendanceReviewGroupForStatus,
  isExternalAttendanceJustificationAllowed,
  summarizeExternalAttendanceReview,
} from '../core/external-attendance-review.js';
import {
  EXTERNAL_ATTENDANCE_STAGE,
  EXTERNAL_ATTENDANCE_STAGE_STATUSES,
  externalAttendanceStageAcceptsStatus,
} from './external-attendance-workflow.js';

function requireRepository(repository){
  if(!repository)throw new Error('External attendance repository is required.');
  for(const method of [
    'getImport','listImports','loadProcessingDays','startReview','submitJustification','decideJustification','recalculateImport',
  ]){
    if(typeof repository[method]!=='function')throw new Error(`External attendance repository is missing ${method}.`);
  }
  return repository;
}

export function createExternalAttendanceReviewService(repository){
  const repo=requireRepository(repository);

  async function list(limit=40){
    return repo.listImports(EXTERNAL_ATTENDANCE_STAGE_STATUSES[EXTERNAL_ATTENDANCE_STAGE.REVIEW],limit);
  }

  async function requireReviewImport(importId){
    const item=await repo.getImport(importId);
    if(!item)throw new Error('دفعة الحضور غير موجودة.');
    if(item.processing_scope!=='external')throw new Error('هذه الخدمة مخصصة لمعالجة الحضور الخارجي.');
    if(!externalAttendanceStageAcceptsStatus(EXTERNAL_ATTENDANCE_STAGE.REVIEW,item.status)){
      throw new Error('الدفعة ليست في مرحلة المراجعة.');
    }
    return item;
  }

  async function load(importId){
    const item=await requireReviewImport(importId);
    const days=await repo.loadProcessingDays(importId);
    return {import:item,days,summary:summarizeExternalAttendanceReview(days)};
  }

  async function ensureStarted(importId){
    const item=await requireReviewImport(importId);
    if(item.status===EXTERNAL_ATTENDANCE_STATUS.ANALYZED){
      await repo.startReview(importId);
      return {...item,status:EXTERNAL_ATTENDANCE_STATUS.JUSTIFICATIONS};
    }
    return item;
  }

  async function submitMany({importId,cases=[],type,text=null,reference=null,approvedOn=null}){
    if(!cases.length)throw new Error('حدد حالة واحدة على الأقل.');
    await ensureStarted(importId);

    const failed=[];
    let applied=0;
    for(const day of cases){
      const group=externalAttendanceReviewGroupForStatus(day?.day_status);
      if(!isExternalAttendanceJustificationAllowed(group,type)){
        failed.push({id:day?.id||null,date:day?.work_date||null,error:'هذا التبرير غير متاح لهذه الحالة.'});
        continue;
      }
      if(type==='other'&&!String(text||'').trim()){
        failed.push({id:day?.id||null,date:day?.work_date||null,error:'أدخل تفاصيل التبرير.'});
        continue;
      }
      try{
        await repo.submitJustification({
          attendanceDayId:day.id,
          type,
          text:String(text||'').trim()||null,
          reference:String(reference||'').trim()||null,
          approvedOn:approvedOn||null,
        });
        applied+=1;
      }catch(error){
        failed.push({id:day?.id||null,date:day?.work_date||null,error:error?.message||String(error)});
      }
    }
    return {applied,failed};
  }

  async function decideMany({importId,decisions=[]}){
    await requireReviewImport(importId);
    const failed=[];
    let applied=0;
    for(const item of decisions){
      if(!['accepted','rejected'].includes(String(item?.decision||''))){
        failed.push({id:item?.justificationId||null,error:'قرار العميل غير معتمد.'});
        continue;
      }
      try{
        await repo.decideJustification({
          justificationId:item.justificationId,
          decision:item.decision,
          note:item.note||null,
          reference:item.reference||null,
          approvedOn:item.approvedOn||null,
        });
        applied+=1;
      }catch(error){
        failed.push({id:item?.justificationId||null,error:error?.message||String(error)});
      }
    }
    return {applied,failed};
  }

  async function approveResult(importId){
    const before=await load(importId);
    if(!before.summary.readyForFinal)throw new Error('لا يمكن اعتماد النتيجة قبل إغلاق جميع حالات المراجعة.');
    await repo.recalculateImport(importId);
    const after=await repo.getImport(importId);
    if(!after||![EXTERNAL_ATTENDANCE_STATUS.RECALCULATED,EXTERNAL_ATTENDANCE_STATUS.READY_TO_POST].includes(after.status)||!after.recalculated_at){
      throw new Error('لم يكتمل اعتماد نتيجة المراجعة.');
    }
    return after;
  }

  return Object.freeze({list,load,ensureStarted,submitMany,decideMany,approveResult});
}

let browserRuntimeServicePromise=null;
async function browserRuntimeService(){
  if(!browserRuntimeServicePromise){
    browserRuntimeServicePromise=import('../adapters/external-attendance-supabase.js')
      .then(({externalAttendanceSupabaseRepository})=>createExternalAttendanceReviewService(externalAttendanceSupabaseRepository));
  }
  return browserRuntimeServicePromise;
}

export const externalAttendanceReviewService=Object.freeze({
  list:(...args)=>browserRuntimeService().then((service)=>service.list(...args)),
  load:(...args)=>browserRuntimeService().then((service)=>service.load(...args)),
  ensureStarted:(...args)=>browserRuntimeService().then((service)=>service.ensureStarted(...args)),
  submitMany:(...args)=>browserRuntimeService().then((service)=>service.submitMany(...args)),
  decideMany:(...args)=>browserRuntimeService().then((service)=>service.decideMany(...args)),
  approveResult:(...args)=>browserRuntimeService().then((service)=>service.approveResult(...args)),
});
