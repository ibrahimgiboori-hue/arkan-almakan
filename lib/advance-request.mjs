import { roundValue } from './system-constitution.js';
import { getWorkflowActions, getApprovalActionLabel } from './workflow-actions.js';

// One calculation for the request editor and its printed representation.
// Actual installments always come from the saved installment records.
export function advanceInstallmentAmount(amount, installments) {
  const value = Number(amount);
  const count = Number(installments);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(count) || count < 1) return null;
  return roundValue(value / count);
}

export function buildAdvanceProcedureSlots(approvals = [], requesterName = '') {
  const exceptional = approvals.some((item) => item.scenario_snapshot === 'exceptional');
  const flow = getWorkflowActions('advance', { exceptional });
  const stages = flow.map((action) => {
    const approval = approvals.find((item) => Number(item.step_order) === action.step);
    return { action, approval, label:approval ? getApprovalActionLabel(approval, flow) : action.label };
  });

  return {
    electronic:stages.map(({ action, approval, label }) => ({
      key:action.action_code,
      action:label,
      actor:approval?.actor_name || '',
      title:approval?.actor_title || approval?.actor_position_snapshot || '',
      date:approval?.decision_date || null,
      state:approval?.decision === 'approved'
        ? (action.is_final ? 'معتمد' : 'تم')
        : approval?.decision === 'rejected' ? 'مرفوض' : 'بانتظار الإجراء',
    })),
    manual:[
      { label:'الموظف مقدم الطلب', name:requesterName },
      ...stages.map(({ approval, label }) => ({ label, name:approval?.actor_name || '' })),
    ],
  };
}
