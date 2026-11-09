import { todayIsoInRiyadh } from './format.js';

export const PROJECT_OPERATION_CONTEXT_EVENT = 'arkan:project-operation-context';
const PREFIX = 'arkan.project.ops.context.';

export function projectOperationContextKey(projectId) {
  return `${PREFIX}${projectId || ''}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * سياق تشغيل المشروع، واحد لكل أوراق المشروع:
 * - from / to: فترة الفلترة لكل الأوراق (افتراضيًا من أول الشهر حتى اليوم).
 * - contractorId: فلتر المقاول ('' = كل المقاولين).
 * - search: بحث نصي (اسم عامل، بند، بيان…).
 * - date: التاريخ الافتراضي لأي صف جديد.
 */
export function normalizeProjectOperationContext(value = {}, fallbackDate = todayIsoInRiyadh()) {
  const date = ISO_DATE.test(String(value?.date || '')) ? String(value.date) : fallbackDate;
  const contractorId = value?.contractorId ? String(value.contractorId) : '';
  const to = ISO_DATE.test(String(value?.to || '')) ? String(value.to) : date;
  const fromRaw = ISO_DATE.test(String(value?.from || '')) ? String(value.from) : `${to.slice(0, 8)}01`;
  const from = fromRaw <= to ? fromRaw : to;
  const search = String(value?.search ?? '').slice(0, 80);
  return { date, contractorId, from, to, search };
}

/** Quick periods for the filter bar, relative to a reference day. */
export function projectOperationPeriod(kind, reference = todayIsoInRiyadh()) {
  const [y, m] = reference.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  if (kind === 'today') return { from: reference, to: reference };
  if (kind === 'week') return { from: moveOperationalDate(reference, -6), to: reference };
  if (kind === 'month') return { from: `${y}-${pad(m)}-01`, to: reference };
  if (kind === 'last-month') {
    const first = new Date(y, m - 2, 1);
    const last = new Date(y, m - 1, 0);
    return { from: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`, to: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}` };
  }
  return null;
}

/** Every day between from and to (inclusive), capped. */
export function projectOperationDays(from, to, cap = 62) {
  const days = [];
  if (!ISO_DATE.test(String(from || '')) || !ISO_DATE.test(String(to || '')) || to < from) return days;
  let day = from;
  while (day <= to && days.length < cap) { days.push(day); day = moveOperationalDate(day, 1); }
  return days;
}

export function readProjectOperationContext(projectId, storage = globalThis?.localStorage) {
  const fallback = normalizeProjectOperationContext({});
  if (!projectId || !storage) return fallback;
  try {
    const raw = storage.getItem(projectOperationContextKey(projectId));
    if (raw) return normalizeProjectOperationContext(JSON.parse(raw));

    // هجرة انتقالية من المفاتيح القديمة. تبقى قابلة للقراءة إلى أن يهاجر آخر مستهلك.
    const legacyDate = storage.getItem(`arkan.project.ops.date.${projectId}`);
    const legacyContractor = storage.getItem(`arkan.project.ops.contractor.${projectId}`);
    return normalizeProjectOperationContext({ date: legacyDate, contractorId: legacyContractor });
  } catch {
    return fallback;
  }
}

export function writeProjectOperationContext(projectId, patch = {}, storage = globalThis?.localStorage) {
  const current = readProjectOperationContext(projectId, storage);
  const next = normalizeProjectOperationContext({ ...current, ...patch }, current.date);
  if (!projectId || !storage) return next;
  try {
    storage.setItem(projectOperationContextKey(projectId), JSON.stringify(next));

    // توافق انتقالي: لا نمحو المفاتيح القديمة قبل اكتمال هجرة جميع شاشات التشغيل.
    // الكتابة المرآتية تمنع شاشة قديمة من إعادة التاريخ أو المقاول إلى قيمة مختلفة.
    storage.setItem(`arkan.project.ops.date.${projectId}`, next.date);
    if (next.contractorId) storage.setItem(`arkan.project.ops.contractor.${projectId}`, next.contractorId);
    else storage.removeItem(`arkan.project.ops.contractor.${projectId}`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PROJECT_OPERATION_CONTEXT_EVENT, { detail: { projectId, context: next } }));
    }
  } catch {
    // فشل التخزين لا يمنع الشاشة من العمل بالسياق الحالي في الذاكرة.
  }
  return next;
}

export function moveOperationalDate(value, days) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  const base = year && month && day ? new Date(year, month - 1, day) : new Date();
  base.setDate(base.getDate() + Number(days || 0));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}
