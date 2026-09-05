-- Operating budget baseline: the current catalog begins on 2026-06-15.
-- Recurrence remains a payment/cycle cadence; accounting accrual is daily.

alter table public.app_settings
  add column if not exists operating_budget_baseline_date date;

update public.app_settings
set operating_budget_baseline_date = date '2026-06-15'
where id = 1;

create or replace function private.fn_budget_baseline_date()
returns date
language sql
stable
set search_path=''
as $function$
  select coalesce((select operating_budget_baseline_date from public.app_settings where id=1), date '2026-06-15')
$function$;

-- This migration intentionally rewrites only source/derived budget truth that has
-- not produced a confirmed, reserved or treasury-backed consequence yet.
do $guard$
begin
  if exists(select 1 from public.budget_line_settlements)
     or exists(select 1 from public.budget_obligation_settlements)
     or exists(select 1 from public.budget_reserve_movements)
     or exists(select 1 from public.budget_period_lines where confirmed_amount is not null) then
    raise exception 'لا يمكن توحيد خط بداية الميزانية بعد وجود أثر مالي مثبت';
  end if;
end
$guard$;

-- All items that exist now belong to one historical baseline cohort. Their real
-- due-day/anchor remains untouched; only their entry into the budget engine is unified.
update public.budget_item_schedules s
set valid_from = private.fn_budget_baseline_date()
from public.budget_item_definitions d
where d.id=s.item_id and d.node_type='item' and d.is_active=true;

update public.budget_rate_versions r
set valid_from = private.fn_budget_baseline_date()
from public.budget_item_definitions d
where d.id=r.item_id and d.node_type='item' and d.is_active=true;

-- No financial consequence exists, so derived historical artifacts are rebuilt from source.
delete from public.budget_obligation_estimate_events;
delete from public.budget_period_lines;
delete from public.budget_obligations;

create or replace function private.fn_budget_ensure_obligation_cycles(p_item_id uuid,p_from_date date,p_horizon_months integer default 24)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s public.budget_item_schedules;
  v_months int;
  i int;
  v_due date;
  v_accrual date;
  v_cycle_start date;
  v_name text;
  v_horizon_end date;
  v_window_start date;
  v_window_end date;
  v_baseline date:=private.fn_budget_baseline_date();
begin
  select name into v_name from public.budget_item_definitions where id=p_item_id and node_type='item';
  if v_name is null then return; end if;
  v_horizon_end := (p_from_date + make_interval(months=>p_horizon_months))::date;

  for s in
    select * from public.budget_item_schedules
    where item_id=p_item_id and valid_from<=v_horizon_end
    order by valid_from
  loop
    v_window_start:=greatest(s.valid_from,v_baseline);
    v_window_end:=least(v_horizon_end,coalesce(s.valid_to,v_horizon_end));
    if v_window_end<v_window_start then continue; end if;

    if s.recurrence_unit='one_time' then
      v_due:=s.anchor_date;
      if v_due between v_window_start and v_window_end then
        v_accrual:=case s.accrual_start_rule
          when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date
          else v_window_start
        end;
        v_accrual:=greatest(v_window_start,least(v_accrual,v_due));
        insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
        values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),v_accrual,v_due,true)
        on conflict(item_id,due_date) do update set schedule_id=excluded.schedule_id,cycle_label=excluded.cycle_label,
          accrual_start=excluded.accrual_start,status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
      end if;
      continue;
    end if;

    v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
    if v_months<=0 then continue; end if;

    -- Generate both backward and forward from the anchor so a catalog item that was
    -- first entered in August can still correctly belong to the June baseline.
    for i in -240..240 loop
      v_due:=(s.anchor_date+make_interval(months=>i*v_months))::date;
      continue when v_due<v_window_start or v_due>v_window_end;
      v_cycle_start:=(v_due-make_interval(months=>v_months)+interval '1 day')::date;
      v_accrual:=case s.accrual_start_rule
        when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date
        else v_cycle_start
      end;
      v_accrual:=greatest(v_window_start,least(v_accrual,v_due));
      insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
      values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),v_accrual,v_due,true)
      on conflict(item_id,due_date) do update set schedule_id=excluded.schedule_id,cycle_label=excluded.cycle_label,
        accrual_start=excluded.accrual_start,status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
    end loop;
  end loop;
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
  v_months int;
  v_prev_due date;
  v_cycle_start date;
  v_effective_start date;
  v_start date;
  v_end date;
  v_cycle_days int;
  v_days int;
  v_baseline date:=private.fn_budget_baseline_date();
