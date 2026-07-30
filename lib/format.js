// كل الأرقام والتواريخ في المطبوعات إنجليزية موحّدة: 1,234.50 و 30/07/2026

export const money = (n) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(n || 0));

export const qty = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n || 0));

export const dateAr = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  const p = (v) => String(v).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
};

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
