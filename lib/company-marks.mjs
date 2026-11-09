// ختم الشركة وتوقيع المدير — قواعد بلا شبكة.
// المسار «company-marks/…» يعني الخزنة الخاصة (رابط موقّع قصير لصاحب الصلاحية فقط).
// أي مسار آخر نسخة قديمة في مخزن الهوية العام، تبقى تعمل إلى أن يعيد المدير رفعها.

export const COMPANY_MARKS_BUCKET = 'company-marks';
export const COMPANY_MARK_PREFIX = `${COMPANY_MARKS_BUCKET}/`;
export const COMPANY_MARK_FILES = Object.freeze({ stamp_image_path: 'stamp', signature_image_path: 'signature' });
export const COMPANY_MARK_SIGNED_SECONDS = 60 * 30;

export function isPrivateMarkPath(path) {
  return String(path || '').startsWith(COMPANY_MARK_PREFIX);
}

/** Where a stored mark path lives: { bucket, key, private }. */
export function companyMarkLocation(path) {
  const value = String(path || '').trim();
  if (!value) return null;
  if (isPrivateMarkPath(value)) return Object.freeze({ bucket: COMPANY_MARKS_BUCKET, key: value.slice(COMPANY_MARK_PREFIX.length), private: true });
  return Object.freeze({ bucket: 'brand', key: value, private: false });
}

/** The private path a freshly uploaded mark gets (column → «company-marks/stamp.png»). */
export function privateMarkPath(column, fileName = '') {
  const base = COMPANY_MARK_FILES[column];
  if (!base) throw new Error('عمود صورة غير معروف للختم أو التوقيع.');
  const ext = String(fileName).split('.').pop().toLowerCase();
  const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'png';
  return `${COMPANY_MARK_PREFIX}${base}.${safeExt}`;
}

/** Marks still served from the public identity store (a risk the settings page shows). */
export function exposedCompanyMarks(settings = {}) {
  return Object.keys(COMPANY_MARK_FILES).filter((column) => settings?.[column] && !isPrivateMarkPath(settings[column]));
}
