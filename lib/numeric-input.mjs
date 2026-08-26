// دستور إدخال الأرقام: صياغة واحدة لتفسير ما يكتبه المستخدم في أي حقل رقمي.
//
// القاعدة: لا يُقرأ ما يكتبه المستخدم كرقم إلا عند إنهاء التحرير (blur/Enter)،
// لأن القراءة أثناء الكتابة تبتلع الكسور العشرية: Number('12.') === 12، فتُعاد
// كتابة الحقل بـ'12' وتُفقد النقطة قبل أن يُكمل المستخدم الرقم.
//
// هذه الوحدة نقية (بلا React وبلا Supabase) ليمكن اختبارها مباشرة، وتستهلكها
// components/NumericField.js وأي شاشة تحتاج نفس القاعدة بدل إعادة اختراعها.

const NUMERIC_PATTERN = /^-?(\d+(\.\d+)?|\.\d+)$/;

/**
 * يفسّر نص المستخدم رقمًا واحدًا نهائيًا.
 * @returns {{ valid: boolean, value: number|null }}
 *   valid=false تعني «هذا ليس رقمًا صالحًا» — لا تُكتب في قاعدة البيانات إطلاقًا.
 *   value=null تعني «فارغ عمدًا» (وهي حالة صالحة عندما allowEmpty).
 */
export function parseNumericDraft(raw, { allowEmpty = true } = {}) {
  const text = String(raw ?? '').trim().replace(/,/g, '');
  if (text === '') return { valid: allowEmpty, value: null };

  // نقطة عشرية معلّقة في نهاية الإدخال نيّة كتابة مكتملة: '12.' تعني 12.
  const normalized = text.replace(/\.$/, '');
  if (!NUMERIC_PATTERN.test(normalized)) return { valid: false, value: null };

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { valid: false, value: null };
  return { valid: true, value };
}

/** يحوّل قيمة الخادم إلى رقم أو null، بلا تفسير نصوص المستخدم. */
export function normalizeStoredNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * هل يستحق هذا الإدخال كتابة فعلية على قاعدة البيانات؟
 * يمنع UPDATE بلا تغيير — وهو ما كان يحدث مع كل ضغطة زر في جدول البنود.
 */
export function numericDraftNeedsWrite(draft, storedValue, options) {
  const parsed = parseNumericDraft(draft, options);
  if (!parsed.valid) return { write: false, valid: false, value: null };
  const stored = normalizeStoredNumber(storedValue);
  return { write: parsed.value !== stored, valid: true, value: parsed.value };
}
