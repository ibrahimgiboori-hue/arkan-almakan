-- Project movements over a period in ONE call (instead of one call per day).
-- STATUS: APPLIED 2026-11-09 (owner asked for it: "اعملها دالة تجيب الفترة كلها مرة واحدة").
--
-- Read-only. Same rows and wording as the per-day movements function, for every day between p_from and p_to,
-- each row carrying its date and the contractor it belongs to (so the contractor filter is exact).
-- SECURITY INVOKER: the caller's RLS applies exactly as for the daily function. Periods longer than 92 days are refused.

create or replace function public.fn_project_ledger_range(p_project_id uuid, p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare v_result jsonb;
begin
  if p_project_id is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid period';
  end if;
  if p_to - p_from + 1 > 92 then
    raise exception 'Period longer than 92 days';
  end if;

  with day_ids as (
    select id, work_date, created_at
    from public.timesheet_days
    where project_id = p_project_id
      and work_date between p_from and p_to
  ),
  attendance_rows as (
    select
      'a-' || a.id::text as row_id, 'attendance'::text as row_type, d.work_date as row_date,
      coalesce(a.portal_last_edited_at, d.created_at) as occurred_at,
      coalesce(l.full_name, 'عامل') as title,
      concat_ws(' · ',
        case a.status::text when 'full' then 'كامل' when 'half' then 'نصف يوم' when 'absent' then 'غياب'
          when 'stopped' then 'توقف' when 'leave' then 'إجازة' else a.status::text end,
        coalesce(c.operation_alias, c.name_ar), nullif(a.trade_snapshot, ''), nullif(a.notes, '')) as detail,
      null::numeric as amount, null::text as value_text, a.status::text as status_code,
      a.contractor_id_snapshot as contractor_id
    from public.attendance a
    join day_ids d on d.id = a.day_id
    left join public.laborers l on l.id = a.laborer_id
    left join public.contractors c on c.id = a.contractor_id_snapshot
  ),
  output_rows as (
    select
      'o-' || di.id::text, 'output'::text, d.work_date, d.created_at,
      coalesce(pi.description_ar, 'إنجاز'),
      concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'), nullif(di.notes,'')),
      null::numeric,
      trim(to_char(coalesce(di.group_output,0), 'FM999999990.###') || ' ' || coalesce(di.unit, pi.unit, '')),
      null::text, di.contractor_id
    from public.day_items di
    join day_ids d on d.id = di.day_id
    left join public.project_items pi on pi.id = di.project_item_id
    left join public.contractors c on c.id = di.contractor_id
  ),
  contractor_expense_rows as (
    select
      'e-' || e.id::text, 'expense'::text, e.expense_date, e.created_at,
      coalesce(e.category, 'مصروف'),
      concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'),
        case e.payer::text when 'contractor' then 'دفعه المقاول' when 'arkan_custody' then 'مدفوع من عهدة أركان'
          when 'arkan_direct' then 'مدفوع مباشرة من أركان' when 'employee' then 'مدفوع من الحساب الشخصي' else null end,
        nullif(e.notes,'')),
      e.amount, null::text, null::text, e.contractor_id
    from public.contractor_expenses e
    left join public.contractors c on c.id = e.contractor_id
    where e.project_id = p_project_id
      and e.expense_date between p_from and p_to
  ),
  legacy_day_expense_rows as (
    select
      'de-' || e.id::text, 'expense'::text, d.work_date, e.created_at,
      coalesce(e.category, 'مصروف'),
      concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'),
        case e.payer::text when 'contractor' then 'دفعه المقاول' when 'arkan_custody' then 'مدفوع من عهدة أركان'
          when 'arkan_direct' then 'مدفوع مباشرة من أركان' when 'employee' then 'مدفوع من الحساب الشخصي' else null end,
        nullif(e.notes,'')),
      e.amount, null::text, null::text, e.contractor_id
    from public.day_expenses e
    join day_ids d on d.id = e.day_id
    left join public.contractors c on c.id = e.contractor_id
    where not (e.custody_trx_id is not null
      and exists (select 1 from public.contractor_expenses ce where ce.custody_trx_id = e.custody_trx_id))
  ),
  advance_rows as (
    select
      'v-' || ca.id::text, 'advance'::text, ca.advance_date, ca.created_at, 'سلفة مقاول'::text,
      concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'), nullif(ca.notes,'')),
      ca.amount, null::text, null::text, ca.contractor_id
    from public.contractor_advances ca
    left join public.contractors c on c.id = ca.contractor_id
    where ca.project_id = p_project_id
      and ca.advance_date between p_from and p_to
  ),
  payment_rows as (
    select
      'p-' || cp.id::text, 'payment'::text, cp.payment_date, cp.created_at, 'دفعة مقاول'::text,
      concat_ws(' · ', coalesce(c.operation_alias, c.name_ar, '—'), nullif(cp.reference,''), nullif(cp.notes,'')),
      cp.amount, null::text, null::text, cp.contractor_id
    from public.contractor_payments cp
    left join public.contractors c on c.id = cp.contractor_id
    where cp.project_id = p_project_id
      and cp.payment_date between p_from and p_to
  ),
  custody_rows as (
    select
      'c-' || ct.id::text, 'custody'::text, ct.trx_date, ct.created_at,
      case ct.direction::text when 'issue' then 'تعزيز عهدة' when 'return' then 'إرجاع عهدة'
        when 'spend' then 'صرف من العهدة' when 'adjust' then 'تسوية عهدة' else 'حركة عهدة' end,
      concat_ws(' · ', coalesce(ct.category, ct.beneficiary, ct.notes, '—'),
        case ct.charge_to::text when 'arkan' then 'على أركان' when 'contractor' then 'على المقاول'
          when 'owner' then 'على المالك' else null end),
      ct.amount, null::text, ct.direction::text, ct.contractor_id
    from public.custody_transactions ct
    where ct.project_id = p_project_id
      and ct.trx_date between p_from and p_to
      and not exists (select 1 from public.contractor_expenses e where e.custody_trx_id = ct.id)
      and not exists (select 1 from public.day_expenses e where e.custody_trx_id = ct.id)
      and not exists (select 1 from public.contractor_advances a where a.custody_trx_id = ct.id)
      and not exists (select 1 from public.contractor_payments p where p.custody_trx_id = ct.id)
  ),
  all_rows as (
    select * from attendance_rows
    union all select * from output_rows
    union all select * from contractor_expense_rows
    union all select * from legacy_day_expense_rows
    union all select * from advance_rows
    union all select * from payment_rows
    union all select * from custody_rows
  )
  select jsonb_build_object('rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', row_id,
      'type', row_type,
      'date', row_date,
      'time', occurred_at,
      'title', title,
      'detail', detail,
      'amount', amount,
      'valueText', value_text,
      'statusCode', status_code,
      'contractorId', contractor_id
    ) order by row_date, occurred_at nulls last, row_id), '[]'::jsonb))
  into v_result
  from all_rows;

  return v_result;
end $function$;

revoke all on function public.fn_project_ledger_range(uuid, date, date) from public, anon;
grant execute on function public.fn_project_ledger_range(uuid, date, date) to authenticated, service_role;
