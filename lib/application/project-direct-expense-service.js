import { projectDirectExpenseSupabaseRepository } from '@/lib/adapters/project-direct-expense-supabase';
import {
  directExpensePayload,
  directExpenseSignature,
  planDirectExpenseLedger,
  storedExpenseToDraft,
} from '@/lib/project-direct-expenses.mjs';
import { projectLedgerRangeProblem } from '@/lib/project-operation-context.mjs';

export function createProjectDirectExpenseService(repository=projectDirectExpenseSupabaseRepository){
  return Object.freeze({
    /** The project's expense ledger for a period; `baseline` lets a save update only the lines really edited. */
    async loadRange({projectId,from,to,contractorId=''}){
      if(!projectId)return {items:[],employees:[],savedRows:[],baseline:{}};
      const problem=projectLedgerRangeProblem(from,to);
      if(problem)throw new Error(problem);
      const source=await repository.loadRange({projectId,from,to,contractorId});
      const savedRows=(source.rows||[]).map((row)=>storedExpenseToDraft(row,row.expense_date));
      return {
        items:source.items||[],
        employees:source.employees||[],
        savedRows,
        baseline:Object.fromEntries(savedRows.map((row)=>[row.id,directExpenseSignature(row)])),
      };
    },

    /** Update edited saved lines, then create new lines in one call per contractor. */
    async saveLedger({projectId,rows,baseline={},from='',to=''}){
      if(!projectId)throw new Error('سياق المشروع غير مكتمل.');
      const plan=planDirectExpenseLedger(rows,{baseline,from,to});
      if(plan.errors.length)throw Object.assign(new Error(plan.errors.slice(0,4).join(' ')),{code:'ledger_rows'});
      if(!plan.updates.length&&!plan.creates.length)throw Object.assign(new Error('لا توجد تعديلات جاهزة للحفظ.'),{code:'empty'});
      for(const row of plan.updates){
        await repository.updateExpense({projectId,expenseId:row.id,payload:directExpensePayload(row,row.expense_date)});
      }
      let createdCount=0;
      for(const group of plan.creates){
        await repository.bulkCreate({projectId,contractorId:group.contractorId,rows:group.rows.map((row)=>directExpensePayload(row,row.expense_date))});
        createdCount+=group.rows.length;
      }
      return Object.freeze({updatedCount:plan.updates.length,createdCount});
    },

    async deleteExpense({projectId,expenseId}){
      if(!projectId||!expenseId)throw new Error('تعذر تحديد المصروف المطلوب حذفه.');
      await repository.deleteExpense({projectId,expenseId});
      return true;
    },
  });
}

export const projectDirectExpenseService=createProjectDirectExpenseService();
