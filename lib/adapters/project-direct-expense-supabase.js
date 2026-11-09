import { supabase } from '@/lib/supabase';
import { readAllPages } from '@/lib/adapters/supabase-paging';

const EXPENSE_FIELDS='id,contractor_id,expense_date,category,amount,quantity,unit_price,notes,is_recoverable,payer,charge_to,project_item_id,paid_by_employee_id,reimbursement_status,reimbursed_amount,created_at';

/** Project expenses over a period (every contractor, or one), with the lists the sheet needs. */
export async function loadProjectDirectExpenseRange({projectId,from,to,contractorId=''}){
  const [itemsQ,rows,employeesQ]=await Promise.all([
    supabase.from('project_items').select('id,description_ar').eq('project_id',projectId).eq('kind','item').order('sort_order'),
    readAllPages(()=>{
      let query=supabase.from('contractor_expenses')
        .select(EXPENSE_FIELDS)
        .eq('project_id',projectId)
        .gte('expense_date',from)
        .lte('expense_date',to)
        .neq('payer','arkan_custody');
      if(contractorId)query=query.eq('contractor_id',contractorId);
      return query.order('expense_date').order('created_at').order('id');
    }),
    supabase.from('employees').select('id,full_name_ar,status').eq('status','active').order('full_name_ar'),
  ]);
  const error=[itemsQ,employeesQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {
    items:itemsQ.data||[],
    rows,
    employees:employeesQ.data||[],
  };
}

export async function updateProjectDirectExpense({projectId,expenseId,payload}){
  const query=await supabase.from('contractor_expenses').update(payload).eq('id',expenseId).eq('project_id',projectId);
  if(query.error)throw query.error;
  return true;
}

export async function bulkCreateProjectDirectExpenses({projectId,contractorId,rows}){
  if(!rows?.length)return true;
  const query=await supabase.rpc('fn_bulk_save_project_expenses',{
    p_project_id:projectId,
    p_contractor_id:contractorId,
    p_rows:rows,
  });
  if(query.error)throw query.error;
  return true;
}

export async function deleteProjectDirectExpense({projectId,expenseId}){
  const query=await supabase.from('contractor_expenses').delete().eq('id',expenseId).eq('project_id',projectId);
  if(query.error)throw query.error;
  return true;
}

export const projectDirectExpenseSupabaseRepository=Object.freeze({
  loadRange:loadProjectDirectExpenseRange,
  updateExpense:updateProjectDirectExpense,
  bulkCreate:bulkCreateProjectDirectExpenses,
  deleteExpense:deleteProjectDirectExpense,
});
