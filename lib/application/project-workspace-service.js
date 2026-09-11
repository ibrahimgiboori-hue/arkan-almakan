import { projectWorkspaceSupabaseRepository } from '@/lib/adapters/project-workspace-supabase';
import {
  buildProjectWorkspaceAccess,
  normalizeProjectWorkspacePatch,
  selectProjectSetupAction,
} from '@/lib/project-workspace.mjs';

export function createProjectWorkspaceService(repository=projectWorkspaceSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)throw new Error('معرّف المشروع غير موجود.');
      const [source,financialSource,setupRows]=await Promise.all([
        repository.loadSource(projectId),
        repository.loadFinancials(projectId),
        repository.loadSetupQueue(projectId),
      ]);
      return Object.freeze({
        project:source.project,
        employees:Object.freeze(source.employees||[]),
        entities:Object.freeze(source.entities||[]),
        access:buildProjectWorkspaceAccess({
          projectId,
          capabilities:source.capabilities,
          isPrimaryUser:source.isPrimaryUser,
          isSystemAdmin:source.isSystemAdmin,
        }),
        financials:financialSource.financials||null,
        totals:financialSource.totals||null,
        setupAction:selectProjectSetupAction(setupRows),
      });
    },

    async loadFinancials({projectId}){
      if(!projectId)return {financials:null,totals:null};
      return repository.loadFinancials(projectId);
    },

    async loadSetupAction({projectId}){
      if(!projectId)return null;
      return selectProjectSetupAction(await repository.loadSetupQueue(projectId));
    },

    async patchProject({projectId,fields}){
      if(!projectId)throw new Error('معرّف المشروع غير موجود.');
      const patch=normalizeProjectWorkspacePatch(fields);
      return repository.updateProject(projectId,patch);
    },

    async submitSetupForApproval({projectId,note=null}){
      if(!projectId)throw new Error('معرّف المشروع غير موجود.');
      const workflowId=await repository.submitSetupApproval(projectId,note);
      if(!workflowId)throw new Error('لم يعد الخادم بمعرّف رحلة الاعتماد');
      const proof=await repository.loadSetupApprovalProof(workflowId);
      if(!proof?.workflow?.id||proof.workflow.id!==workflowId){
        throw new Error('تعذر إثبات انتقال تأسيس المشروع إلى رحلة الاعتماد');
      }
      return Object.freeze({workflowId,proof});
    },
  });
}

export const projectWorkspaceService=createProjectWorkspaceService();
