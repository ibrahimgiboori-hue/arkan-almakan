import { supabase } from '@/lib/supabase';

const EXPENSE_FIELDS='id,expense_date,category,amount,notes,is_recoverable,payer,charge_to,project_item_id,paid_by_employee_id,reimbursement_status,reimbursed_amount,created_at';

export async function loadProjectDirectExpenseDay({projectId,date,contractorId}){
  const [itemsQ,rowsQ,employeesQ]=await Promise.all([
    supabase.from('project_items').select('id,description_ar').eq('project_id',projectId).eq('kind','item').order('sort_order'),
    supabase.from('contractor_expenses')
      .select(EXPENSE_FIELDS)
      .eq('project_id',projectId)
      .eq('contractor_id',contractorId)
      .eq('expense_date',date)
      .neq('payer','arkan_custody')
      .order('created_at'),
    supabase.from('employees').select('id,full_name_ar,status').eq('status','active').order('full_name_ar'),
  ]);
  const error=[itemsQ,rowsQ,employeesQ].find((result)=>result.error)?.error;
  if(error)throw error;
  return {
    items:itemsQ.data||[],
    rows:rowsQ.data||[],
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
  loadDay:loadProjectDirectExpenseDay,
  updateExpense:updateProjectDirectExpense,
  bulkCreate:bulkCreateProjectDirectExpenses,
  deleteExpense:deleteProjectDirectExpense,
});
