import { projectOperationFinanceSupabaseRepository } from '@/lib/adapters/project-operation-finance-supabase';
import { buildProjectFinancePayload } from '@/lib/project-operation-finance.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';
import { saveSheetRows } from '@/lib/sheet-batch.mjs';

export function createProjectOperationFinanceService(repository=projectOperationFinanceSupabaseRepository){
  const service={
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

    /** Save the sheet's ready new rows, each through the verified write channel. */
    async saveSheet({projectId,date,contractorId,rows}){
      return saveSheetRows(rows,(row)=>service.saveMovement({
        kind:row.kind,projectId,date,contractorId,amount:row.amount,notes:row.notes,
        source:row.kind==='payment'?row.source:undefined,
        reference:row.kind==='payment'?row.reference:undefined,
      }));
    },
  };
  return Object.freeze(service);
}

export const projectOperationFinanceService=createProjectOperationFinanceService();
