-- ============================================================================
-- تصحيح أمني: إغلاق ثغرة تسريب بيانات حقيقية + تثبيت search_path على دوال
-- بلا صفة SECURITY DEFINER (تحصين وقائي منخفض المخاطر). لا يغيّر أي منطق
-- عمل قائم، ولا يمس أي جدول بيانات، ولا يكسر أي مسار حي مستخدم اليوم.
--
-- الخلفية (تحقّق مباشر على القاعدة الحية، لا تخمين):
-- 23 View بصفة SECURITY DEFINER (تتجاوز RLS لأنها تُنفَّذ بصلاحية منشئها)،
-- ودور anon (بلا أي تسجيل دخول) كان لديه GRANT SELECT عليها جميعًا بلا
-- استثناء. اثنتان منها (v_board_report, v_employee_report) تُستخدَمان مباشرة
-- في app/dashboard/board/page.js وapp/print/board/page.js وapp/print/
-- employees/page.js بلا أي فحص صلاحية قبل الجلب (فحص role هناك يتحكم فقط
-- بإظهار نموذج التعديل، لا بمنع القراءة) — أي طلب REST مباشر بمفتاح anon
-- العام (مفتاح عام بالتصميم، موجود في كود المتصفح) كان يستطيع سحب بيانات
-- هوية أعضاء مجلس الإدارة ونسب تملكهم وتقرير رواتب كامل الموظفين، بلا أي
-- تسجيل دخول إطلاقًا. هذا هو التصحيح العاجل الوحيد في هذه الدفعة.
--
-- ملاحظة نطاق: لا تُغلَق هنا صلاحية authenticated (أي مستخدم مسجّل دخول
-- بغض النظر عن دوره الوظيفي لا يزال يرى هذه التقارير) — لأن تضييقها يحتاج
-- قرارًا تنظيميًا (أي الأدوار يحق لها رؤية الرواتب الكاملة؟) لست أملك
-- تعريفه بنفسي دون توجيه صريح، وتخمينه قد يكسر وصولًا مشروعًا فعليًا
-- بالخطأ. الإغلاق الكامل لـanon هنا هو التصحيح غير القابل للنقاش.
-- ============================================================================

revoke all on table
  public.v_employee_report,
  public.v_day_attendance,
  public.v_day_output,
  public.v_day_expenses,
  public.v_week_totals,
  public.v_day_summary,
  public.v_week_summary,
  public.v_day_labor_value,
  public.v_day_piece_value,
  public.v_day_contractor_value,
  public.v_day_events,
  public.v_item_assignments,
  public.v_contractor_expense_split,
  public.v_item_execution_state,
  public.v_item_actual_vs_plan,
  public.v_item_daily_actuals,
  public.v_item_assignment_actuals,
  public.v_item_assignment_totals,
  public.v_item_cost_daily,
  public.v_recoverable_balance,
  public.v_board_report,
  public.v_contractor_expense_review,
  public.v_employee_expense_balances
from anon;

-- تنظيف صلاحيات ميتة بلا أثر وظيفي: INSERT/UPDATE/DELETE/TRUNCATE على View
-- عادي (بلا INSTEAD OF trigger) لا تنفّذ شيئًا أصلاً، لكن وجودها مضلِّل عند
-- المراجعة الأمنية. تُترك SELECT فقط لـauthenticated (وهي المستخدمة فعليًا).
revoke insert, update, delete, truncate, references, trigger on table
  public.v_employee_report,
  public.v_day_attendance,
  public.v_day_output,
  public.v_day_expenses,
  public.v_week_totals,
  public.v_day_summary,
  public.v_week_summary,
  public.v_day_labor_value,
  public.v_day_piece_value,
  public.v_day_contractor_value,
  public.v_day_events,
  public.v_item_assignments,
  public.v_contractor_expense_split,
  public.v_item_execution_state,
  public.v_item_actual_vs_plan,
  public.v_item_daily_actuals,
  public.v_item_assignment_actuals,
  public.v_item_assignment_totals,
  public.v_item_cost_daily,
  public.v_recoverable_balance,
  public.v_board_report,
  public.v_contractor_expense_review,
  public.v_employee_expense_balances
from authenticated;

-- ----------------------------------------------------------------------------
-- تثبيت search_path لـ31 دالة (لا SECURITY DEFINER فيها — خطورة أقل من
-- الفئة أعلاه، لأنها تُنفَّذ بصلاحية المستدعي أصلًا لا صلاحية مرتفعة، لكنها
-- ثغرة تحصين وقائي حقيقية إن زُرع كائن بنفس الاسم مبكرًا في مسار البحث).
-- ALTER FUNCTION ... SET search_path لا يغيّر جسم الدالة ولا سلوكها طالما
-- كل الكائنات التي تستخدمها فعليًا داخل public/private أصلًا.
-- ----------------------------------------------------------------------------

