export const ACTION_LABELS = {
  prepare_register: 'إعداد وتسجيل الطلب',
  register: 'تسجيل الإجراء',
  review: 'مراجعة',
  review_approval: 'مراجعة وموافقة',
  financial_review: 'مراجعة مالية وموافقة',
  acknowledge: 'إقرار',
  approval: 'موافقة',
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

  // السجلات القديمة لم تكن تحفظ السيناريو. في هذه الحالة يكون تعريف
  // المعاملة الحالي هو المرجع حتى لا يبقى وصف قديم مثل "مراجعة الطلب"
  // على معاملة أصبحت استثنائية ويكون الإجراء الصحيح فيها "إعداد وتسجيل".
  if (!approval?.scenario_snapshot && step?.label) return step.label;

  return approval?.action_label_snapshot
    || step?.label
    || ACTION_LABELS[approval?.action_code]
    || approval?.stage_label_snapshot
    || 'تسجيل الإجراء';
}

export function manualProcedureRoles(transactionType, { exceptional=false, leadLabel=null } = {}) {
  const flow = getWorkflowActions(transactionType, { exceptional });
  const roles = flow.map((x) => x.label);
  return leadLabel ? [leadLabel, ...roles] : roles;
}
