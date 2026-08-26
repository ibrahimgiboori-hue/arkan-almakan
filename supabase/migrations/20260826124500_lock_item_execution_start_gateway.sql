-- لا يجوز لحفظ قرار الإسناد أن يبدأ التنفيذ ضمنيًا.
-- start_date التاريخ الفعلي يملكه fn_start_item_execution_assignment فقط.

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
    if p_start_date is not null then
      raise exception 'احفظ الإسناد أولاً ثم استخدم إجراء بدء التنفيذ لتسجيل تاريخ البدء الفعلي';
    end if;

    insert into public.item_execution(
      project_item_id, mode, contractor_id, agreed_rate,
      worker_daily, tech_daily, target_output, shortfall_deduction,
      planned_cost, share_qty, share_percent, start_date, notes,
      decided_by, decided_at
    ) values (
      p_project_item_id, p_mode, p_contractor_id, p_agreed_rate,
      p_worker_daily, p_tech_daily, p_target_output, p_shortfall_deduction,
      p_planned_cost, p_share_qty, p_share_percent, null, nullif(btrim(p_notes),''),
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
    if p_start_date is not null and p_start_date is distinct from v_exec.start_date then
      raise exception 'تاريخ بدء التنفيذ لا يعدل من قرار الإسناد؛ استخدم إجراء البدء/التصحيح المخصص';
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
        -- start_date محفوظ كما هو؛ بوابة البدء هي المالكة لهذا الحقل.
        start_date = v_exec.start_date,
        notes = nullif(btrim(p_notes),''),
        decided_by = (select auth.uid()),
        decided_at = now()
    where id = p_execution_id
    returning * into v_exec;
  end if;

  return to_jsonb(v_exec);
end
$$;

comment on function public.fn_save_item_execution_assignment(uuid,public.exec_mode,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,date,text,uuid) is
  'بوابة حفظ/تعديل قرار إسناد التنفيذ فقط. لا تبدأ التنفيذ ولا تغيّر start_date؛ البدء يمر حصريًا عبر fn_start_item_execution_assignment.';
