create table if not exists public.budget_obligation_settlements (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.budget_obligations(id) on delete restrict,
  treasury_movement_id uuid not null references public.treasury_movements(id) on delete restrict,
  amount numeric not null check (amount > 0),
  settlement_mode text not null default 'fifo_outstanding' check (settlement_mode in ('fifo_outstanding','linked_existing')),
  settled_at timestamptz not null default now(),
  recorded_by uuid references public.app_users(id)
);

create index if not exists budget_obligation_settlements_obligation_idx on public.budget_obligation_settlements(obligation_id);
create index if not exists budget_obligation_settlements_treasury_idx on public.budget_obligation_settlements(treasury_movement_id);
alter table public.budget_obligation_settlements enable row level security;

create or replace function private.fn_budget_obligation_paid_amount(p_obligation_id uuid)
returns numeric language sql stable security definer set search_path='' as $function$
  select coalesce((select sum(x.amount) from (
    select s.amount from public.budget_line_settlements s
    join public.budget_period_lines l on l.id=s.period_line_id
    join public.treasury_movements t on t.id=s.treasury_movement_id and t.status='posted'
    where l.obligation_id=p_obligation_id
    union all
    select s.amount from public.budget_obligation_settlements s
    join public.treasury_movements t on t.id=s.treasury_movement_id and t.status='posted'
    where s.obligation_id=p_obligation_id
  ) x),0)
$function$;

create or replace function private.fn_budget_item_outstanding_as_of(p_item_id uuid,p_as_of date)
returns numeric language sql stable security definer set search_path='' as $function$
  select coalesce(sum(greatest(private.fn_budget_obligation_due_amount(o.id)-private.fn_budget_obligation_paid_amount(o.id),0)),0)
  from public.budget_obligations o
  where o.item_id=p_item_id and o.status<>'cancelled' and o.due_date<=p_as_of
$function$;

create or replace function private.fn_budget_item_oldest_unpaid_due(p_item_id uuid,p_as_of date)
returns date language sql stable security definer set search_path='' as $function$
  select min(o.due_date) from public.budget_obligations o
  where o.item_id=p_item_id and o.status<>'cancelled' and o.due_date<=p_as_of
    and private.fn_budget_obligation_paid_amount(o.id)<private.fn_budget_obligation_due_amount(o.id)
$function$;

create or replace function private.fn_budget_item_paid_between(p_item_id uuid,p_from date,p_to date)
returns numeric language sql stable security definer set search_path='' as $function$
  select coalesce(sum(x.amount),0) from (
    select s.amount from public.budget_line_settlements s
    join public.budget_period_lines l on l.id=s.period_line_id
    join public.treasury_movements t on t.id=s.treasury_movement_id and t.status='posted'
    where l.item_id=p_item_id and t.movement_date between p_from and p_to
    union all
    select s.amount from public.budget_obligation_settlements s
    join public.budget_obligations o on o.id=s.obligation_id
    join public.treasury_movements t on t.id=s.treasury_movement_id and t.status='posted'
    where o.item_id=p_item_id and t.movement_date between p_from and p_to
  ) x
$function$;

create or replace function private.fn_budget_item_has_committed_action(p_item_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(
    select 1 from public.budget_period_lines l
    join public.budget_periods p on p.id=l.period_id
    where l.item_id=p_item_id and (
      l.confirmed_amount is not null or p.status='closed'
      or exists(select 1 from public.budget_line_settlements s where s.period_line_id=l.id)
      or exists(select 1 from public.budget_reserve_movements rm where rm.obligation_id=l.obligation_id)
    )
  ) or exists(
    select 1 from public.budget_obligations o
    where o.item_id=p_item_id and (
      o.status='settled' or exists(select 1 from public.budget_obligation_settlements s where s.obligation_id=o.id)
    )
  );
$function$;

create or replace function private.fn_budget_ensure_obligation_cycles(p_item_id uuid,p_from_date date,p_horizon_months integer default 24)
returns void language plpgsql security definer set search_path='' as $function$
declare
  s public.budget_item_schedules;
  v_months int; i int; v_due date; v_accrual date; v_name text;
  v_horizon_end date; v_window_start date; v_window_end date;
begin
  select name into v_name from public.budget_item_definitions where id=p_item_id and node_type='item';
  if v_name is null then return; end if;
  v_horizon_end := (p_from_date + make_interval(months=>p_horizon_months))::date;

  for s in select * from public.budget_item_schedules where item_id=p_item_id and valid_from<=v_horizon_end order by valid_from loop
    v_window_start := s.valid_from;
    v_window_end := least(v_horizon_end,coalesce(s.valid_to,v_horizon_end));
    if v_window_end<v_window_start then continue; end if;

    if s.recurrence_unit='one_time' then
      v_due:=s.anchor_date;
      if v_due between v_window_start and v_window_end then
        v_accrual:=case s.accrual_start_rule
          when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date
          when 'from_period_start' then date_trunc('month',v_due)::date else s.valid_from end;
        insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
        values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),least(v_accrual,v_due),v_due,true)
        on conflict(item_id,due_date) do update set schedule_id=excluded.schedule_id,cycle_label=excluded.cycle_label,
          accrual_start=excluded.accrual_start,status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
      end if;
      continue;
    end if;

    v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
    for i in 0..240 loop
      v_due:=(s.anchor_date+make_interval(months=>i*v_months))::date;
      exit when v_due>v_window_end;
      continue when v_due<v_window_start;
      v_accrual:=case s.accrual_start_rule
        when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date
        when 'from_period_start' then date_trunc('month',v_due)::date
        else (v_due-make_interval(months=>v_months)+interval '1 day')::date end;
      insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
      values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),least(v_accrual,v_due),v_due,true)
      on conflict(item_id,due_date) do update set schedule_id=excluded.schedule_id,cycle_label=excluded.cycle_label,
        accrual_start=excluded.accrual_start,status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
    end loop;
  end loop;
