-- Exact daily reserve proration.
-- Monthly reserve is the difference between two cumulative day-level targets,
-- so monthly rounding can never make the cycle finish above or below its obligation.

create or replace function private.fn_budget_prorated_window_amount(
  p_amount numeric,
  p_accrual_start date,
  p_due_date date,
  p_from date,
  p_to date
)
returns numeric
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_start date;
  v_end date;
  v_total_days int;
  v_elapsed_before int;
  v_elapsed_end int;
  v_before_target numeric;
  v_end_target numeric;
begin
  if p_amount is null or p_amount<=0 or p_accrual_start is null or p_due_date is null
     or p_from is null or p_to is null or p_due_date<p_accrual_start or p_to<p_from then
    return 0;
  end if;

  v_start:=greatest(p_accrual_start,p_from);
  v_end:=least(p_due_date,p_to);
  if v_end<v_start then return 0; end if;

  v_total_days:=greatest(1,p_due_date-p_accrual_start+1);
  v_elapsed_before:=greatest(0,v_start-p_accrual_start);
  v_elapsed_end:=greatest(0,v_end-p_accrual_start+1);

  v_before_target:=round(p_amount*v_elapsed_before/v_total_days,2);
  v_end_target:=round(p_amount*v_elapsed_end/v_total_days,2);
  return round(greatest(v_end_target-v_before_target,0),2);
end;
$function$;

create or replace function private.fn_budget_obligation_daily_cost_between(p_obligation_id uuid,p_from date,p_to date)
returns numeric
language plpgsql
stable
set search_path=''
as $function$
declare
  o public.budget_obligations;
  s public.budget_item_schedules;
  v_amount numeric;
  v_effective_start date;
  v_baseline date:=private.fn_budget_baseline_date();
begin
  if p_from is null or p_to is null or p_to<p_from then return 0; end if;
  select * into o from public.budget_obligations where id=p_obligation_id and status<>'cancelled';
  if o.id is null then return 0; end if;
  select * into s from public.budget_item_schedules where id=o.schedule_id;
  if s.id is null then return 0; end if;

  v_amount:=private.fn_budget_obligation_due_amount(o.id);
  v_effective_start:=greatest(o.accrual_start,s.valid_from,v_baseline);
  return private.fn_budget_prorated_window_amount(v_amount,v_effective_start,o.due_date,p_from,p_to);
end;
$function$;

create or replace function private.fn_budget_required_reserve(p_obligation_id uuid,p_period_id uuid)
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
  v_contribution:=private.fn_budget_prorated_window_amount(v_amount,o.accrual_start,o.due_date,p.period_start,p.period_end);
  v_reserved:=greatest(private.fn_budget_reserved_balance(o.id),0);
  return round(least(v_contribution,greatest(v_amount-v_reserved,0)),2);
end;
$function$;

create or replace function private.fn_budget_rpc_forecast(p_from date,p_months integer)
returns table(period_start date,expected_due numeric,required_reserve numeric,planned_total numeric)
language plpgsql
security definer
set search_path=''
as $function$
declare
  i integer;
  v_start date:=date_trunc('month',p_from)::date;
  v_month date;
  v_month_end date;
  v_due numeric;
  v_reserve numeric;
  v_reserve_before_due numeric;
  v_simulated jsonb:='{}'::jsonb;
  r record;
  v_key text;
  v_sim_reserved numeric;
  v_remaining numeric;
  v_contribution numeric;
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  if p_months not between 1 and 24 then raise exception 'أفق التوقع يجب أن يكون بين شهر و24 شهرًا'; end if;

  for i in 0..p_months-1 loop
    v_month:=(v_start+make_interval(months=>i))::date;
    v_month_end:=(v_month+interval '1 month - 1 day')::date;
    v_due:=0; v_reserve:=0; v_reserve_before_due:=0;

    for r in select * from private.fn_budget_project_obligation_cycles(v_start,p_months+12) loop
      v_key:=r.projection_key;
      v_sim_reserved:=coalesce((v_simulated->>v_key)::numeric,r.reserved_amount,0);
      v_remaining:=greatest(r.expected_amount-v_sim_reserved,0);

      if r.accrual_start<=v_month_end and r.due_date>=v_month and v_remaining>0 then
        v_contribution:=private.fn_budget_prorated_window_amount(
          r.expected_amount,r.accrual_start,r.due_date,v_month,v_month_end
        );
        v_contribution:=least(v_contribution,v_remaining);
        if v_contribution>0 then
          v_reserve:=v_reserve+v_contribution;
          if r.due_date>v_month_end then v_reserve_before_due:=v_reserve_before_due+v_contribution; end if;
          v_simulated:=jsonb_set(v_simulated,array[v_key],to_jsonb(round(v_sim_reserved+v_contribution,2)),true);
        end if;
      end if;

      if r.due_date between v_month and v_month_end then
        v_due:=v_due+greatest(r.expected_amount-r.paid_amount,0);
      end if;
    end loop;

    period_start:=v_month;
    expected_due:=round(v_due,2);
    required_reserve:=round(v_reserve,2);
    planned_total:=round(v_due+v_reserve_before_due,2);
    return next;
  end loop;
end;
$function$;

-- Refresh only the derived monthly reserve target; business facts are untouched.
update public.budget_period_lines l
set required_reserve=private.fn_budget_required_reserve(l.obligation_id,l.period_id),
    updated_at=now();
