import { projectOperationFinanceSupabaseRepository } from '@/lib/adapters/project-operation-finance-supabase';
import { buildProjectFinancePayload } from '@/lib/project-operation-finance.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';

export function createProjectOperationFinanceService(repository=projectOperationFinanceSupabaseRepository){
  return Object.freeze({
    async loadDay({projectId,date,contractorId}){
      if(!projectId||!date||!contractorId)return {advances:[],payments:[]};
      return repository.loadDay({projectId,date,contractorId});
    },

    async saveMovement({kind,projectId,date,contractorId,amount,notes,source,reference}){
      const payload=buildProjectFinancePayload({kind,contractorId,amount,notes,source,reference});
      return saveOperationWithQueue({
        operation:kind,
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

export const projectOperationFinanceService=createProjectOperationFinanceService();
