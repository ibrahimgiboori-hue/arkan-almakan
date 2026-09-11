import { projectLaborSupabaseRepository } from '@/lib/adapters/project-labor-supabase';
import {
  buildAssignLaborerPayload,
  buildMoveLaborerPayload,
  buildProjectLaborContractors,
  buildProjectLaborRoster,
  buildQuickAddWorkersPayload,
  buildUpdateLaborAssignmentPayload,
  projectLaborSuggestedDailyRate,
  summarizeQuickAddWorkers,
} from '@/lib/project-labor.mjs';

export function createProjectLaborService(repository=projectLaborSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId,date}){
      if(!projectId||!date)return {contractors:[],roster:[]};
      const source=await repository.loadWorkspaceSource({projectId,date});
      return {
        contractors:buildProjectLaborContractors(source.links,source.contractors),
        roster:buildProjectLaborRoster({projectId,date,laborers:source.laborers,assignments:source.assignments}),
      };
    },

    async quickAdd({projectId,contractorId,effectiveFrom,form,today}){
      if(effectiveFrom>today)throw new Error('تاريخ الإسناد لا يمكن أن يكون في المستقبل.');
      const payload=buildQuickAddWorkersPayload({projectId,contractorId,effectiveFrom,form});
      const results=await repository.quickAddWorkers(payload);
      return Object.freeze({results,summary:summarizeQuickAddWorkers(results)});
    },

    async transferQuickCandidate({candidate,selectedContractor,projectId,effectiveFrom}){
      if(!candidate?.laborer_id)throw new Error('العامل المطلوب نقله غير محدد.');
      const worker=await repository.loadLaborer(candidate.laborer_id);
      if(!worker)throw new Error('تعذر العثور على سجل العامل المطلوب نقله.');
      const targetDaily=worker.pay_basis==='daily'?projectLaborSuggestedDailyRate(selectedContractor,worker.labor_class):null;
      await repository.moveLaborer(buildMoveLaborerPayload({
        worker,projectId,contractorId:selectedContractor.id,effectiveFrom,
        dailyRate:targetDaily||worker.daily_rate,
        notes:`نقل صريح من الإضافة الموحدة في شاشة عمالة المشروع - تاريخ السريان ${effectiveFrom}`,
      }));
      return worker;
    },

    async assignWorker({worker,projectId,contractorId,effectiveFrom}){
      const otherAssignment=worker?.current_assignment&&worker.current_assignment.project_id!==projectId;
      if(otherAssignment){
        await repository.moveLaborer(buildMoveLaborerPayload({
          worker,projectId,contractorId,effectiveFrom,dailyRate:worker.daily_rate,
          notes:'نقل صريح من إدارة عمالة المشروع',
        }));
        return Object.freeze({moved:true});
      }
      await repository.assignExistingLaborer(buildAssignLaborerPayload({worker,projectId,contractorId,effectiveFrom}));
      return Object.freeze({moved:false});
    },

    async updateWorker({worker,form}){
      await repository.updateAssignment(buildUpdateLaborAssignmentPayload({assignmentId:worker?.assignment_id,form}));
      return true;
    },

    async moveWorker({worker,projectId,contractorId,effectiveFrom,dailyRate,notes}){
      await repository.moveLaborer(buildMoveLaborerPayload({worker,projectId,contractorId,effectiveFrom,dailyRate,notes}));
      return true;
    },
  });
}

export const projectLaborService=createProjectLaborService();
