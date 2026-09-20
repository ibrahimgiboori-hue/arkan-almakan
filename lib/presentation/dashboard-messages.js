// نصوص واجهة فقط؛ لا قرارات صلاحيات هنا.
export function dashboardDeniedMessage(reason) {
  if (reason === 'user_lookup_failed') return 'تعذر التحقق من الحساب.';
  if (reason === 'tenant_lookup_failed') return 'تعذر التحقق من المنشأة المرتبطة بحسابك.';
  if (reason === 'organization_unassigned') return 'حسابك غير مرتبط بمنشأة نشطة حتى الآن.';
  return 'حسابك غير مهيأ لاستخدام النظام حاليًا.';
}
