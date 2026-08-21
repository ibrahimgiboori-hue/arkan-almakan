export const STATUS_AR = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  hr_reviewed: 'تم الإجراء الأول',
  accountant_approved: 'تمت المراجعة المالية',
  ceo_approved: 'معتمد نهائيًا',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

export const STATUS_CLASS = {
  ceo_approved: 'ok',
  rejected: 'bad',
  draft: '',
  submitted: 'warn',
  hr_reviewed: 'warn',
  accountant_approved: 'warn',
};

export const LEAVE_AR = {
  annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب',
  permission: 'استئذان', emergency: 'اضطرارية', hajj: 'حج', maternity: 'وضع',
};

// المرحلة ليست مرادفًا للاعتماد. السيناريو الطبيعي يبدأ بمراجعة/موافقة،
// بينما السيناريو الاستثنائي يبدأ بإعداد/تسجيل ثم يرفع لصاحب الاعتماد النهائي.
export function nextStage(kind, status, { exceptional=false } = {}) {
  const first = exceptional ? 'prepare_register' : 'review_approval';
  const map = {
    leave: {
      draft: first,
      submitted: first,
      hr_reviewed: 'final_approval',
    },
    advance: {
      draft: exceptional ? 'prepare_register' : 'review',
      submitted: exceptional ? 'prepare_register' : 'review',
      hr_reviewed: 'financial_review',
      accountant_approved: 'final_approval',
    },
  };
  return map[kind]?.[status] || null;
}

export const STAGE_AR = {
  prepare_register: 'إعداد وتسجيل الطلب',
  review: 'مراجعة',
  review_approval: 'مراجعة وموافقة',
  administrative_review: 'مراجعة وموافقة',
  financial_review: 'مراجعة مالية وموافقة',
  final_approval: 'الاعتماد النهائي',
};

// إبقاء هذه الدوال مؤقتًا لأن شاشات قديمة ما زالت تعتمد عليها.
export function nextRole(kind, status) {
  const map = {
    leave: { draft: 'hr', submitted: 'hr', hr_reviewed: 'ceo' },
    advance: { draft: 'hr', submitted: 'hr', hr_reviewed: 'accountant', accountant_approved: 'ceo' },
  };
  return map[kind]?.[status] || null;
}

export const ROLE_AR = { hr: 'الموارد البشرية', accountant: 'المحاسب', ceo: 'المدير التنفيذي' };
