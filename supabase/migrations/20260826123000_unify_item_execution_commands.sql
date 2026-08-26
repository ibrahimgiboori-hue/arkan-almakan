-- دستور التشغيل: item_execution هو سجل إسناد التنفيذ الزمني على مستوى البند،
-- و project_contractors هو ملف/اتفاق المقاول الحالي داخل المشروع، وليس سجل تاريخ التنفيذ.
-- هذه الهجرة توحد بوابات الحفظ/البدء/الإنهاء وتحافظ على الدوال القديمة كأغلفة آمنة.

comment on table public.project_contractors is
  'ملف واتفاق المقاول الحالي داخل المشروع (الشروط والتكاليف الافتراضية). ليس مصدر التاريخ التفصيلي لتنفيذ البنود؛ item_execution هو سجل التنفيذ الزمني.';
comment on table public.item_execution is
  'إسنادات تنفيذ البنود عبر الزمن. قد يوجد أكثر من إسناد للبند نفسه عبر الزمن أو لمقاولين مختلفين بحسب الحصة.';

create or replace view public.v_item_execution_assignments
with (security_invoker = true)
as
select
  ie.id,
  ie.project_item_id,
  pi.project_id,
  pi.sort_order,
  pi.description_ar,
  pi.unit,
  pi.contract_qty,
  ie.mode,
  ie.contractor_id,
  c.name_ar as contractor_name,
  c.operation_alias as contractor_alias,
  ie.agreed_rate,
  ie.worker_daily,
  ie.tech_daily,
  ie.target_output,
  ie.shortfall_deduction,
  ie.planned_cost,
  ie.share_qty,
  ie.share_percent,
  ie.share_note,
  ie.start_date,
  ie.end_date,
  ie.is_active,
  ie.closing_qty,
  ie.end_reason,
  ie.notes,
  ie.decided_by,
  ie.decided_at,
  case
    when ie.end_date is not null then 'done'::text
    when ie.start_date is not null and ie.is_active then 'active'::text
    when ie.start_date is not null then 'paused'::text
    else 'planned'::text
  end as status
from public.item_execution ie
join public.project_items pi on pi.id = ie.project_item_id
left join public.contractors c on c.id = ie.contractor_id;

grant select on public.v_item_execution_assignments to authenticated;
grant select on public.v_item_execution_assignments to service_role;
comment on view public.v_item_execution_assignments is
  'النموذج المقروء على مستوى إسناد التنفيذ نفسه؛ لا يختزل عدة إسنادات للبند إلى صف واحد.';

