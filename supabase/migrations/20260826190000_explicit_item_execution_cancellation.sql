-- م0 — إزالة الألغام: تسمية واحدة لإلغاء الإسناد، وحذف بند صريح لا يعتمد على Cascade خفي.
--
-- مشكلتان مرصودتان في المراجعة:
--
-- ١) الواجهة تستدعي fn_cancel_item_execution_assignment، والدالة المعرَّفة اسمها
--    fn_delete_item_execution_assignment. تحققنا من جسمها: دلالتها إلغاءٌ لا حذف —
--    ترفض أي إسناد له start_date أو end_date أو تشغيل يومي مسجَّل. فالاسم هو الخطأ،
--    لا السلوك. نعتمد الاسم الصحيح مصدرًا وحيدًا، ونبقي القديم غلافًا رقيقًا
--    للتوافق بدل تركه تطبيقًا ثانيًا يمكن أن يتباعد.
--
-- ٢) fn_delete_project_item_safely كانت تعدّ الإسنادات المخططة وتُرجع
--    cancelled_planned_assignments دون أن تلغي شيئًا — والحذف الفعلي كان يقع ضمنيًا
--    عبر ON DELETE CASCADE على item_execution في قاعدة الإنتاج. لا يجوز أن يعتمد
--    أثر مالي/تاريخي على Cascade خفي ثم يُسمّى إلغاءً. الآن الإلغاء صريح، ويمر
--    بنفس قاعدة بوابة الإلغاء (قاعدة واحدة في مكان واحد)، فإن رفضتها البوابة
--    رُفض الحذف كله وبقي البند وإسناداته كما هي.

