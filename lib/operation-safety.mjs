export const OPERATION_QUEUE_KEY = 'arkan.operation.pending.v1';

export const OPERATION_CERTAINTY = Object.freeze({
  confirmed: 'مؤكد',
  estimated: 'تقديري',
  missing: 'ناقص',
});

export function newOperationRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error('هذا المتصفح لا يستطيع إنشاء معرّف آمن للحركة. حدّث المتصفح قبل الإدخال.');
}

export function normalizePendingOperation(input) {
  if (!input?.requestId) throw new Error('معرّف محاولة الحفظ مفقود');
  if (!input?.operation) throw new Error('نوع الحركة مفقود');
  if (!input?.projectId) throw new Error('المشروع مطلوب');
  if (!input?.workDate) throw new Error('تاريخ الحركة مطلوب');

  return {
    requestId: String(input.requestId),
    operation: String(input.operation),
    projectId: String(input.projectId),
    workDate: String(input.workDate),
    payload: input.payload || {},
    batchId: input.batchId || null,
    sourceKind: input.sourceKind || 'live',
    sourceRef: String(input.sourceRef || '').trim() || null,
    certainty: input.certainty || 'confirmed',
    queuedAt: input.queuedAt || new Date().toISOString(),
  };
}

export function readPendingOperations(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(OPERATION_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.requestId) : [];
  } catch {
    return [];
  }
}

export function writePendingOperations(storage, rows) {
  if (!storage) return;
  storage.setItem(OPERATION_QUEUE_KEY, JSON.stringify(rows || []));
}

export function enqueuePendingOperation(storage, input) {
  const item = normalizePendingOperation(input);
  const rows = readPendingOperations(storage);
  const index = rows.findIndex((row) => row.requestId === item.requestId);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writePendingOperations(storage, rows);
  return rows;
}

export function removePendingOperation(storage, requestId) {
  const rows = readPendingOperations(storage).filter((row) => row.requestId !== requestId);
  writePendingOperations(storage, rows);
  return rows;
}

export function isRetryableWriteError(error) {
  if (!error) return false;
  const status = Number(error.status || error.statusCode || 0);
  if ([0, 408, 425, 429, 502, 503, 504].includes(status)) return true;
  const message = String(error.message || error).toLowerCase();
  return /failed to fetch|network|load failed|timeout|timed out|connection|offline|غير متصل|انقطع الاتصال/.test(message);
}

export function receiptLabel(receipt) {
  if (!receipt?.receipt_no) return '';
  return `إثبات #${receipt.receipt_no}`;
}
