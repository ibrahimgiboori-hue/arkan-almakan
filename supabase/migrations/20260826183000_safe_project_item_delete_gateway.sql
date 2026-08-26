create or replace function public.fn_delete_project_item_safely(p_project_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.project_items%rowtype;
  v_started_exec integer := 0;
  v_planned_exec integer := 0;
  v_day_items integer := 0;
  v_measurements integer := 0;
  v_claim_lines integer := 0;
  v_cost_allocations integer := 0;
  v_contractor_expenses integer := 0;
  v_custody_transactions integer := 0;
  v_progress_entries integer := 0;
  v_change_events integer := 0;
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

  select
    count(*) filter (where start_date is not null or end_date is not null),
    count(*) filter (where start_date is null and end_date is null)
  into v_started_exec, v_planned_exec
  from public.item_execution
  where project_item_id = p_project_item_id;

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

  delete from public.project_items
  where id = p_project_item_id
  returning id into v_deleted;

  if v_deleted is null then
    raise exception 'لم يُحذف البند؛ أعد تحميل الصفحة وحاول مرة أخرى';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'project_item_id', v_deleted,
    'cancelled_planned_assignments', v_planned_exec
  );
end
$function$;

revoke all on function public.fn_delete_project_item_safely(uuid) from public;
grant execute on function public.fn_delete_project_item_safely(uuid) to authenticated;