-- 1) الاسم الدستوري للإلغاء: نفس السلوك المتحقَّق منه، باسم يطابق معناه.
create or replace function public.fn_cancel_item_execution_assignment(
  p_execution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec public.item_execution;
  v_item public.project_items;
begin
  if (select auth.uid()) is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_exec
  from public.item_execution
  where id = p_execution_id
  for update;

  if v_exec.id is null then
    raise exception 'إسناد التنفيذ غير موجود';
  end if;

  select * into v_item
  from public.project_items
  where id = v_exec.project_item_id;

  if not public.has_project_capability('projects.execution.edit', v_item.project_id, v_exec.planned_cost) then
    raise exception 'لا تملك صلاحية إلغاء إسناد هذا البند';
  end if;

  -- الإسناد الذي بدأ أو انتهى أو له أثر تشغيل يومي يبقى تاريخًا؛ يُنهى ولا يُلغى.
  if v_exec.start_date is not null then
    raise exception 'بدأ تنفيذ هذا الإسناد ولا يجوز إلغاؤه؛ استخدم إنهاء الإسناد للحفاظ على التاريخ';
  end if;
  if v_exec.end_date is not null then
    raise exception 'الإسناد منتهٍ ولا يجوز حذف سجله التاريخي';
  end if;
  if exists(
    select 1
    from public.day_items di
    where di.project_item_id = v_exec.project_item_id
      and not di.contractor_id is distinct from v_exec.contractor_id
  ) then
    raise exception 'يوجد تشغيل يومي مسجل لهذا الإسناد؛ لا يجوز إلغاؤه';
  end if;

  delete from public.item_execution where id = v_exec.id;

  return jsonb_build_object(
    'ok', true,
    'cancelled', true,
    'execution_id', v_exec.id,
    'project_item_id', v_exec.project_item_id,
    'contractor_id', v_exec.contractor_id
  );
end
$$;

revoke execute on function public.fn_cancel_item_execution_assignment(uuid) from public, anon;
grant execute on function public.fn_cancel_item_execution_assignment(uuid) to authenticated;
comment on function public.fn_cancel_item_execution_assignment(uuid) is
  'البوابة الوحيدة لإلغاء إسناد تنفيذ لم يبدأ. أي إسناد بدأ أو انتهى أو له تشغيل يومي يبقى تاريخيًا ويُنهى ولا يُلغى.';

-- الاسم القديم يبقى للتوافق فقط، غلافًا لا تطبيقًا ثانيًا.
create or replace function public.fn_delete_item_execution_assignment(
  p_execution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.fn_cancel_item_execution_assignment(p_execution_id);
end
$$;

revoke execute on function public.fn_delete_item_execution_assignment(uuid) from public, anon;
grant execute on function public.fn_delete_item_execution_assignment(uuid) to authenticated;
comment on function public.fn_delete_item_execution_assignment(uuid) is
  'اسم قديم متوافق فقط — يفوّض بالكامل إلى fn_cancel_item_execution_assignment. لا منطق هنا.';

-- 2) حذف البند: الإلغاء صريح، وما بدأ فعلًا يمنع الحذف.
create or replace function public.fn_delete_project_item_safely(p_project_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.project_items%rowtype;
  v_started_exec integer := 0;
  v_day_items integer := 0;
  v_measurements integer := 0;
  v_claim_lines integer := 0;
  v_cost_allocations integer := 0;
  v_contractor_expenses integer := 0;
  v_custody_transactions integer := 0;
  v_progress_entries integer := 0;
  v_change_events integer := 0;
  v_planned_id uuid;
  v_cancelled integer := 0;
  v_deleted uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_item
  from public.project_items
  where id = p_project_item_id
  for update;

  if v_item.id is null then
    raise exception 'البند غير موجود أو تم حذفه بالفعل';
  end if;

  if not public.has_project_capability('projects.scope.edit', v_item.project_id, v_item.contract_value) then
    raise exception 'لا تملك صلاحية حذف هذا البند';
  end if;

  select count(*) into v_started_exec
  from public.item_execution
  where project_item_id = p_project_item_id
    and (start_date is not null or end_date is not null);

  select count(*) into v_day_items from public.day_items where project_item_id = p_project_item_id;
  select count(*) into v_measurements from public.item_measurements where project_item_id = p_project_item_id;
  select count(*) into v_claim_lines from public.claim_lines where project_item_id = p_project_item_id;
  select count(*) into v_cost_allocations from public.project_cost_allocations where project_item_id = p_project_item_id;
  select count(*) into v_contractor_expenses from public.contractor_expenses where project_item_id = p_project_item_id;
  select count(*) into v_custody_transactions from public.custody_transactions where project_item_id = p_project_item_id;
  select count(*) into v_progress_entries from public.progress_entries where project_item_id = p_project_item_id;
  select count(*) into v_change_events from public.project_change_events where project_item_id = p_project_item_id;

  if v_started_exec > 0 then
    raise exception 'لا يمكن حذف البند لأن له تاريخ تنفيذ بدأ فعليًا. أنهِ الإسناد واحتفظ بالسجل التاريخي.';
  end if;
  if v_day_items > 0 then
    raise exception 'لا يمكن حذف البند لأنه مرتبط بحركات أو إنجاز يومي.';
  end if;
  if v_measurements > 0 then
    raise exception 'لا يمكن حذف البند لأنه مرتبط بقياسات إنجاز.';
  end if;
  if v_claim_lines > 0 then
    raise exception 'لا يمكن حذف البند لأنه دخل في مستخلص.';
  end if;
  if v_cost_allocations > 0 then
    raise exception 'لا يمكن حذف البند لأنه مرتبط بتوزيعات تكلفة.';
  end if;
  if v_contractor_expenses > 0 then
    raise exception 'لا يمكن حذف البند لأنه مرتبط بمصروفات مقاول.';
  end if;
  if v_custody_transactions > 0 then
    raise exception 'لا يمكن حذف البند لأنه مرتبط بحركات عهدة.';
  end if;
  if v_progress_entries > 0 then
    raise exception 'لا يمكن حذف البند لأنه مرتبط بسجل إنجاز.';
  end if;
  if v_change_events > 0 then
    raise exception 'لا يمكن حذف البند لأنه مرتبط بسجل تغييرات المشروع.';
  end if;

  -- الإلغاء صريح عبر البوابة نفسها: قاعدة واحدة تحكم إلغاء الإسناد أينما وقع.
  -- أي إسناد ترفضه البوابة يُفشل المعاملة كلها، فلا يُحذف البند ولا يضيع إسناده.
  for v_planned_id in
    select id from public.item_execution
    where project_item_id = p_project_item_id
    order by id
    for update
  loop
    perform public.fn_cancel_item_execution_assignment(v_planned_id);
    v_cancelled := v_cancelled + 1;
  end loop;

  delete from public.project_items
  where id = p_project_item_id
  returning id into v_deleted;

  if v_deleted is null then
    raise exception 'لم يُحذف البند؛ أعد تحميل الصفحة وحاول مرة أخرى';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'project_item_id', v_deleted,
    'cancelled_planned_assignments', v_cancelled
  );
end
$function$;

revoke all on function public.fn_delete_project_item_safely(uuid) from public;
grant execute on function public.fn_delete_project_item_safely(uuid) to authenticated;
comment on function public.fn_delete_project_item_safely(uuid) is
  'يحذف بندًا لا أثر تشغيليًا له، بعد إلغاء إسناداته المخططة صراحةً عبر بوابة الإلغاء — لا اعتماد على ON DELETE CASCADE. cancelled_planned_assignments يعكس إلغاءً وقع فعلًا.';
