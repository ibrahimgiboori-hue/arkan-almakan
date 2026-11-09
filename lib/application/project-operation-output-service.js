import { projectOperationOutputSupabaseRepository } from '@/lib/adapters/project-operation-output-supabase';
import { buildProjectOutputPayload, selectAvailableProjectItems } from '@/lib/project-operation-output.mjs';
import { saveOperationWithQueue } from '@/lib/verified-operation-write';
import { saveSheetRows } from '@/lib/sheet-batch.mjs';

export function createProjectOperationOutputService(repository=projectOperationOutputSupabaseRepository){
  const service={
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

    /** Save the sheet's ready new rows, each through the verified write channel. */
    async saveSheet({projectId,date,contractorId,rows,items}){
      const byId=new Map((items||[]).map((item)=>[item.id,item]));
      return saveSheetRows(rows,(row)=>service.saveOutput({
        projectId,date,contractorId,item:byId.get(row.item_id),quantity:row.qty,notes:row.notes,
      }));
    },
  };
  return Object.freeze(service);
}

export const projectOperationOutputService=createProjectOperationOutputService();
