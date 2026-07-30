export const STATUS_AR = {
  draft: 'مسودة',
  submitted: 'مُقدَّم',
  hr_reviewed: 'دقّقته الموارد البشرية',
  accountant_approved: 'اعتمده المحاسب',
  ceo_approved: 'معمَّد — نافذ',
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

// من صاحب الخطوة التالية
export function nextRole(kind, status) {
  const map = {
    leave: { draft: 'hr', submitted: 'hr', hr_reviewed: 'ceo' },
    advance: { draft: 'hr', submitted: 'hr', hr_reviewed: 'accountant', accountant_approved: 'ceo' },
  };
  return map[kind]?.[status] || null;
}

export const ROLE_AR = { hr: 'الموارد البشرية', accountant: 'المحاسب', ceo: 'المدير التنفيذي' };
