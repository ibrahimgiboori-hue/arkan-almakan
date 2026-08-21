export const ACTION_LABELS = {
  prepare_register: 'إعداد وتسجيل الطلب',
  register: 'تسجيل الإجراء',
  review: 'مراجعة',
  review_approval: 'مراجعة وموافقة',
  financial_review: 'مراجعة مالية وموافقة',
  acknowledge: 'إقرار',
  approval: 'موافقة',
  substitute_consent: 'موافقة الموظف البديل',
  final_approval: 'اعتماد نهائي',
};

const FLOWS = {
  leave: {
    normal: [
      { step:1, action_code:'review_approval', label:'مراجعة وموافقة', is_final:false },
      { step:2, action_code:'final_approval', label:'اعتماد نهائي', is_final:true },
    ],
    exceptional: [
      { step:1, action_code:'prepare_register', label:'إعداد وتسجيل الطلب', is_final:false },
      { step:2, action_code:'final_approval', label:'اعتماد نهائي', is_final:true },
    ],
  },
  advance: {
    normal: [
      { step:1, action_code:'review', label:'مراجعة', is_final:false },
      { step:2, action_code:'financial_review', label:'مراجعة مالية وموافقة', is_final:false },
      { step:3, action_code:'final_approval', label:'اعتماد نهائي', is_final:true },
    ],
    exceptional: [
      { step:1, action_code:'prepare_register', label:'إعداد وتسجيل الطلب', is_final:false },
      { step:2, action_code:'financial_review', label:'مراجعة مالية', is_final:false },
      { step:3, action_code:'final_approval', label:'اعتماد نهائي', is_final:true },
    ],
  },
};

const DEFAULT_FLOW = {
  normal: [
    { step:1, action_code:'review_approval', label:'مراجعة وموافقة', is_final:false },
    { step:2, action_code:'final_approval', label:'اعتماد نهائي', is_final:true },
  ],
  exceptional: [
    { step:1, action_code:'prepare_register', label:'إعداد وتسجيل المعاملة', is_final:false },
    { step:2, action_code:'final_approval', label:'اعتماد نهائي', is_final:true },
  ],
};

export function getWorkflowActions(transactionType, { exceptional=false } = {}) {
  const scenario = exceptional ? 'exceptional' : 'normal';
  const flow = FLOWS[transactionType] || DEFAULT_FLOW;
  return flow[scenario] || flow.normal || DEFAULT_FLOW.normal;
}

export function getApprovalActionLabel(approval, flow) {
  const ordered = flow || DEFAULT_FLOW.normal;
  const step = ordered.find((x) => Number(x.step) === Number(approval?.step_order));

  // الإجراءات الموازية تحفظ نوعها صراحة ولا تعتمد على ترتيب الخطوات.
  if (approval?.action_code === 'substitute_consent') {
    return approval?.action_label_snapshot || ACTION_LABELS.substitute_consent;
  }

  // السجلات القديمة لم تكن تحفظ السيناريو. في هذه الحالة يكون تعريف
  // المعاملة الحالي هو المرجع حتى لا يبقى وصف قديم غير مناسب.
  if (!approval?.scenario_snapshot && step?.label) return step.label;

  return approval?.action_label_snapshot
    || step?.label
    || ACTION_LABELS[approval?.action_code]
    || approval?.stage_label_snapshot
    || 'تسجيل الإجراء';
}

export function manualProcedureRoles(transactionType, { exceptional=false, leadLabel=null, parallelLabels=[] } = {}) {
  const flow = getWorkflowActions(transactionType, { exceptional });
  const mainRoles = flow.map((x) => x.label);
  const roles = leadLabel ? [leadLabel, ...mainRoles] : [...mainRoles];

  // الإجراءات الموازية - مثل موافقة الموظف البديل - توضع قبل الاعتماد النهائي
  // دون اعتبارها مرحلة تسبق الإجراء الأول أو تغير ترتيب المعاملة.
  if (!parallelLabels?.length) return roles;
  const finalIndex = roles.findIndex((x) => x === 'اعتماد نهائي');
  if (finalIndex < 0) return [...roles, ...parallelLabels];
  return [...roles.slice(0, finalIndex), ...parallelLabels, ...roles.slice(finalIndex)];
}
