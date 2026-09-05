create or replace function private.fn_budget_rpc_period_intelligence_v1(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  p public.budget_periods;
  v_as_of date;
  v_summary jsonb;
  v_items jsonb;
  v_variance_drivers jsonb;
  v_outstanding_drivers jsonb;
begin
  perform private.fn_budget_require('finance.operating_budget.view');

  select * into p
  from public.budget_periods
  where id=p_period_id;

  if p.id is null then
    raise exception 'الشهر غير موجود';
  end if;

  v_as_of:=case
    when current_date<p.period_start then p.period_start-1
    when current_date>p.period_end then p.period_end
    else current_date
  end;

  with statement as (
    select * from private.fn_budget_rpc_period_statement_v2(p_period_id)
  ), item_metrics as (
    select
      s.item_id,
      max(s.item_name) item_name,
      coalesce(max(s.due_amount_this_period),0) planned_due_this_period,
      private.fn_budget_item_paid_between(s.item_id,p.period_start,v_as_of) actual_paid_this_period,
      private.fn_budget_item_outstanding_as_of(s.item_id,p.period_start-1) opening_outstanding,
      private.fn_budget_item_outstanding_as_of(s.item_id,v_as_of) closing_outstanding,
      private.fn_budget_item_oldest_unpaid_due(s.item_id,v_as_of) oldest_unpaid_due,
      (
        select count(*)::int
        from public.budget_obligations o
        where o.item_id=s.item_id
          and o.status<>'cancelled'
          and o.due_date<=v_as_of
          and private.fn_budget_obligation_paid_amount(o.id)<private.fn_budget_obligation_due_amount(o.id)
      ) outstanding_count
    from statement s
    group by s.item_id
  ), metrics as (
    select *,
      round(actual_paid_this_period-planned_due_this_period,2) cash_variance,
      round(closing_outstanding-opening_outstanding,2) outstanding_change
    from item_metrics
  )
  select jsonb_build_object(
      'period_id',p.id,
      'period_start',p.period_start,
      'period_end',p.period_end,
      'as_of',v_as_of,
      'planned_due_this_period',round(coalesce(sum(planned_due_this_period),0),2),
      'actual_paid_this_period',round(coalesce(sum(actual_paid_this_period),0),2),
      'cash_variance',round(coalesce(sum(actual_paid_this_period-planned_due_this_period),0),2),
      'opening_outstanding',round(coalesce(sum(opening_outstanding),0),2),
      'closing_outstanding',round(coalesce(sum(closing_outstanding),0),2),
      'outstanding_change',round(coalesce(sum(closing_outstanding-opening_outstanding),0),2),
      'outstanding_obligation_count',coalesce(sum(outstanding_count),0)
    )
  into v_summary
  from metrics;

  with statement as (
    select * from private.fn_budget_rpc_period_statement_v2(p_period_id)
  ), item_metrics as (
    select
      s.item_id,
      max(s.item_name) item_name,
      coalesce(max(s.due_amount_this_period),0) planned_due_this_period,
      private.fn_budget_item_paid_between(s.item_id,p.period_start,v_as_of) actual_paid_this_period,
      private.fn_budget_item_outstanding_as_of(s.item_id,p.period_start-1) opening_outstanding,
      private.fn_budget_item_outstanding_as_of(s.item_id,v_as_of) closing_outstanding,
      private.fn_budget_item_oldest_unpaid_due(s.item_id,v_as_of) oldest_unpaid_due,
      (
        select count(*)::int
        from public.budget_obligations o
        where o.item_id=s.item_id
          and o.status<>'cancelled'
          and o.due_date<=v_as_of
          and private.fn_budget_obligation_paid_amount(o.id)<private.fn_budget_obligation_due_amount(o.id)
      ) outstanding_count
    from statement s
    group by s.item_id
  ), metrics as (
    select *,
      round(actual_paid_this_period-planned_due_this_period,2) cash_variance,
      round(closing_outstanding-opening_outstanding,2) outstanding_change
    from item_metrics
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'item_id',item_id,
      'item_name',item_name,
      'planned_due_this_period',round(planned_due_this_period,2),
      'actual_paid_this_period',round(actual_paid_this_period,2),
      'cash_variance',cash_variance,
      'opening_outstanding',round(opening_outstanding,2),
      'closing_outstanding',round(closing_outstanding,2),
      'outstanding_change',outstanding_change,
      'outstanding_count',outstanding_count,
      'oldest_unpaid_due',oldest_unpaid_due
    ) order by item_name),'[]'::jsonb)
  into v_items
  from metrics;

  with statement as (
    select * from private.fn_budget_rpc_period_statement_v2(p_period_id)
  ), metrics as (
    select
      s.item_id,
      max(s.item_name) item_name,
      coalesce(max(s.due_amount_this_period),0) planned_due_this_period,
      private.fn_budget_item_paid_between(s.item_id,p.period_start,v_as_of) actual_paid_this_period
    from statement s
    group by s.item_id
  )
  select coalesce(jsonb_agg(driver order by abs((driver->>'cash_variance')::numeric) desc),'[]'::jsonb)
  into v_variance_drivers
  from (
    select jsonb_build_object(
      'item_id',item_id,
      'item_name',item_name,
      'planned_due_this_period',round(planned_due_this_period,2),
      'actual_paid_this_period',round(actual_paid_this_period,2),
      'cash_variance',round(actual_paid_this_period-planned_due_this_period,2)
    ) driver
    from metrics
    where actual_paid_this_period<>planned_due_this_period
    order by abs(actual_paid_this_period-planned_due_this_period) desc,item_name
    limit 5
  ) ranked;

  with statement as (
    select * from private.fn_budget_rpc_period_statement_v2(p_period_id)
  ), metrics as (
    select
      s.item_id,
      max(s.item_name) item_name,
      private.fn_budget_item_outstanding_as_of(s.item_id,v_as_of) closing_outstanding,
      private.fn_budget_item_oldest_unpaid_due(s.item_id,v_as_of) oldest_unpaid_due,
      (
        select count(*)::int
        from public.budget_obligations o
        where o.item_id=s.item_id
          and o.status<>'cancelled'
          and o.due_date<=v_as_of
          and private.fn_budget_obligation_paid_amount(o.id)<private.fn_budget_obligation_due_amount(o.id)
      ) outstanding_count
    from statement s
    group by s.item_id
  )
  select coalesce(jsonb_agg(driver order by (driver->>'closing_outstanding')::numeric desc),'[]'::jsonb)
  into v_outstanding_drivers
  from (
    select jsonb_build_object(
      'item_id',item_id,
      'item_name',item_name,
      'closing_outstanding',round(closing_outstanding,2),
      'outstanding_count',outstanding_count,
      'oldest_unpaid_due',oldest_unpaid_due
    ) driver
    from metrics
    where closing_outstanding>0
    order by closing_outstanding desc,item_name
    limit 5
  ) ranked;

  return jsonb_build_object(
    'summary',coalesce(v_summary,'{}'::jsonb),
    'items',coalesce(v_items,'[]'::jsonb),
    'cash_variance_drivers',coalesce(v_variance_drivers,'[]'::jsonb),
    'outstanding_drivers',coalesce(v_outstanding_drivers,'[]'::jsonb)
  );
end;
$function$;

create or replace function public.budget_period_intelligence_v1(p_period_id uuid)
returns jsonb
language sql
set search_path=''
as $function$
  select private.fn_budget_rpc_period_intelligence_v1(p_period_id)
$function$;

grant execute on function public.budget_period_intelligence_v1(uuid) to authenticated;
