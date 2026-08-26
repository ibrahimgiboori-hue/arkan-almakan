import { todayIsoInRiyadh } from './format.js';

export const PROJECT_OPERATION_CONTEXT_EVENT = 'arkan:project-operation-context';
const PREFIX = 'arkan.project.ops.context.';

export function projectOperationContextKey(projectId) {
  return `${PREFIX}${projectId || ''}`;
}

export function normalizeProjectOperationContext(value = {}, fallbackDate = todayIsoInRiyadh()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value?.date || '')) ? String(value.date) : fallbackDate;
  const contractorId = value?.contractorId ? String(value.contractorId) : '';
  return { date, contractorId };
}

export function readProjectOperationContext(projectId, storage = globalThis?.localStorage) {
  const fallback = normalizeProjectOperationContext({});
  if (!projectId || !storage) return fallback;
  try {
    const raw = storage.getItem(projectOperationContextKey(projectId));
    if (raw) return normalizeProjectOperationContext(JSON.parse(raw));

    // هجرة صامتة من المفاتيح القديمة لكل مشروع؛ لا نعيد استعمال المفتاح العام القديم.
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
    storage.removeItem(`arkan.project.ops.date.${projectId}`);
    storage.removeItem(`arkan.project.ops.contractor.${projectId}`);
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