create or replace function public.fn_attach_contractor_to_project(
  p_project_id uuid,
  p_contractor_id uuid,
  p_start_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contractor public.contractors;
  v_id uuid;
  v_basis public.pay_basis;
begin
  if (select auth.uid()) is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  -- محرر التنفيذ كان يستطيع فعليًا إنشاء علاقة المشروع/المقاول عبر دوال البدء القديمة؛
  -- السماح هنا لا يوسع صلاحية فعلية بل يوحدها في بوابة واحدة.
  if not (
    public.has_project_capability('projects.contractors.assign', p_project_id, null)
    or public.has_project_capability('projects.execution.edit', p_project_id, null)
  ) then
    raise exception 'لا تملك صلاحية إسناد مقاول لهذا المشروع';
  end if;

  select * into v_contractor
  from public.contractors
  where id = p_contractor_id and is_active = true;
  if v_contractor.id is null then
    raise exception 'المقاول غير موجود أو غير نشط';
  end if;
  if not exists(select 1 from public.projects where id = p_project_id) then
    raise exception 'المشروع غير موجود';
  end if;

  v_basis := case coalesce(v_contractor.default_basis, '')
    when 'بالراتب' then 'salary'::public.pay_basis
    when 'بالمتر' then 'piecework'::public.pay_basis
    when 'مقطوعية' then 'piecework'::public.pay_basis
    else 'daily'::public.pay_basis
  end;

  insert into public.project_contractors(
    project_id, contractor_id, basis,
    worker_daily, tech_daily,
    transport_charge_to, meals_charge_to, housing_charge_to, tools_charge_to,
    start_date, is_active
  ) values (
    p_project_id, p_contractor_id, v_basis,
    v_contractor.worker_daily, v_contractor.tech_daily,
    v_contractor.transport_charge_to, v_contractor.meals_charge_to,
    v_contractor.housing_charge_to, v_contractor.tools_charge_to,
    coalesce(p_start_date, current_date), true
  )
  on conflict(project_id, contractor_id) do update
  set is_active = true,
      end_date = null,
      -- start_date هنا يعني أول ارتباط إداري محفوظ، لا فترة تنفيذ تفصيلية.
      start_date = least(public.project_contractors.start_date, excluded.start_date),
      worker_daily = coalesce(public.project_contractors.worker_daily, excluded.worker_daily),
      tech_daily = coalesce(public.project_contractors.tech_daily, excluded.tech_daily),
      transport_charge_to = coalesce(public.project_contractors.transport_charge_to, excluded.transport_charge_to),
      meals_charge_to = coalesce(public.project_contractors.meals_charge_to, excluded.meals_charge_to),
      housing_charge_to = coalesce(public.project_contractors.housing_charge_to, excluded.housing_charge_to),
      tools_charge_to = coalesce(public.project_contractors.tools_charge_to, excluded.tools_charge_to)
  returning id into v_id;

  return v_id;
end
$$;

revoke execute on function public.fn_attach_contractor_to_project(uuid,uuid,date) from public, anon;
grant execute on function public.fn_attach_contractor_to_project(uuid,uuid,date) to authenticated;

create or replace function public.fn_save_item_execution_assignment(
  p_project_item_id uuid,
  p_mode public.exec_mode,
  p_contractor_id uuid default null,
  p_agreed_rate numeric default null,
  p_worker_daily numeric default null,
  p_tech_daily numeric default null,
  p_target_output numeric default null,
  p_shortfall_deduction numeric default null,
  p_planned_cost numeric default null,
  p_share_qty numeric default null,
  p_share_percent numeric default null,
  p_start_date date default null,
  p_notes text default null,
  p_execution_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.project_items;
  v_exec public.item_execution;
begin
  if (select auth.uid()) is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_item
  from public.project_items
  where id = p_project_item_id;
  if v_item.id is null then
    raise exception 'البند غير موجود';
  end if;
  if not public.has_project_capability('projects.execution.edit', v_item.project_id, p_planned_cost) then
    raise exception 'لا تملك صلاحية تعديل قرار تنفيذ هذا البند';
  end if;

  if p_contractor_id is not null and not exists(
    select 1 from public.contractors where id = p_contractor_id and is_active = true
  ) then
    raise exception 'المقاول غير موجود أو غير نشط';
  end if;

  if p_execution_id is null then
    insert into public.item_execution(
      project_item_id, mode, contractor_id, agreed_rate,
      worker_daily, tech_daily, target_output, shortfall_deduction,
      planned_cost, share_qty, share_percent, start_date, notes,
      decided_by, decided_at
    ) values (
      p_project_item_id, p_mode, p_contractor_id, p_agreed_rate,
      p_worker_daily, p_tech_daily, p_target_output, p_shortfall_deduction,
      p_planned_cost, p_share_qty, p_share_percent, p_start_date, nullif(btrim(p_notes),''),
      (select auth.uid()), now()
    )
    returning * into v_exec;
  else
    select * into v_exec
    from public.item_execution
    where id = p_execution_id
    for update;

    if v_exec.id is null then
      raise exception 'إسناد التنفيذ غير موجود';
    end if;
    if v_exec.project_item_id <> p_project_item_id then
      raise exception 'إسناد التنفيذ لا يتبع هذا البند';
    end if;
    if v_exec.end_date is not null then
      raise exception 'الإسناد منتهٍ ولا يمكن تعديل قرار تنفيذه';
    end if;

    update public.item_execution
    set mode = p_mode,
        contractor_id = p_contractor_id,
        agreed_rate = p_agreed_rate,
        worker_daily = p_worker_daily,
        tech_daily = p_tech_daily,
        target_output = p_target_output,
        shortfall_deduction = p_shortfall_deduction,
        planned_cost = p_planned_cost,
        share_qty = p_share_qty,
        share_percent = p_share_percent,
        start_date = p_start_date,
        notes = nullif(btrim(p_notes),''),
        decided_by = (select auth.uid()),
        decided_at = now()
    where id = p_execution_id
    returning * into v_exec;
  end if;

  return to_jsonb(v_exec);
end
$$;

revoke execute on function public.fn_save_item_execution_assignment(uuid,public.exec_mode,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,date,text,uuid) from public, anon;
grant execute on function public.fn_save_item_execution_assignment(uuid,public.exec_mode,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,date,text,uuid) to authenticated;
comment on function public.fn_save_item_execution_assignment(uuid,public.exec_mode,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,date,text,uuid) is
  'بوابة الكتابة الوحيدة الجديدة لقرار إسناد تنفيذ بند؛ تمنع الواجهة من الكتابة المباشرة على item_execution.';

create or replace function public.fn_start_item_execution_assignment(
  p_execution_id uuid,
  p_start_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec public.item_execution;
  v_item public.project_items;
  v_start date;
  v_existing_pc uuid;
  v_existing_active boolean;
  v_pc uuid;
  v_created boolean := false;
  v_reactivated boolean := false;
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
  if v_item.id is null then
    raise exception 'البند غير موجود';
  end if;
  if not public.has_project_capability('projects.execution.edit', v_item.project_id, v_exec.planned_cost) then
    raise exception 'لا تملك صلاحية بدء تنفيذ هذا البند';
  end if;
  if v_exec.end_date is not null then
    raise exception 'هذا الإسناد منتهٍ بتاريخ %', v_exec.end_date;
  end if;
  if v_exec.mode::text in ('piecework','sublet') and coalesce(v_exec.agreed_rate,0) <= 0 then
    raise exception 'هذا الإسناد بالمتر ولا سعر متفق عليه — أدخل السعر قبل البدء';
  end if;

  v_start := coalesce(
    p_start_date,
    v_exec.start_date,
    (select commencement_date from public.projects where id = v_item.project_id),
    (now() at time zone 'Asia/Riyadh')::date
  );

  update public.item_execution
  set start_date = v_start,
      is_active = true
  where id = v_exec.id;

  if v_exec.contractor_id is not null then
    select id, is_active into v_existing_pc, v_existing_active
    from public.project_contractors
    where project_id = v_item.project_id and contractor_id = v_exec.contractor_id;

    v_pc := public.fn_attach_contractor_to_project(v_item.project_id, v_exec.contractor_id, v_start);
    v_created := v_existing_pc is null;
    v_reactivated := v_existing_pc is not null and coalesce(v_existing_active,false) = false;
  end if;

  return jsonb_build_object(
    'ok', true,
    'execution_id', v_exec.id,
    'project_item_id', v_item.id,
    'project_id', v_item.project_id,
    'contractor_id', v_exec.contractor_id,
    'start_date', v_start,
    'project_contractor_id', v_pc,
    'created_project_contractor', v_created,
    'reactivated_project_contractor', v_reactivated,
    -- backward-compatible keys used by current screens
    'created_agreement', v_created,
    'created_week', false,
    'week_id', null
  );
end
$$;

revoke execute on function public.fn_start_item_execution_assignment(uuid,date) from public, anon;
grant execute on function public.fn_start_item_execution_assignment(uuid,date) to authenticated;
comment on function public.fn_start_item_execution_assignment(uuid,date) is
  'الأمر الدستوري لبدء إسناد تنفيذ محدد. المفتاح هو execution_id لأن البند قد يحمل عدة إسنادات.';

-- المسار القديم المعتمد على execution_id يصبح غلافًا مباشرًا للأمر الدستوري.
create or replace function public.start_item_assignment(
  p_exec uuid,
  p_start_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.fn_start_item_execution_assignment(p_exec, p_start_date);
end
$$;

-- المسار القديم المعتمد على project_item_id يبقى للتوافق فقط، لكنه يفشل بأمان عند الغموض.
create or replace function public.start_item_execution(
  p_item uuid,
  p_start_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id order by (start_date is not null) desc, decided_at desc)
    into v_ids
  from public.item_execution
  where project_item_id = p_item
    and end_date is null;

  if coalesce(cardinality(v_ids),0) = 0 then
    raise exception 'سجّل قرار التنفيذ لهذا البند أولاً';
  end if;
  if cardinality(v_ids) > 1 then
    raise exception 'يوجد أكثر من إسناد مفتوح لهذا البند؛ حدّد المقاول/الإسناد المطلوب قبل البدء';
  end if;

  return public.fn_start_item_execution_assignment(v_ids[1], p_start_date);
end
$$;

revoke execute on function public.start_item_assignment(uuid,date) from public, anon;
grant execute on function public.start_item_assignment(uuid,date) to authenticated;
revoke execute on function public.start_item_execution(uuid,date) from public, anon;
grant execute on function public.start_item_execution(uuid,date) to authenticated;

create or replace function public.fn_finish_item_execution_assignment(
  p_execution_id uuid,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec public.item_execution;
  v_item public.project_items;
  v_end date;
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

  select * into v_item from public.project_items where id = v_exec.project_item_id;
  if not public.has_project_capability('projects.execution.edit', v_item.project_id, v_exec.planned_cost) then
    raise exception 'لا تملك صلاحية إنهاء تنفيذ هذا البند';
  end if;
  if v_exec.end_date is not null then
    raise exception 'هذا الإسناد منتهٍ أصلاً بتاريخ %', v_exec.end_date;
  end if;

  v_end := coalesce(p_end_date, (now() at time zone 'Asia/Riyadh')::date);
  if v_exec.start_date is not null and v_end < v_exec.start_date then
    raise exception 'تاريخ الإنهاء قبل تاريخ البدء';
  end if;

  update public.item_execution
  set end_date = v_end,
      is_active = false
  where id = v_exec.id;

  return jsonb_build_object('ok',true,'execution_id',v_exec.id,'end_date',v_end);
end
$$;

revoke execute on function public.fn_finish_item_execution_assignment(uuid,date) from public, anon;
grant execute on function public.fn_finish_item_execution_assignment(uuid,date) to authenticated;

create or replace function public.finish_item_execution(
  p_item uuid,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id order by (start_date is not null) desc, decided_at desc)
    into v_ids
  from public.item_execution
  where project_item_id = p_item
    and end_date is null;

  if coalesce(cardinality(v_ids),0) = 0 then
    raise exception 'لا يوجد إسناد تنفيذ مفتوح لهذا البند';
  end if;
  if cardinality(v_ids) > 1 then
    raise exception 'يوجد أكثر من إسناد مفتوح لهذا البند؛ حدّد الإسناد المطلوب قبل الإنهاء';
  end if;

  return public.fn_finish_item_execution_assignment(v_ids[1], p_end_date);
end
$$;

revoke execute on function public.finish_item_execution(uuid,date) from public, anon;
grant execute on function public.finish_item_execution(uuid,date) to authenticated;
