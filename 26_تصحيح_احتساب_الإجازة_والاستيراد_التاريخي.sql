-- ============================================================
-- الملف 26 : تصحيح احتساب الإجازة والاستيراد التاريخي الجماعي
-- ============================================================
-- 1. يوم المباشرة يدخل في مدة الخدمة، حتى يكتمل الاستحقاق السنوي
--    عند إكمال 365 يوم خدمة فعلياً لا بعد 366 يوماً تقويمياً.
-- 2. الرصيد الظاهر يقرب دائماً للأعلى كما هو معتمد في النظام.
-- 3. استيراد الملفات الورقية القديمة يتم دفعة واحدة مع منع التكرار الواضح.
-- ============================================================

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
  from employees e
  where e.id = p_employee
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
  select coalesce(sum(case
    when a.movement_type = 'credit' then a.days
    when a.movement_type in ('debit','cash_settlement') then -a.days
    else 0
  end),0)::integer as adjustment_days
  from leave_balance_adjustments a
  where a.employee_id = p_employee
    and a.movement_date <= p_as_of
), calc as (
  select
    emp.id,
    emp.hire_date,
    emp.annual_leave_days,
    case
      when emp.hire_date is null or p_as_of < emp.hire_date then 0
      else (p_as_of - emp.hire_date + 1)::integer
    end as service_days,
    usage.used_days,
    usage.reserved_days,
    adj.adjustment_days
  from emp cross join usage cross join adj
), accrual as (
  select *,
    (annual_leave_days * service_days::numeric / 365.0) as accrued_raw
  from calc
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
from accrual
$$;

grant execute on function leave_balance_snapshot(uuid,date,uuid) to authenticated;

create or replace function import_historical_leaves(p_rows jsonb)
returns table (
  imported_count integer,
  skipped_count integer
)
language plpgsql security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_employee employees;
  v_kind text;
  v_start date;
  v_end date;
  v_return date;
  v_doc_date date;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_exists uuid;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'ملف الاستيراد لا يحتوي على حركات';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    select * into v_employee
    from employees
    where trim(employee_no) = trim(coalesce(v_row->>'employee_no',''))
    limit 1;

    if v_employee.id is null then
      raise exception 'لم يتم العثور على موظف بالرقم الوظيفي: %', coalesce(v_row->>'employee_no','');
    end if;

    v_kind := lower(trim(coalesce(v_row->>'leave_kind','')));
    if v_kind not in ('annual','sick','unpaid','permission','emergency','hajj','maternity') then
      raise exception 'نوع إجازة غير مدعوم للموظف %: %', v_employee.employee_no, v_kind;
    end if;

    begin
      v_start := nullif(v_row->>'start_date','')::date;
      v_end := nullif(v_row->>'end_date','')::date;
      v_return := nullif(v_row->>'actual_return_date','')::date;
      v_doc_date := nullif(v_row->>'paper_document_date','')::date;
    exception when others then
      raise exception 'يوجد تاريخ غير صحيح في حركة الموظف %', v_employee.employee_no;
    end;

    if v_start is null or v_end is null or v_end < v_start then
      raise exception 'فترة الإجازة غير صحيحة للموظف %', v_employee.employee_no;
    end if;

    select l.id into v_exists
    from leave_requests l
    where l.employee_id = v_employee.id
      and l.record_source = 'historical_paper'
      and l.leave_kind::text = v_kind
      and l.start_date = v_start
      and l.end_date = v_end
      and coalesce(trim(l.paper_reference),'') = coalesce(trim(v_row->>'paper_reference'),'')
    limit 1;

    if v_exists is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into leave_requests (
      employee_id, leave_kind, start_date, end_date, reason, is_paid, status,
      record_source, paper_reference, paper_document_date, paper_approver_text,
      actual_return_date, recorded_by_user_id
    ) values (
      v_employee.id,
      v_kind::leave_kind,
      v_start,
      v_end,
      nullif(trim(v_row->>'reason'),''),
      v_kind <> 'unpaid',
      'ceo_approved'::request_status,
      'historical_paper',
      nullif(trim(v_row->>'paper_reference'),''),
      v_doc_date,
      nullif(trim(v_row->>'paper_approver_text'),''),
      v_return,
      auth.uid()
    );

    v_imported := v_imported + 1;
  end loop;

  return query select v_imported, v_skipped;
end $$;

revoke all on function import_historical_leaves(jsonb) from public;
grant execute on function import_historical_leaves(jsonb) to authenticated;
