import { projectOperationOutputSupabaseRepository } from '@/lib/adapters/project-operation-output-supabase';
import { buildProjectOutputPayload, selectAvailableProjectItems } from '@/lib/project-operation-output.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';

export function createProjectOperationOutputService(repository=projectOperationOutputSupabaseRepository){
  return Object.freeze({
    async loadDay({projectId,date,contractorId}){
      if(!projectId||!date||!contractorId)return {items:[],availableItems:[],rows:[]};
      const source=await repository.loadDay({projectId,date,contractorId});
      return {
        items:source.items||[],
        availableItems:selectAvailableProjectItems(source.items||[],source.links||[],date),
        rows:source.rows||[],
      };
    },

    async saveOutput({projectId,date,contractorId,item,quantity,notes}){
      const payload=buildProjectOutputPayload({contractorId,item,quantity,notes});
      return saveOperationWithQueue({
        operation:'output',
        projectId,
        workDate:date,
        payload,
        batchId:null,
        sourceKind:'live',
        sourceRef:null,
        certainty:'confirmed',
      });
    },
  });
}

export const projectOperationOutputService=createProjectOperationOutputService();
