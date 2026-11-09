import { projectOperationOutputSupabaseRepository } from '@/lib/adapters/project-operation-output-supabase';
import { buildProjectOutputPayload } from '@/lib/project-operation-output.mjs';
import { projectLedgerRangeProblem } from '@/lib/project-operation-context.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';
import { saveSheetRows } from '@/lib/sheet-batch.mjs';

export function createProjectOperationOutputService(repository=projectOperationOutputSupabaseRepository){
  const service={
    /** The project's output ledger for a period. */
    async loadRange({projectId,from,to,contractorId=''}){
      if(!projectId)return {items:[],links:[],rows:[]};
      const problem=projectLedgerRangeProblem(from,to);
      if(problem)throw new Error(problem);
      const source=await repository.loadRange({projectId,from,to,contractorId});
      return {items:source.items||[],links:source.links||[],rows:source.rows||[]};
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

    /** Save the ledger's ready new rows — each on its own day and contractor — through the verified write channel. */
    async saveSheet({projectId,rows,items}){
      const byId=new Map((items||[]).map((item)=>[item.id,item]));
      return saveSheetRows(rows,(row)=>service.saveOutput({
        projectId,date:row.date,contractorId:row.contractor_id,item:byId.get(row.item_id),quantity:row.qty,notes:row.notes,
      }));
    },
  };
  return Object.freeze(service);
}

export const projectOperationOutputService=createProjectOperationOutputService();
