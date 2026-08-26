// دستور الكتابة المحروسة: نجاح الاستدعاء ليس دليلًا على أن شيئًا تغيّر.
//
// عندما تُحرَس عملية بشرط حالة — مثل
//   .update({status:'settled'}).eq('id',x).eq('status','open')
// فإن صفًا سبق أن غيّر أحدهم حالته يُنتج error=null و data=null معًا.
// فحص error وحده يجعل الشاشة تقول «تمت العملية» بينما لم يتغيّر شيء،
// وهو أخطر من رسالة خطأ صريحة: المستخدم يغادر وهو يظن أن تصحيحه حُفظ.
//
// هذه الوحدة نقية (بلا Supabase) ليمكن اختبارها مباشرة.

/**
 * يفسّر نتيجة كتابة محروسة تُرجع الصفوف المتأثرة (‎.select()‎).
 * @param {{error?: any, data?: any}} result نتيجة supabase كما هي.
 * @param {{conflictMessage: string}} options رسالة تُقال عندما لم يتغيّر أي صف.
 * @returns {{ ok: boolean, changedRows: number, message: string|null }}
 */
export function interpretGuardedWrite(result, { conflictMessage }) {
  if (!conflictMessage) {
    throw new Error('interpretGuardedWrite: conflictMessage is required');
  }
  const { error, data } = result || {};
  if (error) return { ok: false, changedRows: 0, message: error.message || String(error) };

  const changedRows = Array.isArray(data) ? data.length : (data ? 1 : 0);
  if (changedRows === 0) return { ok: false, changedRows: 0, message: conflictMessage };

  return { ok: true, changedRows, message: null };
}
