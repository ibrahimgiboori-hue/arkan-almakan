import { supabase } from '@/lib/supabase';

const SETTLEMENT_FIELDS = 'id,settlement_no,project_id,contractor_id,period_from,period_to,works_amount,reimbursable_amount,charged_amount,payments_amount,advances_amount,penalty_amount,other_additions,net_payable,status,paid_at,case_id,created_at';
// Before the payments migration the column does not exist yet; read without it rather than failing.
const SETTLEMENT_FIELDS_LEGACY = SETTLEMENT_FIELDS.replace(',payments_amount', '');

const fail = (result) => { if (result.error) throw result.error; return result.data; };

async function selectSettlements(build) {
  const first = await build(SETTLEMENT_FIELDS);
  if (!first.error) return first.data || [];
  if (!/payments_amount/.test(first.error.message || '')) throw first.error;
  return fail(await build(SETTLEMENT_FIELDS_LEGACY)) || [];
}

/** Everything the statement of one contractor over a period needs. */
export async function loadProjectSettlementPeriod({ projectId, contractorId, from, to, basis }) {
  const [previewQ, daysQ, expensesQ, paymentsQ, advancesQ] = await Promise.all([
    supabase.rpc('fn_settlement_preview', { p_project_id: projectId, p_contractor_id: contractorId, p_from: from, p_to: to, p_basis: basis }),
    supabase.from('v_day_contractor_value')
      .select('work_date,present_count,daywork_value,piecework_value,by_item_value,is_piece_day')
      .eq('project_id', projectId).eq('contractor_id', contractorId)
      .gte('work_date', from).lte('work_date', to).order('work_date'),
    supabase.from('v_contractor_expense_split')
      .select('source,source_id,expense_date,category,amount,payer,charge_to,reimbursable,charged,notes')
      .eq('project_id', projectId).eq('contractor_id', contractorId)
      .gte('expense_date', from).lte('expense_date', to).order('expense_date'),
    supabase.from('contractor_payments')
      .select('id,payment_date,amount,source,reference,notes')
      .eq('project_id', projectId).eq('contractor_id', contractorId).eq('kind', 'on_account')
      .is('settlement_id', null).is('voided_at', null)
      .gte('payment_date', from).lte('payment_date', to).order('payment_date'),
    supabase.from('contractor_advances')
      .select('id,advance_date,amount,deducted,remaining,notes')
      .eq('project_id', projectId).eq('contractor_id', contractorId)
      .eq('is_closed', false).lte('advance_date', to).order('advance_date'),
  ]);
  const preview = fail(previewQ);
  return {
    preview: Array.isArray(preview) ? (preview[0] || {}) : (preview || {}),
    days: fail(daysQ) || [],
    expenses: fail(expensesQ) || [],
    payments: fail(paymentsQ) || [],
    advances: fail(advancesQ) || [],
  };
}

/** Saved settlements of the project (one contractor, or all), with their financial case status. */
export async function loadProjectSettlements({ projectId, contractorId = '' }) {
  const rows = await selectSettlements((fields) => {
    let query = supabase.from('contractor_settlements').select(fields).eq('project_id', projectId);
    if (contractorId) query = query.eq('contractor_id', contractorId);
    return query.order('period_from', { ascending: false }).limit(100);
  });
  const caseIds = rows.map((row) => row.case_id).filter(Boolean);
  const cases = caseIds.length ? fail(await supabase.from('financial_cases').select('id,case_no,status,current_owner').in('id', caseIds)) || [] : [];
  const caseById = new Map(cases.map((item) => [item.id, item]));
  return rows.map((row) => ({ ...row, financial_case: caseById.get(row.case_id) || null }));
}

export async function loadTreasuryAccounts() {
  return fail(await supabase.from('v_treasury_balances').select('id,account_code,name_ar,current_balance,is_active').eq('is_active', true).order('account_code')) || [];
}

export async function buildProjectSettlement({ projectId, contractorId, from, to, basis, penalty, other, settlementId = null }) {
  return fail(await supabase.rpc('fn_build_period_settlement', {
    p_project_id: projectId, p_contractor_id: contractorId, p_from: from, p_to: to, p_basis: basis,
    p_penalty: penalty, p_other: other, p_settlement_id: settlementId,
  }));
}

export async function actOnSettlementCase({ caseId, action, note = null }) {
  return fail(await supabase.rpc('fn_financial_case_action', { p_case_id: caseId, p_action: action, p_note: note }));
}

export async function paySettlementFromTreasury({ caseId, accountId, paymentDate, reference = null, note = null }) {
  return fail(await supabase.rpc('fn_financial_case_pay_from_treasury', {
    p_case_id: caseId, p_account_id: accountId, p_payment_date: paymentDate, p_reference: reference, p_note: note,
  }));
}

/** One settlement for printing: the settlement, its project and contractor, and its detail rows. */
export async function loadSettlementForPrint(settlementId) {
  const [row] = await selectSettlements((fields) => supabase.from('contractor_settlements').select(fields).eq('id', settlementId).limit(1));
  if (!row) return null;
  const [projectQ, contractorQ, settingsQ, daysQ, expensesQ, deductionsQ, caseQ] = await Promise.all([
    supabase.from('projects').select('id,project_no,name_ar').eq('id', row.project_id).maybeSingle(),
    supabase.from('contractors').select('id,name_ar,contractor_no,iban,bank_name').eq('id', row.contractor_id).maybeSingle(),
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('v_day_contractor_value')
      .select('work_date,present_count,daywork_value,piecework_value,by_item_value')
      .eq('project_id', row.project_id).eq('contractor_id', row.contractor_id)
      .gte('work_date', row.period_from).lte('work_date', row.period_to).order('work_date'),
    supabase.from('contractor_expenses')
      .select('id,expense_date,category,amount,payer,charge_to,notes')
      .eq('settlement_id', settlementId).order('expense_date'),
    supabase.from('contractor_advance_deductions').select('id,amount,contractor_advances(advance_date,amount,notes)').eq('settlement_id', settlementId),
    row.case_id ? supabase.from('financial_cases').select('id,case_no,status').eq('id', row.case_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  return {
    settlement: row,
    project: fail(projectQ),
    contractor: fail(contractorQ),
    settings: fail(settingsQ) || {},
    days: fail(daysQ) || [],
    expenses: fail(expensesQ) || [],
    deductions: fail(deductionsQ) || [],
    financialCase: fail(caseQ),
  };
}

export const projectSettlementSupabaseRepository = Object.freeze({
  loadPeriod: loadProjectSettlementPeriod,
  loadSettlements: loadProjectSettlements,
  loadTreasuryAccounts,
  build: buildProjectSettlement,
  act: actOnSettlementCase,
  pay: paySettlementFromTreasury,
  loadForPrint: loadSettlementForPrint,
});
