-- Reserve planning law:
-- 1) The first obligation of a rule starts accumulating on the rule effective date.
-- 2) Later obligations start the day after the previous due date.
-- 3) The full obligation is spread by actual calendar days until its due date.
-- 4) The due month still has a reserve allocation for its days; cash due and reserve allocation stay separate facts.

-- We are rebuilding only derived planning truth. Do not rewrite a budget that already
-- produced a confirmed/reserved/treasury-backed consequence.
do $guard$
begin
  if exists(select 1 from public.budget_line_settlements)
     or exists(select 1 from public.budget_obligation_settlements)
     or exists(select 1 from public.budget_reserve_movements)
     or exists(select 1 from public.budget_period_lines where confirmed_amount is not null)
     or exists(select 1 from public.budget_period_cash_events) then
    raise exception 'لا يمكن إعادة بناء خطة الحجز بعد وجود أثر مالي مثبت';
  end if;
end
$guard$;

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
        v_accrual:=least(v_window_start,v_due);
        insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
        values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),v_accrual,v_due,true)
        on conflict(item_id,due_date) do update set
          schedule_id=excluded.schedule_id,
          cycle_label=excluded.cycle_label,
          accrual_start=excluded.accrual_start,
          status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
      end if;
      continue;
    end if;

    v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
    if v_months<=0 then continue; end if;

    for i in -240..240 loop
      v_due:=(s.anchor_date+make_interval(months=>i*v_months))::date;
      continue when v_due<v_window_start or v_due>v_window_end;
      v_cycle_start:=(v_due-make_interval(months=>v_months)+interval '1 day')::date;
      -- First partial cycle starts at the rule effective date; later cycles naturally
      -- start the day after the previous due date.
      v_accrual:=greatest(v_window_start,v_cycle_start);
      v_accrual:=least(v_accrual,v_due);
      insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
      values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),v_accrual,v_due,true)
      on conflict(item_id,due_date) do update set
        schedule_id=excluded.schedule_id,
        cycle_label=excluded.cycle_label,
        accrual_start=excluded.accrual_start,
        status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
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
  v_effective_start date;
  v_start date;
  v_end date;
  v_window_days int;
  v_days int;
  v_baseline date:=private.fn_budget_baseline_date();
begin
  if p_from is null or p_to is null or p_to<p_from then return 0; end if;
  select * into o from public.budget_obligations where id=p_obligation_id and status<>'cancelled';
  if o.id is null then return 0; end if;
  select * into s from public.budget_item_schedules where id=o.schedule_id;
  if s.id is null then return 0; end if;

  v_amount:=private.fn_budget_obligation_due_amount(o.id);
  v_effective_start:=greatest(o.accrual_start,s.valid_from,v_baseline);
  v_start:=greatest(v_effective_start,p_from);
  v_end:=least(o.due_date,p_to);
  if v_end<v_start then return 0; end if;

  -- The denominator is the *actual active reserve window*, not the nominal
  -- quarter/half-year/year that may have started before this rule existed.
  v_window_days:=greatest(1,o.due_date-v_effective_start+1);
  v_days:=v_end-v_start+1;
  return round(v_amount*v_days/v_window_days,2);
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
  if o.id is null or p.id is null or p.period_start>o.due_date then return 0; end if;

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
      v_accrual:=greatest(v_baseline,s.valid_from);
      v_accrual:=least(v_accrual,v_due);
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
      v_accrual:=greatest(v_baseline,s.valid_from,v_cycle_start);
      v_accrual:=least(v_accrual,v_due);
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
  v_reserve_before_due numeric;
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
    v_due:=0; v_reserve:=0; v_reserve_before_due:=0;

    for r in select * from private.fn_budget_project_obligation_cycles(v_start,p_months+12) loop
      v_key:=r.projection_key;
      v_sim_reserved:=coalesce((v_simulated->>v_key)::numeric,r.reserved_amount,0);

      if r.accrual_start<=v_month_end and r.due_date>=v_month then
        v_remaining:=greatest(r.expected_amount-v_sim_reserved,0);
        v_overlap_start:=greatest(r.accrual_start,v_month);
        v_overlap_end:=least(r.due_date,v_month_end);
        v_window_days:=greatest(1,r.due_date-r.accrual_start+1);
        v_overlap_days:=greatest(0,v_overlap_end-v_overlap_start+1);
        if v_overlap_days>0 and v_remaining>0 then
          v_contribution:=round(r.expected_amount*v_overlap_days/v_window_days,2);
          v_contribution:=least(v_contribution,v_remaining);
          v_reserve:=v_reserve+v_contribution;
          -- planned_total must not double-count the due-month allocation as a second cash outflow.
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

create or replace function private.fn_budget_generate_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  p public.budget_periods;
  r record;
  o public.budget_obligations;
  v_rate uuid;
  v_rate_as_of date;
  v_prev jsonb;
  v_amount numeric;
  v_snapshot jsonb;
  v_effect text;
  v_req numeric;
begin
  select * into p from public.budget_periods where id=p_period_id;
  if p.id is null or p.status='closed' then raise exception 'الشهر غير متاح للتوليد'; end if;

  for r in
    select d.id
    from public.budget_item_definitions d
    where d.node_type='item' and d.is_active=true
      and exists(
        select 1 from public.budget_item_schedules s
        where s.item_id=d.id
          and s.valid_from<=p.period_end
          and (s.valid_to is null or s.valid_to>=p.period_start)
      )
    order by d.sort_order,d.name
  loop
    perform private.fn_budget_ensure_obligation_cycles(r.id,p.period_start,24);

    select oo.* into o
    from public.budget_obligations oo
    join public.budget_item_schedules ss on ss.id=oo.schedule_id
    where oo.item_id=r.id
      and oo.status<>'cancelled'
      and ss.valid_from<=p.period_end
      and (ss.valid_to is null or ss.valid_to>=p.period_start)
      and oo.due_date>=p.period_start
    order by oo.due_date
    limit 1;

    if o.id is null then continue; end if;
    if exists(select 1 from public.budget_period_lines where period_id=p.id and item_id=r.id) then continue; end if;

    v_rate_as_of:=least(greatest(o.accrual_start,p.period_start),p.period_end);
    v_rate:=private.fn_budget_resolve_rate_version(r.id,v_rate_as_of);

    select variable_inputs into v_prev
    from public.budget_period_lines l
    join public.budget_periods pp on pp.id=l.period_id
    where l.item_id=r.id and pp.period_start<p.period_start
    order by pp.period_start desc limit 1;

    select amount,snapshot into v_amount,v_snapshot
    from private.fn_budget_compute_line_amount(r.id,p.id,v_rate,v_prev,null);

    if o.expected_amount=0 and v_amount>=0 then
      update public.budget_obligations set expected_amount=v_amount where id=o.id;
      o.expected_amount:=v_amount;
    end if;

    v_effect:=case when o.due_date between p.period_start and p.period_end then 'due_now' else 'reserve_only' end;
    v_req:=private.fn_budget_required_reserve(o.id,p.id);

    insert into public.budget_period_lines(
      period_id,item_id,obligation_id,rate_version_id,calculation_snapshot,variable_inputs,
      due_date,cash_effect_type,expected_amount,required_reserve
    ) values(
      p.id,r.id,o.id,v_rate,v_snapshot,v_prev,o.due_date,v_effect,greatest(o.expected_amount,v_amount),v_req
    );
  end loop;
end;
$function$;

-- Derived planning rows are safe to rebuild because the guard proved there is no consequence.
delete from public.budget_obligation_estimate_events;
delete from public.budget_period_lines;
delete from public.budget_obligations;

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