begin
  if p_from is null or p_to is null or p_to<p_from then return 0; end if;
  select * into o from public.budget_obligations where id=p_obligation_id and status<>'cancelled';
  if o.id is null then return 0; end if;
  select * into s from public.budget_item_schedules where id=o.schedule_id;
  if s.id is null then return 0; end if;
  v_amount:=private.fn_budget_obligation_due_amount(o.id);

  if s.recurrence_unit='one_time' then
    return case when o.due_date between greatest(p_from,v_baseline,s.valid_from) and p_to then round(v_amount,2) else 0 end;
  end if;

  v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
  if v_months<=0 then return 0; end if;
  v_prev_due:=(o.due_date-make_interval(months=>v_months))::date;
  v_cycle_start:=(v_prev_due+1)::date;
  v_effective_start:=greatest(v_cycle_start,s.valid_from,v_baseline);
  v_start:=greatest(v_effective_start,p_from);
  v_end:=least(o.due_date,p_to);
  if v_end<v_start then return 0; end if;
  v_cycle_days:=greatest(1,o.due_date-v_prev_due);
  v_days:=(v_end-v_start)+1;
  return round(v_amount*v_days/v_cycle_days,2);
end;
$function$;

create or replace function private.fn_budget_item_daily_cost_between(p_item_id uuid,p_from date,p_to date)
returns numeric
language sql
stable
set search_path=''
as $function$
  select coalesce(sum(private.fn_budget_obligation_daily_cost_between(o.id,p_from,p_to)),0)
  from public.budget_obligations o
  where o.item_id=p_item_id and o.status<>'cancelled'
$function$;

create or replace function private.fn_budget_cycle_accumulated(p_obligation_id uuid,p_period_id uuid)
returns numeric
language plpgsql
stable
set search_path=''
as $function$
declare
  o public.budget_obligations;
  p public.budget_periods;
begin
  select * into o from public.budget_obligations where id=p_obligation_id;
  select * into p from public.budget_periods where id=p_period_id;
  if o.id is null or p.id is null then return 0; end if;
  return private.fn_budget_obligation_daily_cost_between(o.id,private.fn_budget_baseline_date(),p.period_end);
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
  v_amount numeric;
  v_start date;
  v_end date;
  v_window_days int;
  v_period_days int;
  v_reserved numeric;
  v_contribution numeric;
begin
  select * into o from public.budget_obligations where id=p_obligation_id;
  select * into p from public.budget_periods where id=p_period_id;
  if o.id is null or p.id is null or o.due_date<=p.period_end then return 0; end if;
  v_amount:=private.fn_budget_obligation_due_amount(o.id);
  v_start:=greatest(o.accrual_start,p.period_start);
  v_end:=least(o.due_date,p.period_end);
  if v_end<v_start then return 0; end if;
  v_window_days:=greatest(1,o.due_date-o.accrual_start+1);
  v_period_days:=v_end-v_start+1;
  v_reserved:=greatest(private.fn_budget_reserved_balance(o.id),0);
  v_contribution:=round(v_amount*v_period_days/v_window_days,2);
  return round(least(v_contribution,greatest(v_amount-v_reserved,0)),2);
end;
$function$;

create or replace function private.fn_budget_project_obligation_cycles(p_from date,p_horizon_months integer)
returns table(projection_key text,item_id uuid,due_date date,accrual_start date,expected_amount numeric,reserved_amount numeric,paid_amount numeric,obligation_id uuid)
language plpgsql
stable
set search_path=''
as $function$
declare
  v_start date:=date_trunc('month',p_from)::date;
  v_end date:=(date_trunc('month',p_from)+make_interval(months=>p_horizon_months)+interval '1 month - 1 day')::date;
  s record;
  v_months integer;
  i integer;
  v_due date;
  v_cycle_start date;
  v_accrual date;
  v_obligation public.budget_obligations;
  v_expected numeric;
  v_reserved numeric;
  v_paid numeric;
  v_baseline date:=private.fn_budget_baseline_date();
