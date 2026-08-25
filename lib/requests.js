import { REQUEST_STATUS, STATUS_LABELS_AR } from './system-constitution';

export const STATUS_AR = Object.freeze({
  [REQUEST_STATUS.DRAFT]: STATUS_LABELS_AR[REQUEST_STATUS.DRAFT],
  [REQUEST_STATUS.SUBMITTED]: STATUS_LABELS_AR[REQUEST_STATUS.SUBMITTED],
  [REQUEST_STATUS.HR_REVIEWED]: STATUS_LABELS_AR[REQUEST_STATUS.HR_REVIEWED],
  [REQUEST_STATUS.ACCOUNTANT_APPROVED]: STATUS_LABELS_AR[REQUEST_STATUS.ACCOUNTANT_APPROVED],
  [REQUEST_STATUS.CEO_APPROVED]: STATUS_LABELS_AR[REQUEST_STATUS.CEO_APPROVED],
  [REQUEST_STATUS.REJECTED]: STATUS_LABELS_AR[REQUEST_STATUS.REJECTED],
  [REQUEST_STATUS.CANCELLED]: STATUS_LABELS_AR[REQUEST_STATUS.CANCELLED],
});

export const STATUS_CLASS = Object.freeze({
  [REQUEST_STATUS.CEO_APPROVED]: 'ok',
  [REQUEST_STATUS.REJECTED]: 'bad',
  [REQUEST_STATUS.DRAFT]: '',
  [REQUEST_STATUS.SUBMITTED]: 'warn',
  [REQUEST_STATUS.HR_REVIEWED]: 'warn',
  [REQUEST_STATUS.ACCOUNTANT_APPROVED]: 'warn',
  [REQUEST_STATUS.CANCELLED]: 'bad',
});

export const LEAVE_AR = Object.freeze({
  annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب',
  permission: 'استئذان', emergency: 'اضطرارية', hajj: 'حج', maternity: 'وضع',
});

// المرحلة ليست مرادفًا للاعتماد. السيناريو الطبيعي يبدأ بمراجعة/موافقة،
// بينما السيناريو الاستثنائي يبدأ بإعداد/تسجيل ثم يرفع لصاحب الاعتماد النهائي.
export function nextStage(kind, status, { exceptional=false } = {}) {
  const first = exceptional ? 'prepare_register' : 'review_approval';
  const map = {
    leave: {
      [REQUEST_STATUS.DRAFT]: first,
      [REQUEST_STATUS.SUBMITTED]: first,
      [REQUEST_STATUS.HR_REVIEWED]: 'final_approval',
    },
    advance: {
      [REQUEST_STATUS.DRAFT]: exceptional ? 'prepare_register' : 'review',
      [REQUEST_STATUS.SUBMITTED]: exceptional ? 'prepare_register' : 'review',
      [REQUEST_STATUS.HR_REVIEWED]: 'financial_review',
      [REQUEST_STATUS.ACCOUNTANT_APPROVED]: 'final_approval',
    },
  };
  return map[kind]?.[status] || null;
}

export const STAGE_AR = Object.freeze({
  prepare_register: 'إعداد وتسجيل الطلب',
  review: 'مراجعة',
  review_approval: 'مراجعة وموافقة',
  administrative_review: 'مراجعة وموافقة',
  financial_review: 'مراجعة مالية وموافقة',
  final_approval: 'الاعتماد النهائي',
});

// إبقاء هذه الدالة مؤقتًا لأن بعض الشاشات القديمة ما زالت تعتمد عليها.
export function nextRole(kind, status) {
  const map = {
    leave: {
      [REQUEST_STATUS.DRAFT]: 'hr',
      [REQUEST_STATUS.SUBMITTED]: 'hr',
      [REQUEST_STATUS.HR_REVIEWED]: 'ceo',
    },
    advance: {
      [REQUEST_STATUS.DRAFT]: 'hr',
      [REQUEST_STATUS.SUBMITTED]: 'hr',
      [REQUEST_STATUS.HR_REVIEWED]: 'accountant',
      [REQUEST_STATUS.ACCOUNTANT_APPROVED]: 'ceo',
    },
  };
  return map[kind]?.[status] || null;
}

export const ROLE_AR = Object.freeze({ hr: 'الموارد البشرية', accountant: 'المحاسب', ceo: 'المدير التنفيذي' });
