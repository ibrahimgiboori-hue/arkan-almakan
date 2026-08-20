-- تعديل واضح وآمن لبطاقة العامل وارتباطه بالمشروع، مع حفظ الأثر الداخلي.

create table if not exists public.labor_assignment_audit (
  id bigint generated always as identity primary key,
  laborer_id uuid not null references public.laborers(id),
  assignment_id uuid not null references public.labor_project_assignments(id),
  action text not null default 'update',
  old_data jsonb not null,
  new_data jsonb not null,
  reason text not null,
  actor_user_id uuid,
  actor_role text,
  at timestamptz not null default now(),
  constraint labor_assignment_audit_action_check check (action in ('update','backfill_correction'))
);

create index if not exists labor_assignment_audit_laborer_idx
  on public.labor_assignment_audit (laborer_id, at desc);
create index if not exists labor_assignment_audit_assignment_idx
  on public.labor_assignment_audit (assignment_id, at desc);

alter table public.labor_assignment_audit enable row level security;

drop policy if exists labor_assignment_audit_admin_read on public.labor_assignment_audit;
create policy labor_assignment_audit_admin_read on public.labor_assignment_audit
  for select to authenticated
  using ((select public.current_app_role()) in (
    'ceo'::public.user_role,
    'hr'::public.user_role,
    'accountant'::public.user_role
  ));

revoke all on public.labor_assignment_audit from public, anon;
grant select on public.labor_assignment_audit to authenticated;
grant all on public.labor_assignment_audit to service_role;

