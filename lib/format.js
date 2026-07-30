export const money = (n) =>
  new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(n || 0));

export const dateAr = (d) =>
  d ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(d)) : '—';

export const daysUntil = (d) => {
  if (!d) return null;
  const ms = new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.round(ms / 86400000);
};

export const ROLE_AR = {
  ceo: 'المدير التنفيذي',
  hr: 'الموارد البشرية',
  accountant: 'المحاسب',
  supervisor: 'مشرف',
};

export const STATUS_AR = {
  active: 'على رأس العمل',
  on_leave: 'في إجازة',
  suspended: 'موقوف',
  terminated: 'منتهي',
};