alter function public.default_party_card(text) set search_path = 'public', 'pg_temp';
alter function public.fn_get_or_create_day(uuid, date) set search_path = 'public', 'pg_temp';
alter function public.arkan_week_start(date) set search_path = 'public', 'pg_temp';
alter function public.is_back_office() set search_path = 'public', 'pg_temp';
alter function public.fn_touch_updated_at() set search_path = 'public', 'pg_temp';
alter function public.quote_lines_numbered(uuid) set search_path = 'public', 'pg_temp';
alter function public.quote_title_subtotals(uuid) set search_path = 'public', 'pg_temp';
alter function public.item_has_decision(uuid) set search_path = 'public', 'pg_temp';
alter function public.warn_materials_scope() set search_path = 'public', 'pg_temp';
alter function public.default_charge_to() set search_path = 'public', 'pg_temp';
alter function public.employee_seq(text) set search_path = 'public', 'pg_temp';
alter function public.sync_payroll_flag() set search_path = 'public', 'pg_temp';
alter function public.has_parties(jsonb) set search_path = 'public', 'pg_temp';
alter function public.week_start(date) set search_path = 'public', 'pg_temp';
alter function public.fn_next_settlement_no() set search_path = 'public', 'pg_temp';
alter function public.tg_item_execution_guard() set search_path = 'public', 'pg_temp';
alter function public.calc_claim_vat() set search_path = 'public', 'pg_temp';
alter function public.set_candidate_response_due() set search_path = 'public', 'pg_temp';
alter function public.attendance_day_factor(attend_status) set search_path = 'public', 'pg_temp';
alter function public.fn_settlement_preview(uuid, uuid, date, date, text) set search_path = 'public', 'pg_temp';
alter function public.validate_employee_org_path() set search_path = 'public', 'pg_temp';
alter function public.validate_employee_board_position() set search_path = 'public', 'pg_temp';
alter function public.sync_employee_expense_reimbursement() set search_path = 'public', 'pg_temp';
alter function public.fn_update_project_expense(uuid, date, numeric, text, text, uuid, uuid, text, uuid) set search_path = 'public', 'pg_temp';
alter function public.fn_record_employee_reimbursement(uuid, uuid, numeric, date, text, text, text) set search_path = 'public', 'pg_temp';
alter function public.fn_bulk_save_project_expenses(uuid, uuid, jsonb) set search_path = 'public', 'pg_temp';

alter function private.fn_route_source_destination(text) set search_path = 'public', 'private', 'pg_temp';
alter function private.fn_procedure_operation_role(text) set search_path = 'public', 'private', 'pg_temp';
alter function private.fn_destination_module(text) set search_path = 'public', 'private', 'pg_temp';
alter function private.fn_transaction_key_for_source(text) set search_path = 'public', 'private', 'pg_temp';
alter function private.fn_destination_module_v2(text) set search_path = 'public', 'private', 'pg_temp';

-- ----------------------------------------------------------------------------
-- ما لم يُلمَس عمدًا في هذه الدفعة، ولماذا:
-- • 13 جدولاً RLS مفعّل بلا policy (منها transaction_register/movements):
--   هذا هو السلوك الآمن أصلاً (منع افتراضي)، وتحقّقت أن لا شاشة تقرأها
--   مباشرة (فقط عبر دوال RPC بصفة SECURITY DEFINER تتجاوز RLS بشكل مقصود
--   ومُتحكَّم فيه داخل الدالة نفسها). كتابة policies تخمينية هنا مخاطرة
--   حقيقية (فتح غير مقصود) أكبر من فائدة إسكات تنبيه INFO.
-- • حماية كلمات المرور المسرّبة (HaveIBeenPwned) في Auth: إعداد على مستوى
--   خدمة Auth نفسها، لا عمود/جدول SQL يمكن تعديله بـmigration — يُفعَّل من
--   Supabase Dashboard → Authentication → Policies مباشرة.
-- • project_cashflow_timing (عمود "لها توقيت" في تبويب التخطيط): ليست
--   عطلاً حيًا بل ميزة لم تُوصَل لواجهة إدخال قط — تحتاج قرار تصميم شاشة
--   إدخال (أين/كيف) قبل أي كود، وليست إصلاح خطأ بمعنى دقيق.
-- ============================================================================