create or replace function public.fn_update_labor_assignment(
  p_assignment_id uuid,
  p_full_name text,
  p_labor_class public.labor_class,
  p_trade text,
  p_pay_basis public.pay_basis,
  p_daily_rate numeric,
  p_monthly_salary numeric,
  p_salary_days integer,
  p_piece_rate numeric,
  p_piece_unit text,
  p_valid_from date,
  p_valid_to date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce((select public.current_app_role())::text, '');
  v_assignment public.labor_project_assignments;
  v_old jsonb;
  v_new jsonb;
  v_first_attendance date;
  v_last_attendance date;
  v_effective_rate numeric;
  v_is_latest boolean;
begin
  if (select auth.uid()) is null or v_role not in ('ceo','hr','accountant') then
    raise exception 'غير مصرح بتعديل بيانات العمالة';
  end if;
  if char_length(btrim(coalesce(p_full_name,''))) < 2 then
    raise exception 'اسم العامل مطلوب';
  end if;
  if p_valid_from is null or (p_valid_to is not null and p_valid_to < p_valid_from) then
    raise exception 'تاريخ بداية أو نهاية الارتباط غير صحيح';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'اكتب سببًا واضحًا للتعديل';
  end if;
  if p_pay_basis = 'daily'::public.pay_basis and coalesce(p_daily_rate,0) <= 0 then
    raise exception 'أدخل اليومية الصحيحة';
  end if;
  if p_pay_basis = 'salary'::public.pay_basis and (
    coalesce(p_monthly_salary,0) <= 0 or coalesce(p_salary_days,0) not between 1 and 31
  ) then
    raise exception 'أدخل الراتب الشهري وأيام القسمة بصورة صحيحة';
  end if;
  if p_pay_basis = 'piecework'::public.pay_basis and coalesce(p_piece_rate,0) <= 0 then
    raise exception 'أدخل سعر الوحدة الصحيح';
  end if;

  select * into v_assignment
  from public.labor_project_assignments a
  where a.id = p_assignment_id
  for update;
  if v_assignment.id is null then
    raise exception 'سجل ارتباط العامل غير موجود';
  end if;

  select min(d.work_date), max(d.work_date)
    into v_first_attendance, v_last_attendance
  from public.attendance a
  join public.timesheet_days d on d.id = a.day_id
  where a.laborer_id = v_assignment.laborer_id
    and d.project_id = v_assignment.project_id;

  if v_first_attendance is not null and p_valid_from > v_first_attendance then
    raise exception 'لا يمكن جعل البداية بعد أول حضور مسجل (%)', v_first_attendance;
  end if;
  if v_last_attendance is not null and p_valid_to is not null and p_valid_to < v_last_attendance then
    raise exception 'لا يمكن جعل النهاية قبل آخر حضور مسجل (%)', v_last_attendance;
  end if;

  if exists (
    select 1
    from public.labor_project_assignments x
    where x.laborer_id = v_assignment.laborer_id
      and x.id <> v_assignment.id
      and daterange(x.valid_from, coalesce(x.valid_to,'infinity'::date), '[]')
        && daterange(p_valid_from, coalesce(p_valid_to,'infinity'::date), '[]')
  ) then
    raise exception 'الفترة الجديدة تتداخل مع ارتباط آخر لنفس العامل';
  end if;

  v_effective_rate := case
    when p_pay_basis = 'daily'::public.pay_basis then p_daily_rate
    when p_pay_basis = 'salary'::public.pay_basis then p_monthly_salary / p_salary_days
    else null
  end;

  select jsonb_build_object(
    'laborer', to_jsonb(l),
    'assignment', to_jsonb(v_assignment)
  ) into v_old
  from public.laborers l
  where l.id = v_assignment.laborer_id;

  update public.labor_project_assignments
  set valid_from = p_valid_from,
      valid_to = p_valid_to,
      labor_class = p_labor_class,
      trade = nullif(btrim(p_trade),''),
      pay_basis = p_pay_basis,
      daily_rate = v_effective_rate,
      is_active = p_valid_to is null or p_valid_to >= (now() at time zone 'Asia/Riyadh')::date,
      source = 'manual_correction',
      notes = concat_ws(' | ', nullif(notes,''), 'تعديل: ' || btrim(p_reason))
  where id = v_assignment.id
  returning to_jsonb(labor_project_assignments) into v_new;

  select not exists (
    select 1 from public.labor_project_assignments x
    where x.laborer_id = v_assignment.laborer_id
      and x.id <> v_assignment.id
      and x.valid_from > p_valid_from
  ) into v_is_latest;

  update public.laborers
  set full_name = btrim(p_full_name),
      labor_class = case when v_is_latest then p_labor_class else labor_class end,
      trade = case when v_is_latest then nullif(btrim(p_trade),'') else trade end,
      pay_basis = case when v_is_latest then p_pay_basis else pay_basis end,
      daily_rate = case when v_is_latest and p_pay_basis in ('daily'::public.pay_basis,'salary'::public.pay_basis)
        then v_effective_rate else daily_rate end,
      monthly_salary = case when v_is_latest and p_pay_basis = 'salary'::public.pay_basis then p_monthly_salary else monthly_salary end,
      salary_days = case when v_is_latest and p_pay_basis = 'salary'::public.pay_basis then p_salary_days else salary_days end,
      piece_rate = case when v_is_latest and p_pay_basis = 'piecework'::public.pay_basis then p_piece_rate else piece_rate end,
      piece_unit = case when v_is_latest and p_pay_basis = 'piecework'::public.pay_basis then nullif(btrim(p_piece_unit),'') else piece_unit end,
      project_id = case when v_is_latest then v_assignment.project_id else project_id end,
      contractor_id = case when v_is_latest then v_assignment.contractor_id else contractor_id end,
      is_active = true
  where id = v_assignment.laborer_id;

  select jsonb_build_object(
    'laborer', to_jsonb(l),
    'assignment', v_new
  ) into v_new
  from public.laborers l
  where l.id = v_assignment.laborer_id;

  insert into public.labor_assignment_audit(
    laborer_id, assignment_id, action, old_data, new_data, reason, actor_user_id, actor_role
  ) values (
    v_assignment.laborer_id, v_assignment.id, 'update', v_old, v_new,
    btrim(p_reason), (select auth.uid()), v_role
  );

  return v_new;
end
$$;

revoke execute on function public.fn_update_labor_assignment(
  uuid,text,public.labor_class,text,public.pay_basis,numeric,numeric,integer,numeric,text,date,date,text
) from public, anon;
grant execute on function public.fn_update_labor_assignment(
  uuid,text,public.labor_class,text,public.pay_basis,numeric,numeric,integer,numeric,text,date,date,text
) to authenticated;

comment on function public.fn_update_labor_assignment(
  uuid,text,public.labor_class,text,public.pay_basis,numeric,numeric,integer,numeric,text,date,date,text
) is 'يعدل بطاقة العامل وارتباطه بالمشروع دون المساس بحركات الحضور المالية السابقة.';
comment on table public.labor_assignment_audit is 'سجل داخلي لتعديلات العمالة والارتباط بالمشروع؛ لا يظهر في المطبوعات.';