end;
$function$;

do $backfill$
declare r record;
begin
  for r in
    select d.id,min(s.valid_from) as first_valid_from
    from public.budget_item_definitions d
    join public.budget_item_schedules s on s.item_id=d.id
    where d.node_type='item' and d.is_active=true
    group by d.id
  loop
    perform private.fn_budget_ensure_obligation_cycles(r.id,r.first_valid_from,60);
  end loop;
end
$backfill$;

create or replace function private.fn_budget_rpc_period_statement_v2(p_period_id uuid)
returns table(line_id uuid, obligation_id uuid, item_id uuid, parent_item_id uuid, group_key text, item_name text, parent_name text, unit_label text, calculation_type text, recurrence_unit text, recurrence_interval_count integer, cycle_months integer, cash_effect_type text, due_date date, expected_amount numeric, cycle_amount numeric, monthly_cost numeric, accumulated_cost numeric, has_due_in_period boolean, due_amount_this_period numeric, amount_due_now numeric, payment_due_date date, next_due_date date, payment_status text, confirmed_amount numeric, paid_amount numeric, unpaid_amount numeric, required_reserve numeric, reserved_outstanding numeric, reserve_gap numeric, variable_inputs jsonb, line_override_params jsonb)
language plpgsql security definer set search_path='' as $function$
declare p public.budget_periods; v_as_of date;
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
      case when b.cycle_months>0 then round(b.cycle_amount/b.cycle_months,2)
           when b.recurrence_unit='one_time' and b.due_date between p.period_start and p.period_end then b.cycle_amount else 0 end monthly_cost,
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

