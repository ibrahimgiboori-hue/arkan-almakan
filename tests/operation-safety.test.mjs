import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueuePendingOperation,
  isRetryableWriteError,
  OPERATION_QUEUE_KEY,
  readPendingOperations,
  removePendingOperation,
} from '../lib/operation-safety.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const op = (requestId = '00000000-0000-4000-8000-000000000001') => ({
  requestId,
  operation: 'expense',
  projectId: '00000000-0000-4000-8000-000000000002',
  workDate: '2026-08-20',
  payload: { amount: 250 },
});

test('يحفظ العملية المعلقة بمعرّف واحد ولا يكررها عند إعادة المحاولة', () => {
  const storage = memoryStorage();
  enqueuePendingOperation(storage, op());
  enqueuePendingOperation(storage, {...op(), payload: { amount: 300 }});
  const rows = readPendingOperations(storage);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.amount, 300);
  assert.ok(storage.getItem(OPERATION_QUEUE_KEY));
});

test('يزيل العملية من الطابور فقط بعد إثبات مزامنتها', () => {
  const storage = memoryStorage();
  enqueuePendingOperation(storage, op());
  assert.equal(removePendingOperation(storage, op().requestId).length, 0);
});

test('يميّز انقطاع الشبكة عن خطأ قواعد العمل', () => {
  assert.equal(isRetryableWriteError({ message: 'Failed to fetch' }), true);
  assert.equal(isRetryableWriteError({ status: 503, message: 'service unavailable' }), true);
  assert.equal(isRetryableWriteError({ status: 400, message: 'الكمية يجب أن تكون أكبر من صفر' }), false);
});