begin
  if p_horizon_months<1 then return; end if;
  for s in
    select sch.*,d.id as definition_id
    from public.budget_item_schedules sch
    join public.budget_item_definitions d on d.id=sch.item_id and d.node_type='item' and d.is_active
    where sch.valid_from<=v_end and coalesce(sch.valid_to,v_end)>=v_start
    order by d.sort_order,d.name,sch.valid_from
  loop
    if s.recurrence_unit='one_time' then
      v_due:=s.anchor_date;
      if v_due<v_start or v_due>v_end or v_due<s.valid_from or (s.valid_to is not null and v_due>s.valid_to) then continue; end if;
      v_accrual:=case s.accrual_start_rule when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date else s.valid_from end;
      v_accrual:=greatest(v_baseline,s.valid_from,least(v_accrual,v_due));
      v_obligation:=null;
      select * into v_obligation from public.budget_obligations o where o.item_id=s.item_id and o.due_date=v_due limit 1;
      if v_obligation.id is not null and v_obligation.status='cancelled' then continue; end if;
      v_expected:=coalesce(nullif(v_obligation.expected_amount,0),private.fn_budget_forecast_default_amount(s.item_id,v_due));
      v_reserved:=case when v_obligation.id is null then 0 else private.fn_budget_reserved_balance(v_obligation.id) end;
      v_paid:=case when v_obligation.id is null then 0 else private.fn_budget_obligation_paid_amount(v_obligation.id) end;
      projection_key:=s.item_id::text||'|'||v_due::text; item_id:=s.item_id; due_date:=v_due; accrual_start:=v_accrual;
      expected_amount:=round(greatest(coalesce(v_expected,0),0),2); reserved_amount:=round(greatest(coalesce(v_reserved,0),0),2);
      paid_amount:=round(greatest(coalesce(v_paid,0),0),2); obligation_id:=v_obligation.id; return next; continue;
    end if;

    v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
    if v_months<=0 then continue; end if;
    for i in -240..240 loop
      v_due:=(s.anchor_date+make_interval(months=>i*v_months))::date;
      continue when v_due<v_start or v_due>v_end or v_due<s.valid_from or (s.valid_to is not null and v_due>s.valid_to);
      v_cycle_start:=(v_due-make_interval(months=>v_months)+interval '1 day')::date;
      v_accrual:=case s.accrual_start_rule when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date else v_cycle_start end;
      v_accrual:=greatest(v_baseline,s.valid_from,least(v_accrual,v_due));
      v_obligation:=null;
      select * into v_obligation from public.budget_obligations o where o.item_id=s.item_id and o.due_date=v_due limit 1;
      if v_obligation.id is not null and v_obligation.status='cancelled' then continue; end if;
      v_expected:=coalesce(nullif(v_obligation.expected_amount,0),private.fn_budget_forecast_default_amount(s.item_id,v_due));
      v_reserved:=case when v_obligation.id is null then 0 else private.fn_budget_reserved_balance(v_obligation.id) end;
      v_paid:=case when v_obligation.id is null then 0 else private.fn_budget_obligation_paid_amount(v_obligation.id) end;
      projection_key:=s.item_id::text||'|'||v_due::text; item_id:=s.item_id; due_date:=v_due; accrual_start:=v_accrual;
      expected_amount:=round(greatest(coalesce(v_expected,0),0),2); reserved_amount:=round(greatest(coalesce(v_reserved,0),0),2);
      paid_amount:=round(greatest(coalesce(v_paid,0),0),2); obligation_id:=v_obligation.id; return next;
    end loop;
  end loop;
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
  v_simulated jsonb:='{}'::jsonb;
  r record;
  v_key text;
  v_sim_reserved numeric;
  v_remaining numeric;
  v_window_days integer;
  v_overlap_start date;
  v_overlap_end date;
  v_overlap_days integer;
  v_contribution numeric;
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  if p_months not between 1 and 24 then raise exception 'أفق التوقع يجب أن يكون بين شهر و24 شهرًا'; end if;
  for i in 0..p_months-1 loop
    v_month:=(v_start+make_interval(months=>i))::date;
    v_month_end:=(v_month+interval '1 month - 1 day')::date;
    v_due:=0; v_reserve:=0;
    for r in select * from private.fn_budget_project_obligation_cycles(v_start,p_months+12) loop
      v_key:=r.projection_key;
      v_sim_reserved:=coalesce((v_simulated->>v_key)::numeric,r.reserved_amount,0);
      if r.due_date between v_month and v_month_end then
        v_due:=v_due+greatest(r.expected_amount-r.paid_amount,0);
      elsif r.due_date>v_month_end and r.accrual_start<=v_month_end then
        v_remaining:=greatest(r.expected_amount-v_sim_reserved,0);
        v_overlap_start:=greatest(r.accrual_start,v_month);
        v_overlap_end:=least(r.due_date,v_month_end);
        v_window_days:=greatest(1,r.due_date-r.accrual_start+1);
        v_overlap_days:=greatest(0,v_overlap_end-v_overlap_start+1);
        if v_overlap_days>0 and v_remaining>0 then
          v_contribution:=round(r.expected_amount*v_overlap_days/v_window_days,2);
          v_contribution:=least(v_contribution,v_remaining);
          v_reserve:=v_reserve+v_contribution;
          v_simulated:=jsonb_set(v_simulated,array[v_key],to_jsonb(round(v_sim_reserved+v_contribution,2)),true);
        end if;
      end if;
    end loop;
    period_start:=v_month; expected_due:=round(v_due,2); required_reserve:=round(v_reserve,2); planned_total:=round(v_due+v_reserve,2); return next;
  end loop;
end;
$function$;

