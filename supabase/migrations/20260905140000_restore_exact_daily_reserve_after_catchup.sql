-- Forward-only repair for production migration drift.
-- A later equal-month catch-up migration temporarily replaced the canonical
-- exact daily reserve function in production. The current finance law is the
-- exact day-level allocation already established by
-- 20260905135000_budget_exact_daily_reserve_proration.sql.
--
-- Historical/closed periods remain frozen. Only open derived period lines are
-- refreshed; no business facts, settlements, reserve movements, or treasury
-- movements are rewritten.

create or replace function private.fn_budget_required_reserve(
  p_obligation_id uuid,
  p_period_id uuid
)
returns numeric
language plpgsql
stable
set search_path=''
as $function$
declare
  o public.budget_obligations;
  p public.budget_periods;
  v_reserved numeric;
  v_contribution numeric;
  v_amount numeric;
begin
  select * into o from public.budget_obligations where id=p_obligation_id;
  select * into p from public.budget_periods where id=p_period_id;
  if o.id is null or p.id is null or p.period_start>o.due_date then return 0; end if;

  v_amount:=private.fn_budget_obligation_due_amount(o.id);
  v_contribution:=private.fn_budget_prorated_window_amount(
    v_amount,
    o.accrual_start,
    o.due_date,
    p.period_start,
    p.period_end
  );
  v_reserved:=greatest(private.fn_budget_reserved_balance(o.id),0);
  return round(least(v_contribution,greatest(v_amount-v_reserved,0)),2);
end;
$function$;

comment on function private.fn_budget_required_reserve(uuid,uuid) is
  'Canonical exact daily reserve allocation for the report period; closed historical periods are not recalculated by the repair migration.';

update public.budget_period_lines l
set required_reserve=private.fn_budget_required_reserve(l.obligation_id,l.period_id),
    updated_at=now()
from public.budget_periods p
where p.id=l.period_id
  and p.status='open';
