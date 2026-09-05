-- Monthly catch-up reserve plan.
-- The reserve target for an obligation is the uncovered amount divided by the
-- remaining report months, including both the current month and due month.
-- Example: SAR 10,000 due in December, viewed in September with no reserve =
-- SAR 2,500 required in each of Sep/Oct/Nov/Dec.

create or replace function private.fn_budget_required_reserve(
  p_obligation_id uuid,
  p_period_id uuid
)
returns numeric
language plpgsql
stable
set search_path to ''
as $function$
declare
  o public.budget_obligations;
  p public.budget_periods;
  v_amount numeric;
  v_reserved numeric;
  v_remaining numeric;
  v_months_remaining integer;
begin
  select * into o
  from public.budget_obligations
  where id = p_obligation_id;

  select * into p
  from public.budget_periods
  where id = p_period_id;

  if o.id is null or p.id is null or p.period_start > o.due_date then
    return 0;
  end if;

  v_amount := private.fn_budget_obligation_due_amount(o.id);
  v_reserved := greatest(private.fn_budget_reserved_balance(o.id), 0);
  v_remaining := greatest(v_amount - v_reserved, 0);

  if v_remaining <= 0 then
    return 0;
  end if;

  v_months_remaining := greatest(
    (
      (extract(year from o.due_date)::integer - extract(year from p.period_start)::integer) * 12
      + (extract(month from o.due_date)::integer - extract(month from p.period_start)::integer)
      + 1
    ),
    1
  );

  return round(v_remaining / v_months_remaining, 2);
end;
$function$;

comment on function private.fn_budget_required_reserve(uuid, uuid) is
  'Catch-up monthly reserve: uncovered obligation amount divided by remaining months including the report month and due month.';

-- Recalculate snapshots only for open periods. Closed historical periods remain frozen.
update public.budget_period_lines l
set required_reserve = private.fn_budget_required_reserve(l.obligation_id, l.period_id),
    updated_at = now()
from public.budget_periods p
where p.id = l.period_id
  and p.status = 'open';
