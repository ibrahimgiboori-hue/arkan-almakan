// كل الأرقام والتواريخ في المطبوعات إنجليزية موحّدة: 1,234.50 و 30/07/2026
import { SYSTEM } from './system-constitution';

export const money = (n) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(n || 0));

export const qty = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n || 0));

export const unitLabel = (unit) => {
  const raw = String(unit || '').trim();
  if (!raw) return '—';
  const compact = raw.replace(/\s+/g,'').toLowerCase();
  if (['م2','م²','m2','m²'].includes(compact)) return 'م²';
  if (['م3','م³','m3','m³'].includes(compact)) return 'م³';
  return raw;
};

const dateParts = (d) => {
  if (!d) return null;
  // نحافظ على التاريخ التقويمي نفسه عند وصول قيمة ISO من PostgreSQL، بلا أثر لتحويل المنطقة الزمنية.
  const raw = String(d);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { y:Number(iso[1]), m:Number(iso[2]), d:Number(iso[3]) };
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYSTEM.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(x);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { y:Number(value.year), m:Number(value.month), d:Number(value.day) };
};

const pad2 = (v) => String(v).padStart(2, '0');

export const datePartsInRiyadh = (d = new Date()) => {
  const x = dateParts(d);
  return x ? { year:x.y, month:x.m, day:x.d } : null;
};

export const todayIsoInRiyadh = () => {
  const x = datePartsInRiyadh(new Date());
  return x ? `${x.year}-${pad2(x.month)}-${pad2(x.day)}` : '';
};

export const dateAr = (d) => {
  const x = dateParts(d);
  if (!x) return '—';
  return `${pad2(x.d)}/${pad2(x.m)}/${x.y}`;
};

// قاعدة الفترات على مستوى النظام:
// نفس السنة: 18/07 - 15/08 | 2026
// سنتان مختلفتان: 18/12/2026 - 15/01/2027
export const dateRange = (from, to, { withPrefix = false } = {}) => {
  const a = dateParts(from);
  const b = dateParts(to);
  if (!a && !b) return '—';
  if (!a) return dateAr(to);
  if (!b) return dateAr(from);

  const value = a.y === b.y
    ? `${pad2(a.d)}/${pad2(a.m)} - ${pad2(b.d)}/${pad2(b.m)} | ${a.y}`
    : `${pad2(a.d)}/${pad2(a.m)}/${a.y} - ${pad2(b.d)}/${pad2(b.m)}/${b.y}`;

  return withPrefix ? `من ${value}` : value;
};

const utcDayNumber = ({ y, m, d }) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

export const daysUntil = (d) => {
  const target = dateParts(d);
  const today = dateParts(new Date());
  if (!target || !today) return null;
  return utcDayNumber(target) - utcDayNumber(today);
};

export const ROLE_AR = {
  ceo: 'المدير التنفيذي',
  hr: 'الموارد البشرية',
  accountant: 'المحاسب',
  supervisor: 'مشرف',
};

export const STATUS_AR = {
  active: 'على رأس العمل',
  pending_start: 'بانتظار المباشرة',
  on_leave: 'في إجازة',
  suspended: 'موقوف',
  terminated: 'منتهي',
};
