import { projectGuaranteesSupabaseRepository } from '@/lib/adapters/project-guarantees-supabase';
import { todayIsoInRiyadh } from '@/lib/format';
import { buildGuaranteeRecord, buildProjectGuaranteesWorkspace } from '@/lib/project-guarantees.mjs';

export function createProjectGuaranteesService(repository=projectGuaranteesSupabaseRepository){
  return Object.freeze({
    async loadWorkspace({projectId}){
      if(!projectId)throw new Error('المشروع غير محدد.');
      const [guarantees,retentions]=await Promise.all([
        repository.loadGuarantees(projectId),
        repository.loadRetentions(projectId),
      ]);
      return buildProjectGuaranteesWorkspace({
        guarantees,
        retentions,
        todayIso:todayIsoInRiyadh(),
      });
    },

    async addGuarantee({projectId,form}){
      const saved=await repository.insertGuarantee(buildGuaranteeRecord({projectId,form}));
      if(!saved?.id || saved.project_id!==projectId)throw new Error('تعذر إثبات إضافة الضمان داخل المشروع.');
      return saved;
    },
  });
}

export const projectGuaranteesService=createProjectGuaranteesService();
