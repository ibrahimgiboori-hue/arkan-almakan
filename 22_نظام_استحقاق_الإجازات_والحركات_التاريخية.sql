-- ============================================================
-- الملف 22 : الاستحقاق المستمر للإجازات والحركات التاريخية
-- ============================================================
-- القاعدة:
-- الاستحقاق يتراكم يومياً من تاريخ المباشرة وفق الاستحقاق السنوي المتفق عليه.
-- الرصيد الظاهر يقرب للأعلى: أي جزء من اليوم يعد يوماً.
-- الملفات الورقية القديمة تسجل كحركات تاريخية منتهية ولا تمر بمسار اعتماد جديد.
-- ============================================================

alter table employees add column if not exists annual_leave_days numeric(6,2) not null default 21;
alter table employees drop constraint if exists employees_annual_leave_days_check;
alter table employees add constraint employees_annual_leave_days_check check (annual_leave_days > 0);

alter table leave_requests add column if not exists record_source text not null default 'current';
alter table leave_requests add column if not exists paper_reference text;
alter table leave_requests add column if not exists paper_document_date date;
alter table leave_requests add column if not exists paper_approver_text text;
alter table leave_requests add column if not exists actual_return_date date;
alter table leave_requests add column if not exists recorded_by_user_id uuid;
alter table leave_requests drop constraint if exists leave_requests_record_source_check;
alter table leave_requests add constraint leave_requests_record_source_check check (record_source in ('current','historical_paper'));

create table if not exists leave_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  movement_date date not null,
  movement_type text not null,
  days integer not null check (days > 0),
  reference text,
  note text,
  document_path text,
  recorded_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint leave_balance_adjustments_type_check check (movement_type in ('credit','debit','cash_settlement','opening_adjustment'))
);
create index if not exists idx_leave_adjustments_employee_date on leave_balance_adjustments(employee_id, movement_date);
alter table leave_balance_adjustments enable row level security;
drop policy if exists p_leave_adjustments_all_authenticated on leave_balance_adjustments;
create policy p_leave_adjustments_all_authenticated on leave_balance_adjustments for all to authenticated using (true) with check (true);

create or replace function leave_balance_snapshot(
  p_employee uuid,
  p_as_of date default current_date,
  p_exclude_request uuid default null
)
returns table (
  employee_id uuid,
  as_of_date date,
  hire_date date,
  annual_entitlement numeric,
  service_days integer,
  accrued_raw numeric,
  accrued_days integer,
  used_days integer,
  reserved_days integer,
  adjustment_days integer,
  actual_balance integer,
  available_balance integer
)
language sql stable security invoker set search_path = public
as $$
with emp as (
  select e.id, e.hire_date, e.annual_leave_days
  from employees e where e.id = p_employee
), usage as (
  select
    coalesce(sum(case
      when l.start_date < p_as_of then greatest(0, least(l.end_date, p_as_of - 1) - l.start_date + 1)
      else 0 end),0)::integer as used_days,
    coalesce(sum(case
      when l.end_date >= p_as_of then greatest(0, l.end_date - greatest(l.start_date, p_as_of) + 1)
      else 0 end),0)::integer as reserved_days
  from leave_requests l
  where l.employee_id = p_employee
    and l.leave_kind::text = 'annual'
    and l.status::text = 'ceo_approved'
    and (p_exclude_request is null or l.id <> p_exclude_request)
), adj as (
  select coalesce(sum(case when a.movement_type='credit' then a.days else -a.days end),0)::integer as adjustment_days
  from leave_balance_adjustments a
  where a.employee_id = p_employee and a.movement_date <= p_as_of
), calc as (
  select
    emp.id,
    emp.hire_date,
    emp.annual_leave_days,
    greatest(p_as_of - emp.hire_date,0)::integer as service_days,
    (emp.annual_leave_days * greatest(p_as_of - emp.hire_date,0)::numeric / 365.0) as accrued_raw,
    usage.used_days,
    usage.reserved_days,
    adj.adjustment_days
  from emp cross join usage cross join adj
)
select
  id,
  p_as_of,
  hire_date,
  annual_leave_days,
  service_days,
  accrued_raw,
  ceil(accrued_raw)::integer,
  used_days,
  reserved_days,
  adjustment_days,
  (ceil(accrued_raw)::integer + adjustment_days - used_days),
  (ceil(accrued_raw)::integer + adjustment_days - used_days - reserved_days)
from calc
$$;

grant execute on function leave_balance_snapshot(uuid,date,uuid) to authenticated;

create or replace view v_leave_balance_live with (security_invoker=true) as
select e.id as employee_id, e.employee_no, e.full_name_ar, e.hire_date, e.annual_leave_days,
       s.as_of_date, s.service_days, s.accrued_raw, s.accrued_days, s.used_days,
       s.reserved_days, s.adjustment_days, s.actual_balance, s.available_balance
from employees e
cross join lateral leave_balance_snapshot(e.id, current_date, null) s
where e.status::text in ('active','on_leave');

grant select on v_leave_balance_live to authenticated;

create or replace function record_historical_leave(
  p_employee_id uuid,
  p_leave_kind text,
  p_start_date date,
  p_end_date date,
  p_reason text default null,
  p_reference text default null,
  p_document_date date default null,
  p_approver_text text default null,
  p_actual_return_date date default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_employee_id is null then raise exception 'الموظف مطلوب'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then raise exception 'فترة الإجازة غير صحيحة'; end if;
  if p_leave_kind not in ('annual','sick','unpaid','permission','emergency','hajj','maternity') then raise exception 'نوع الإجازة غير مدعوم'; end if;

  insert into leave_requests (
    employee_id, leave_kind, start_date, end_date, reason, is_paid, status,
    record_source, paper_reference, paper_document_date, paper_approver_text,
    actual_return_date, recorded_by_user_id
  ) values (
    p_employee_id, p_leave_kind::leave_kind, p_start_date, p_end_date, p_reason,
    p_leave_kind <> 'unpaid', 'ceo_approved'::request_status,
    'historical_paper', nullif(trim(p_reference),''), p_document_date,
    nullif(trim(p_approver_text),''), p_actual_return_date, auth.uid()
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function record_historical_leave(uuid,text,date,date,text,text,date,text,date) from public;
grant execute on function record_historical_leave(uuid,text,date,date,text,text,date,text,date) to authenticated;
