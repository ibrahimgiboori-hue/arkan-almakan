import { projectInsightsSupabaseRepository } from '@/lib/adapters/project-insights-supabase';
import { projectNavRequirement } from '@/lib/access-ui';
import {
  PROJECT_INSIGHT_SECTIONS,
  buildProjectInsight,
  projectInsightCanAccess,
} from '@/lib/project-insights.mjs';

export function createProjectInsightsService(repository=projectInsightsSupabaseRepository){
  async function loadSource(sectionKey,projectId){
    if(sectionKey==='planning')return repository.loadPlanning(projectId);
    if(sectionKey==='cost-control')return repository.loadCostControl(projectId);
    if(sectionKey==='changes')return repository.loadChanges(projectId);
    if(sectionKey==='correspondence')return repository.loadCorrespondence(projectId);
    throw new Error('قسم التحليل غير معروف.');
  }

  return Object.freeze({
    async loadWorkspace({projectId,sectionKey}){
      const definition=PROJECT_INSIGHT_SECTIONS[sectionKey] || null;
      if(!definition||!projectId){
        return Object.freeze({allowed:false,definition,project:null,data:null,error:'القسم أو المشروع غير معروف.'});
      }

      const context=await repository.loadAccessContext(projectId);
      if(!context.authenticated){
        return Object.freeze({allowed:false,definition,project:null,data:null,error:'انتهت جلسة المستخدم أو لم تعد صالحة.'});
      }
      if(!context.project){
        return Object.freeze({allowed:false,definition,project:null,data:null,error:'المشروع غير موجود أو غير متاح.'});
      }

      const required=projectNavRequirement(definition.key);
      const allowed=projectInsightCanAccess({
        required,
        capabilities:context.capabilities,
        primary:context.primary,
        isSystemAdmin:context.isSystemAdmin,
      });
      if(!allowed){
        return Object.freeze({allowed:false,definition,project:context.project,data:null,error:'هذا القسم خارج صلاحياتك في المشروع.'});
      }

      try{
        const source=await loadSource(sectionKey,projectId);
        return Object.freeze({
          allowed:true,
          definition,
          project:context.project,
          data:buildProjectInsight(sectionKey,source),
          error:'',
        });
      }catch(error){
        return Object.freeze({
          allowed:true,
          definition,
          project:context.project,
          data:null,
          error:error?.message || 'تعذر تحميل بيانات القسم.',
        });
      }
    },
  });
}

export const projectInsightsService=createProjectInsightsService();
