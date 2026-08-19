export const STATUS_AR = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  hr_reviewed: 'تمت المراجعة الإدارية',
  accountant_approved: 'تمت المراجعة المالية',
  ceo_approved: 'معتمد',
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

// أسماء الحالات القديمة تبقى في قاعدة البيانات للتوافق، لكن الواجهة تعرض مراحل محايدة
// لا تفترض أن مستخدم البرنامج الحالي هو صاحب القرار الإداري.
export function nextStage(kind, status) {
  const map = {
    leave: {
      draft: 'administrative_review',
      submitted: 'administrative_review',
      hr_reviewed: 'final_approval',
    },
    advance: {
      draft: 'administrative_review',
      submitted: 'administrative_review',
      hr_reviewed: 'financial_review',
      accountant_approved: 'final_approval',
    },
  };
  return map[kind]?.[status] || null;
}

export const STAGE_AR = {
  administrative_review: 'المراجعة الإدارية',
  financial_review: 'المراجعة المالية',
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
