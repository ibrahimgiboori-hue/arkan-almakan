import { projectOperationFinanceSupabaseRepository } from '@/lib/adapters/project-operation-finance-supabase';
import { buildProjectFinancePayload } from '@/lib/project-operation-finance.mjs';
import { projectLedgerRangeProblem } from '@/lib/project-operation-context.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';
import { saveSheetRows } from '@/lib/sheet-batch.mjs';

export function createProjectOperationFinanceService(repository=projectOperationFinanceSupabaseRepository){
  const service={
    /** The project's advances and payments ledger for a period. */
    async loadRange({projectId,from,to,contractorId=''}){
      if(!projectId)return {advances:[],payments:[]};
      const problem=projectLedgerRangeProblem(from,to);
      if(problem)throw new Error(problem);
      return repository.loadRange({projectId,from,to,contractorId});
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

    /** Save the ledger's ready new rows — each on its own day and contractor — through the verified write channel. */
    async saveSheet({projectId,rows}){
      return saveSheetRows(rows,(row)=>service.saveMovement({
        kind:row.kind,projectId,date:row.date,contractorId:row.contractor_id,amount:row.amount,notes:row.notes,
        source:row.kind==='payment'?row.source:undefined,
        reference:row.kind==='payment'?row.reference:undefined,
      }));
    },
  };
  return Object.freeze(service);
}

export const projectOperationFinanceService=createProjectOperationFinanceService();
