// نصوص واجهة فقط؛ لا قرارات صلاحيات هنا.
export function dashboardDeniedMessage(reason) {
  if (reason === 'user_lookup_failed') return 'تعذر التحقق من الحساب.';
  return 'حسابك غير مهيأ لاستخدام النظام حاليًا.';
}
