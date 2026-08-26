-- Constitutional daily movement ledger hardening
-- One business movement must appear once. Semantic records win over their
-- underlying custody transaction when custody_trx_id links them.

-- contractor_payments had RLS enabled without a SELECT policy, so an invoker
-- RPC could never include payments for authenticated users. Keep access scoped
-- to existing project-finance capabilities rather than bypassing RLS.
drop policy if exists p_contractor_payments_select_cap on public.contractor_payments;
create policy p_contractor_payments_select_cap
on public.contractor_payments
for select
to authenticated
using (
  public.has_project_capability('finance.projects.view', project_id, amount)
  or public.has_project_capability('projects.financial_summary.view', project_id, amount)
);

create or replace function public.fn_project_daily_ledger(
  p_project_id uuid,
  p_date date
)
returns jsonb
language sql
set search_path to 'public', 'pg_temp'
as $function$
with day_ids as (
  select id, created_at
  from public.timesheet_days
  where project_id = p_project_id
    and work_date = p_date
),
attendance_rows as (
  select
    'a-' || a.id::text as row_id,
    'attendance'::text as row_type,
    coalesce(a.portal_last_edited_at, d.created_at) as occurred_at,
    coalesce(l.full_name, 'عامل') as title,
    concat_ws(
      ' · ',
      case a.status::text
        when 'full' then 'كامل'
        when 'half' then 'نصف يوم'
        when 'absent' then 'غياب'
        when 'stopped' then 'توقف'
        when 'leave' then 'إجازة'
        else a.status::text
      end,
      coalesce(c.operation_alias, c.name_ar),
      nullif(a.trade_snapshot, ''),
      nullif(a.notes, '')
    ) as detail,
    null::numeric as amount,
    null::text as value_text,
    a.status::text as status_code
  from public.attendance a
  join day_ids d on d.id = a.day_id
  left join public.laborers l on l.id = a.laborer_id
  -- Historical attendance must describe the contractor recorded with the event,
  -- never reinterpret it from the worker's current assignment.
  left join public.contractors c on c.id = a.contractor_id_snapshot
),
output_rows as (
  select
    'o-' || di.id::text as row_id,
    'output'::text as row_type,
    d.created_at as occurred_at,
    coalesce(pi.description_ar, 'إنجاز') as title,
    concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'), nullif(di.notes,'')) as detail,
    null::numeric as amount,
    trim(to_char(coalesce(di.group_output,0), 'FM999999990.###') || ' ' || coalesce(di.unit, pi.unit, '')) as value_text,
    null::text as status_code
  from public.day_items di
  join day_ids d on d.id = di.day_id
  left join public.project_items pi on pi.id = di.project_item_id
  left join public.contractors c on c.id = di.contractor_id
),
contractor_expense_rows as (
  select
    'e-' || e.id::text as row_id,
    'expense'::text as row_type,
    e.created_at as occurred_at,
    coalesce(e.category, 'مصروف') as title,
    concat_ws(
      ' · ',
      coalesce(c.operation_alias, c.name_ar, '—'),
      case e.payer::text
        when 'contractor' then 'دفعه المقاول'
        when 'arkan_custody' then 'مدفوع من عهدة أركان'
        when 'arkan_direct' then 'مدفوع مباشرة من أركان'
        when 'employee' then 'مدفوع من الحساب الشخصي'
        else null
      end,
      nullif(e.notes,'')
    ) as detail,
    e.amount as amount,
    null::text as value_text,
    null::text as status_code
  from public.contractor_expenses e
  left join public.contractors c on c.id = e.contractor_id
  where e.project_id = p_project_id
    and e.expense_date = p_date
),
legacy_day_expense_rows as (
  select
    'de-' || e.id::text as row_id,
    'expense'::text as row_type,
    e.created_at as occurred_at,
    coalesce(e.category, 'مصروف') as title,
    concat_ws(
      ' · ',
      coalesce(c.operation_alias, c.name_ar, '—'),
      case e.payer::text
        when 'contractor' then 'دفعه المقاول'
        when 'arkan_custody' then 'مدفوع من عهدة أركان'
        when 'arkan_direct' then 'مدفوع مباشرة من أركان'
        when 'employee' then 'مدفوع من الحساب الشخصي'
        else null
      end,
      nullif(e.notes,'')
    ) as detail,
    e.amount as amount,
    null::text as value_text,
    null::text as status_code
  from public.day_expenses e
  join day_ids d on d.id = e.day_id
  left join public.contractors c on c.id = e.contractor_id
  where not (
    e.custody_trx_id is not null
    and exists (
      select 1
      from public.contractor_expenses ce
      where ce.custody_trx_id = e.custody_trx_id
    )
  )
),
expense_rows as (
  select * from contractor_expense_rows
  union all
  select * from legacy_day_expense_rows
),
advance_rows as (
  select
    'v-' || ca.id::text as row_id,
    'advance'::text as row_type,
    ca.created_at as occurred_at,
    'سلفة مقاول'::text as title,
    concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'), nullif(ca.notes,'')) as detail,
    ca.amount as amount,
    null::text as value_text,
    null::text as status_code
  from public.contractor_advances ca
  left join public.contractors c on c.id = ca.contractor_id
  where ca.project_id = p_project_id
    and ca.advance_date = p_date
),
payment_rows as (
  select
    'p-' || cp.id::text as row_id,
    'payment'::text as row_type,
    cp.created_at as occurred_at,
    'دفعة مقاول'::text as title,
    concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'), nullif(cp.reference,''), nullif(cp.notes,'')) as detail,
    cp.amount as amount,
    null::text as value_text,
    null::text as status_code
  from public.contractor_payments cp
  left join public.contractors c on c.id = cp.contractor_id
  where cp.project_id = p_project_id
    and cp.payment_date = p_date
),
-- Residual custody only. If a custody transaction is already represented by a
-- clearer business record (expense / legacy expense / advance / payment), it
-- must not be presented or totalled a second time in the daily ledger.
custody_rows as (
  select
    'c-' || ct.id::text as row_id,
    'custody'::text as row_type,
    ct.created_at as occurred_at,
    case ct.direction::text
      when 'issue' then 'تعزيز عهدة'
      when 'return' then 'إرجاع عهدة'
      when 'spend' then 'صرف من العهدة'
      when 'adjust' then 'تسوية عهدة'
      else 'حركة عهدة'
    end as title,
    concat_ws(
      ' · ',
      coalesce(ct.category, ct.beneficiary, ct.notes, '—'),
      case ct.charge_to::text
        when 'arkan' then 'على أركان'
        when 'contractor' then 'على المقاول'
        when 'owner' then 'على المالك'
        else null
      end
    ) as detail,
    ct.amount as amount,
    null::text as value_text,
    ct.direction::text as status_code
  from public.custody_transactions ct
  where ct.project_id = p_project_id
    and ct.trx_date = p_date
    and not exists (
      select 1 from public.contractor_expenses e
      where e.custody_trx_id = ct.id
    )
    and not exists (
      select 1 from public.day_expenses e
      where e.custody_trx_id = ct.id
    )
    and not exists (
      select 1 from public.contractor_advances a
      where a.custody_trx_id = ct.id
    )
    and not exists (
      select 1 from public.contractor_payments p
      where p.custody_trx_id = ct.id
    )
),
all_rows as (
  select * from attendance_rows
  union all select * from output_rows
  union all select * from expense_rows
  union all select * from custody_rows
  union all select * from advance_rows
  union all select * from payment_rows
),
summary as (
  select jsonb_build_object(
    'attendance', (select count(*) from attendance_rows),
    'full', (select count(*) from attendance_rows where status_code='full'),
    'half', (select count(*) from attendance_rows where status_code='half'),
    'absent', (select count(*) from attendance_rows where status_code='absent'),
    'outputs', (select count(*) from output_rows),
    'expenses', coalesce((select sum(amount) from expense_rows),0),
    'custody', coalesce((select sum(amount) from custody_rows where status_code='spend'),0),
    'advances', coalesce((select sum(amount) from advance_rows),0),
    'payments', coalesce((select sum(amount) from payment_rows),0),
    'movements', (select count(*) from all_rows)
  ) as data
),
rows_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', row_id,
      'type', row_type,
      'time', occurred_at,
      'title', title,
      'detail', detail,
      'amount', amount,
      'valueText', value_text
    ) order by occurred_at desc nulls last, row_id
  ), '[]'::jsonb) as data
  from all_rows
)
select jsonb_build_object('summary', summary.data, 'rows', rows_json.data)
from summary, rows_json;
$function$;
