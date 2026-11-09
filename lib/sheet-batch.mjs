/**
 * Saving a sheet: every new row goes through the screen's own verified write
 * (one row at a time, so receipts and the offline queue keep working), and the
 * batch stops at the first row that fails so nothing is saved twice on retry.
 *
 * Pure orchestration: no React, no Supabase.
 */
export async function saveSheetRows(rows = [], saveOne) {
  const saved = [];
  let failure = null;
  let pendingCount = 0;
  for (const row of rows) {
    try {
      const result = await saveOne(row);
      saved.push({ row, result });
      if (typeof result?.pendingCount === 'number') pendingCount = result.pendingCount;
    } catch (error) {
      failure = { row, error };
      break;
    }
  }
  return Object.freeze({
    saved,
    failure,
    verified: saved.filter((entry) => entry.result?.status === 'verified').length,
    queued: saved.filter((entry) => entry.result?.status === 'queued').length,
    pendingCount,
  });
}

/** One Arabic line describing a batch result for the screen's feedback area. */
export function sheetBatchMessage(result, noun = 'صف') {
  const parts = [];
  if (result.verified) parts.push(`حُفظ ${result.verified} ${noun} في قاعدة البيانات`);
  if (result.queued) parts.push(`${result.queued} محفوظ على هذا الجهاز وينتظر الاتصال`);
  if (result.failure) parts.push(`توقف الحفظ عند صف لم يُقبل: ${result.failure.error?.message || result.failure.error}`);
  return parts.join(' · ') || 'لا توجد صفوف جديدة جاهزة للحفظ.';
}
