import { projectDirectExpenseSupabaseRepository } from '@/lib/adapters/project-direct-expense-supabase';
import {
  directExpensePayload,
  storedExpenseToDraft,
  summarizeDirectExpenseGrid,
  validateDirectExpenseGrid,
} from '@/lib/project-direct-expenses.mjs';

export function createProjectDirectExpenseService(repository=projectDirectExpenseSupabaseRepository){
  return Object.freeze({
    async loadDay({projectId,date,contractorId}){
      if(!projectId||!date||!contractorId)return {items:[],employees:[],savedRows:[]};
      const source=await repository.loadDay({projectId,date,contractorId});
      return {
        items:source.items||[],
        employees:source.employees||[],
        savedRows:(source.rows||[]).map((row)=>storedExpenseToDraft(row,date)),
      };
    },

    async saveGrid({projectId,contractorId,date,rows}){
      if(!projectId||!contractorId||!date)throw new Error('سياق المشروع أو المقاول أو التاريخ غير مكتمل.');
      const validRows=validateDirectExpenseGrid(rows);
      const persisted=validRows.filter((row)=>row.persisted);
      const created=validRows.filter((row)=>!row.persisted);

      for(const row of persisted){
        await repository.updateExpense({
          projectId,
          expenseId:row.id,
          payload:directExpensePayload(row,date),
        });
      }
      if(created.length){
        await repository.bulkCreate({
          projectId,
          contractorId,
          rows:created.map((row)=>directExpensePayload(row,date)),
        });
      }

      const summary=summarizeDirectExpenseGrid(validRows);
      return Object.freeze({updatedCount:persisted.length,createdCount:created.length,total:summary.currentGridTotal});
    },

    async deleteExpense({projectId,expenseId}){
      if(!projectId||!expenseId)throw new Error('تعذر تحديد المصروف المطلوب حذفه.');
      await repository.deleteExpense({projectId,expenseId});
      return true;
    },
  });
}

export const projectDirectExpenseService=createProjectDirectExpenseService();
