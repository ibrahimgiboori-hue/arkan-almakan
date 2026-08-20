-- استعراض فترة آمن لبوابة المقاول، وسجل داخلي يحفظ أثر تسويات المصادر المالية.

create table if not exists public.financial_reconciliation_audit (
  id bigint generated always as identity primary key,
  reconciliation_ref text not null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  contractor_id uuid references public.contractors(id),
  project_id uuid references public.projects(id),
  source_name text not null,
  source_period_from date,
  source_period_to date,
  old_data jsonb,
  new_data jsonb,
  reason text not null,
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  constraint financial_reconciliation_entity_check
    check (entity_type in ('contractor_expense','contractor_advance','contractor_payment')),
  constraint financial_reconciliation_action_check
    check (action in ('insert','update','delete','confirm','exclude')),
  constraint financial_reconciliation_period_check
    check (source_period_to is null or source_period_from is null or source_period_to >= source_period_from)
);

create index if not exists financial_reconciliation_ref_idx
  on public.financial_reconciliation_audit (reconciliation_ref, recorded_at);
create index if not exists financial_reconciliation_scope_idx
  on public.financial_reconciliation_audit (contractor_id, project_id, recorded_at desc);

alter table public.financial_reconciliation_audit enable row level security;

drop policy if exists financial_reconciliation_admin_read on public.financial_reconciliation_audit;
create policy financial_reconciliation_admin_read on public.financial_reconciliation_audit
  for select to authenticated
  using ((select public.current_app_role()) in (
    'ceo'::public.user_role,
    'accountant'::public.user_role
  ));

revoke all on public.financial_reconciliation_audit from public, anon;
grant select on public.financial_reconciliation_audit to authenticated;
grant all on public.financial_reconciliation_audit to service_role;

comment on table public.financial_reconciliation_audit is
  'أثر داخلي لتصحيح البيانات المالية من المستندات الأصلية؛ لا يدخل التقارير المطبوعة.';

create or replace function public.fn_portal_period(
  p_project_id uuid,
  p_from date,
  p_to date
)
returns table (
  work_date date,
  laborer_id uuid,
  full_name text,
  labor_class public.labor_class,
  trade text,
  attendance_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.contractor_portal_accounts;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  select * into v_account
  from public.contractor_portal_accounts
  where auth_user_id = (select auth.uid()) and is_active;

  if v_account.id is null then
    raise exception 'حساب بوابة المقاول غير مفعل';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'فترة الاستعراض غير صحيحة';
  end if;
  if p_to > v_today then
    raise exception 'لا يمكن استعراض تاريخ مستقبلي';
  end if;
  if p_to - p_from > 61 then
    raise exception 'فترة الاستعراض لا تتجاوز 62 يومًا';
  end if;
  if not exists (
    select 1 from public.project_contractors pc
    where pc.project_id = p_project_id
      and pc.contractor_id = v_account.contractor_id
      and pc.is_active
  ) then
    raise exception 'هذا المشروع غير مفتوح لهذا المقاول';
  end if;

  return query
  with days as (
    select value::date as work_date
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as value
  ),
  eligible as (
    select
      d.work_date,
      l.id as laborer_id,
      l.full_name,
      coalesce(a.labor_class, l.labor_class) as labor_class,
      coalesce(a.trade, l.trade) as trade,
      row_number() over (
        partition by d.work_date, l.id
        order by a.valid_from desc, a.created_at desc
      ) as row_no
    from days d
    join public.labor_project_assignments a
      on a.project_id = p_project_id
     and a.contractor_id = v_account.contractor_id
     and a.valid_from <= d.work_date
     and (a.valid_to is null or a.valid_to >= d.work_date)
    join public.laborers l on l.id = a.laborer_id
  ),
  project_days as (
    select distinct on (d.project_id, d.work_date)
      d.id, d.project_id, d.work_date
    from public.timesheet_days d
    where d.project_id = p_project_id
      and d.work_date between p_from and p_to
    order by d.project_id, d.work_date, d.created_at desc
  )
  select
    e.work_date,
    e.laborer_id,
    e.full_name,
    e.labor_class,
    e.trade,
    coalesce(a.status::text, 'absent') as attendance_status
  from eligible e
  left join project_days d on d.work_date = e.work_date
  left join public.attendance a on a.day_id = d.id and a.laborer_id = e.laborer_id
  where e.row_no = 1
  order by e.work_date, e.full_name;
end
$$;

revoke execute on function public.fn_portal_period(uuid,date,date) from public, anon;
grant execute on function public.fn_portal_period(uuid,date,date) to authenticated;

comment on function public.fn_portal_period(uuid,date,date) is
  'يعيد حضور عمال المقاول في مشروعه لفترة أقصاها 62 يومًا، ويعامل عدم التسجيل كغياب.';