create or replace function private.fn_budget_rpc_period_statement_v2(p_period_id uuid)
returns table(line_id uuid,obligation_id uuid,item_id uuid,parent_item_id uuid,group_key text,item_name text,parent_name text,unit_label text,calculation_type text,recurrence_unit text,recurrence_interval_count integer,cycle_months integer,cash_effect_type text,due_date date,expected_amount numeric,cycle_amount numeric,monthly_cost numeric,accumulated_cost numeric,has_due_in_period boolean,due_amount_this_period numeric,amount_due_now numeric,payment_due_date date,next_due_date date,payment_status text,confirmed_amount numeric,paid_amount numeric,unpaid_amount numeric,required_reserve numeric,reserved_outstanding numeric,reserve_gap numeric,variable_inputs jsonb,line_override_params jsonb)
language plpgsql
security definer
set search_path=''
as $function$
declare
  p public.budget_periods;
  v_as_of date;
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  select * into p from public.budget_periods where id=p_period_id;
  if p.id is null then raise exception 'الشهر غير موجود'; end if;
  v_as_of:=case when current_date<p.period_start then p.period_start-1 when current_date>p.period_end then p.period_end else current_date end;

  return query
  with base as (
    select l.*,i.parent_item_id,i.group_key,i.name item_name,par.name parent_name,i.unit_label,i.calculation_type,
      s.recurrence_unit,s.recurrence_interval_count,
      case when s.recurrence_unit='one_time' then 0 else private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count) end cycle_months,
      private.fn_budget_obligation_due_amount(o.id) cycle_amount,
      private.fn_budget_obligation_paid_amount(o.id) obligation_paid
    from public.budget_period_lines l
    join public.budget_item_definitions i on i.id=l.item_id
    left join public.budget_item_definitions par on par.id=i.parent_item_id
    join public.budget_obligations o on o.id=l.obligation_id
    join public.budget_item_schedules s on s.id=o.schedule_id
    where l.period_id=p_period_id
  ), enriched as (
    select b.*,
      private.fn_budget_item_daily_cost_between(b.item_id,p.period_start,p.period_end) monthly_cost,
      private.fn_budget_cycle_accumulated(b.obligation_id,p_period_id) accumulated_cost,
      greatest(b.cycle_amount-b.obligation_paid,0) current_remaining,
      private.fn_budget_item_outstanding_as_of(b.item_id,v_as_of) item_outstanding,
      private.fn_budget_item_oldest_unpaid_due(b.item_id,v_as_of) oldest_unpaid_due
    from base b
  )
  select e.id,e.obligation_id,e.item_id,e.parent_item_id,e.group_key,e.item_name,e.parent_name,e.unit_label,e.calculation_type,
    e.recurrence_unit,e.recurrence_interval_count,e.cycle_months,e.cash_effect_type,e.due_date,e.expected_amount,e.cycle_amount,
    e.monthly_cost,e.accumulated_cost,(e.due_date between p.period_start and p.period_end),
    case when e.due_date between p.period_start and p.period_end then e.cycle_amount else 0 end,
    e.item_outstanding,
    coalesce(e.oldest_unpaid_due,case when e.due_date between p.period_start and p.period_end then e.due_date else null end),
    (select min(oo.due_date) from public.budget_obligations oo where oo.item_id=e.item_id and oo.status<>'cancelled' and oo.due_date>v_as_of),
    case when e.item_outstanding>0 and e.oldest_unpaid_due<v_as_of then 'overdue'
         when e.item_outstanding>0 and e.oldest_unpaid_due=v_as_of then 'due'
         when e.due_date between p.period_start and p.period_end and e.current_remaining<=0 then 'paid' else 'not_due' end,
    private.fn_budget_effective_confirmed(e.id),e.obligation_paid,e.item_outstanding,e.required_reserve,
    private.fn_budget_reserved_balance(e.obligation_id),
    greatest(e.required_reserve-coalesce((select sum(case when rm.direction='reserve' then rm.amount else -rm.amount end)
      from public.budget_reserve_movements rm where rm.obligation_id=e.obligation_id and rm.period_id=e.period_id),0),0),
    e.variable_inputs,e.line_override_params
  from enriched e order by e.group_key,e.parent_name,e.item_name;
end;
$function$;

-- Rebuild obligations from the unified source baseline, then regenerate already-open months.
do $rebuild$
declare r record;
begin
  for r in select id from public.budget_item_definitions where node_type='item' and is_active=true loop
    perform private.fn_budget_ensure_obligation_cycles(r.id,private.fn_budget_baseline_date(),60);
  end loop;
  for r in select id from public.budget_periods where status='open' order by period_start loop
    perform private.fn_budget_generate_period(r.id);
  end loop;
end
$rebuild$;
