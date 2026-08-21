'use client';

import { supabase } from '@/lib/supabase';
import {
  enqueuePendingOperation,
  isRetryableWriteError,
  newOperationRequestId,
  normalizePendingOperation,
  readPendingOperations,
  removePendingOperation,
} from '@/lib/operation-safety.mjs';

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

function rpcArgs(input) {
  return {
    p_request_id: input.requestId,
    p_operation: input.operation,
    p_project_id: input.projectId,
    p_work_date: input.workDate,
    p_payload: input.payload || {},
    p_batch_id: input.batchId || null,
    p_source_kind: input.sourceKind || 'live',
    p_source_ref: input.sourceRef || null,
    p_certainty: input.certainty || 'confirmed',
  };
}

export async function submitVerifiedOperation(rawInput) {
  const input = normalizePendingOperation(rawInput);
  const { data, error } = await supabase.rpc('fn_safe_site_operation_write', rpcArgs(input));
  if (error) throw error;

  const receipt = typeof data === 'string' ? JSON.parse(data) : data;
  if (!receipt?.receipt_id || !receipt?.receipt_no) {
    throw new Error('أعاد الخادم نتيجة بلا رقم إثبات');
  }

  // إثبات قراءة مستقل بعد الكتابة؛ نجاح RPC وحده لا يكفي لعرض «تم الحفظ».
  const { data: proof, error: proofError } = await supabase
    .from('operation_write_receipts')
    .select('id,receipt_no,request_id,operation_type,entity_table,entity_ids,entity_snapshot,saved_at,verified_at,source_kind,source_ref,certainty,batch_id,project_id,work_date')
    .eq('request_id', input.requestId)
    .single();
  if (proofError) throw proofError;
  if (proof.id !== receipt.receipt_id) throw new Error('رقم إثبات القراءة لا يطابق عملية الحفظ');
  return proof;
}

export async function saveOperationWithQueue(rawInput) {
  const input = normalizePendingOperation({
    ...rawInput,
    requestId: rawInput.requestId || newOperationRequestId(),
  });

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const rows = enqueuePendingOperation(storage(), input);
    return { status: 'queued', requestId: input.requestId, pendingCount: rows.length };
  }

  try {
    const receipt = await submitVerifiedOperation(input);
    const rows = removePendingOperation(storage(), input.requestId);
    return { status: 'verified', requestId: input.requestId, receipt, pendingCount: rows.length };
  } catch (error) {
    if (!isRetryableWriteError(error)) throw error;
    const rows = enqueuePendingOperation(storage(), input);
    return { status: 'queued', requestId: input.requestId, error, pendingCount: rows.length };
  }
}

export function pendingOperationCount() {
  return readPendingOperations(storage()).length;
}

export async function syncPendingOperations(onProgress) {
  const current = readPendingOperations(storage());
  const result = { total: current.length, synced: 0, failed: 0, receipts: [] };

  for (const item of current) {
    try {
      const receipt = await submitVerifiedOperation(item);
      removePendingOperation(storage(), item.requestId);
      result.synced += 1;
      result.receipts.push(receipt);
      onProgress?.({ item, status: 'verified', receipt, ...result });
    } catch (error) {
      result.failed += 1;
      onProgress?.({ item, status: 'failed', error, ...result });
      if (isRetryableWriteError(error)) break;
    }
  }

  result.pendingCount = pendingOperationCount();
  return result;
}