create or replace function private.fn_budget_rpc_pay_from_treasury(p_line_id uuid,p_account_id uuid,p_amount numeric,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $function$
declare
  v_uid uuid; l public.budget_period_lines; p public.budget_periods; a public.treasury_accounts;
  v_bal numeric; v_move uuid; v_name text; v_as_of date; v_total_due numeric; v_remaining numeric;
  v_alloc numeric; v_reserved numeric; v_release numeric; r record;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit',p_amount);
  if p_amount is null or p_amount<=0 then raise exception 'مبلغ السداد يجب أن يكون أكبر من صفر'; end if;
  if not public.has_capability('finance.treasury.pay','all',null,p_amount) then raise exception 'لا تملك صلاحية السداد من الخزينة'; end if;
  select * into l from public.budget_period_lines where id=p_line_id for update;
  if l.id is null then raise exception 'السطر غير موجود'; end if;
  perform private.fn_budget_assert_period_editable(l.period_id);
  select * into p from public.budget_periods where id=l.period_id;
  v_as_of:=case when current_date<p.period_start then p.period_start-1 when current_date>p.period_end then p.period_end else current_date end;
  v_total_due:=private.fn_budget_item_outstanding_as_of(l.item_id,v_as_of);
  if v_total_due<=0 then raise exception 'لا يوجد رصيد مستحق قابل للسداد لهذا البند'; end if;
  if p_amount>v_total_due then raise exception 'السداد يتجاوز إجمالي المستحق المتراكم'; end if;
  select * into a from public.treasury_accounts where id=p_account_id and is_active=true for update;
  if a.id is null then raise exception 'حساب الخزينة غير موجود أو غير نشط'; end if;
  v_bal:=coalesce(public.fn_treasury_current_balance(p_account_id),0);
  if not a.allow_negative and v_bal<p_amount then raise exception 'الرصيد المتاح لا يكفي'; end if;
  select name into v_name from public.budget_item_definitions where id=l.item_id;
  insert into public.treasury_movements(account_id,movement_date,direction,amount,movement_type,source_type,source_id,source_ref,counterparty_type,counterparty_name,reference,recorded_by)
  values(p_account_id,current_date,'outflow',p_amount,'operating_budget_payment','budget_item_outstanding',l.item_id,v_name,'operating_budget',v_name,nullif(trim(p_reference),''),v_uid)
  returning id into v_move;
  v_remaining:=p_amount;
  for r in
    select o.id,o.due_date,greatest(private.fn_budget_obligation_due_amount(o.id)-private.fn_budget_obligation_paid_amount(o.id),0) outstanding
    from public.budget_obligations o
    where o.item_id=l.item_id and o.status<>'cancelled' and o.due_date<=v_as_of
      and private.fn_budget_obligation_paid_amount(o.id)<private.fn_budget_obligation_due_amount(o.id)
    order by o.due_date,o.id for update
  loop
    exit when v_remaining<=0;
    v_alloc:=least(v_remaining,r.outstanding);
    if v_alloc<=0 then continue; end if;
    insert into public.budget_obligation_settlements(obligation_id,treasury_movement_id,amount,settlement_mode,recorded_by)
    values(r.id,v_move,v_alloc,'fifo_outstanding',v_uid);
    v_reserved:=greatest(private.fn_budget_reserved_balance(r.id),0);
    v_release:=least(v_reserved,v_alloc);
    if v_release>0 then
      insert into public.budget_reserve_movements(obligation_id,period_id,direction,amount,reason,is_auto_release,source_settlement_id,recorded_by)
      values(r.id,l.period_id,'release',v_release,'تصفية تلقائية للمخصص مقابل سداد المتراكم',true,null,v_uid);
    end if;
    if private.fn_budget_obligation_paid_amount(r.id)>=private.fn_budget_obligation_due_amount(r.id) then
      update public.budget_obligations set status='settled' where id=r.id;
    end if;
    v_remaining:=v_remaining-v_alloc;
  end loop;
  if v_remaining>0 then raise exception 'تعذر توزيع كامل مبلغ السداد على الاستحقاقات'; end if;
  return v_move;
end;
$function$;

create or replace function private.fn_budget_rpc_period_variance_analysis(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  p public.budget_periods; v_as_of date; v_planned numeric:=0; v_scheduled numeric:=0; v_actual_paid numeric:=0;
  v_confirmed_due numeric:=0; v_opening_outstanding numeric:=0; v_closing_outstanding numeric:=0; v_drivers jsonb:='[]'::jsonb;
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  select * into p from public.budget_periods where id=p_period_id;
  if p.id is null then raise exception 'الشهر غير موجود'; end if;
  v_as_of:=least(current_date,p.period_end);
  with st as (select * from private.fn_budget_rpc_period_statement_v2(p_period_id))
  select coalesce(sum(case when cycle_months>0 then round(expected_amount/cycle_months,2)
      else case when due_date between p.period_start and p.period_end then expected_amount else 0 end end),0),
    coalesce(sum(case when due_date between p.period_start and p.period_end then expected_amount else 0 end),0),
    coalesce(sum(case when due_date between p.period_start and p.period_end and confirmed_amount is not null then confirmed_amount else 0 end),0)
  into v_planned,v_scheduled,v_confirmed_due from st;
  select coalesce(sum(private.fn_budget_item_paid_between(i.id,p.period_start,p.period_end)),0) into v_actual_paid
  from public.budget_item_definitions i where i.node_type='item';
  select coalesce(sum(private.fn_budget_item_outstanding_as_of(i.id,p.period_start-1)),0),
         coalesce(sum(private.fn_budget_item_outstanding_as_of(i.id,v_as_of)),0)
  into v_opening_outstanding,v_closing_outstanding from public.budget_item_definitions i where i.node_type='item';
  with st as (select * from private.fn_budget_rpc_period_statement_v2(p_period_id)), per_item as (
    select item_id,max(item_name) item_name,
      sum(case when cycle_months>0 then round(expected_amount/cycle_months,2)
          else case when due_date between p.period_start and p.period_end then expected_amount else 0 end end) planned,
      private.fn_budget_item_paid_between(item_id,p.period_start,p.period_end) actual_paid
    from st group by item_id
  ), ranked as (
    select item_id,item_name,round(planned,2) planned,round(actual_paid,2) actual_paid,round(actual_paid-planned,2) variance
    from per_item order by abs(actual_paid-planned) desc,item_name limit 8
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id',item_id,'item_name',item_name,'planned',planned,'actual_paid',actual_paid,'variance',variance)
    order by abs(variance) desc),'[]'::jsonb) into v_drivers from ranked;
  return jsonb_build_object(
    'planned_operating_cost',round(v_planned,2),'scheduled_due',round(v_scheduled,2),'confirmed_due',round(v_confirmed_due,2),
    'actual_cash_paid',round(v_actual_paid,2),'cash_variance_vs_plan',round(v_actual_paid-v_planned,2),
    'cash_variance_vs_scheduled',round(v_actual_paid-v_scheduled,2),'opening_outstanding',round(v_opening_outstanding,2),
    'closing_outstanding',round(v_closing_outstanding,2),'outstanding_change',round(v_closing_outstanding-v_opening_outstanding,2),
    'top_variance_drivers',v_drivers
  );
end;
$function$;

create or replace function public.budget_period_variance_analysis(p_period_id uuid)
returns jsonb language sql set search_path='' as $function$
  select private.fn_budget_rpc_period_variance_analysis(p_period_id)
$function$;
