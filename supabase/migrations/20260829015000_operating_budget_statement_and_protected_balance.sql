drop function if exists public.budget_period_statement(uuid);
drop function if exists private.fn_budget_rpc_period_statement(uuid);

create function private.fn_budget_rpc_period_statement(p_period_id uuid)
returns table(line_id uuid,obligation_id uuid,item_id uuid,parent_item_id uuid,group_key text,item_name text,parent_name text,unit_label text,calculation_type text,cash_effect_type text,due_date date,expected_amount numeric,confirmed_amount numeric,paid_amount numeric,unpaid_amount numeric,required_reserve numeric,reserved_outstanding numeric,reserve_gap numeric,variable_inputs jsonb,line_override_params jsonb)
language plpgsql security definer set search_path='' as $$
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  return query
  select l.id,l.obligation_id,l.item_id,i.parent_item_id,i.group_key,i.name,p.name,i.unit_label,i.calculation_type,l.cash_effect_type,l.due_date,l.expected_amount,
    private.fn_budget_effective_confirmed(l.id),private.fn_budget_paid_amount(l.id),greatest(coalesce(private.fn_budget_effective_confirmed(l.id),l.expected_amount)-private.fn_budget_paid_amount(l.id),0),
    l.required_reserve,private.fn_budget_reserved_balance(l.obligation_id),
    greatest(l.required_reserve-coalesce((select sum(case when rm.direction='reserve' then rm.amount else -rm.amount end) from public.budget_reserve_movements rm where rm.obligation_id=l.obligation_id and rm.period_id=l.period_id),0),0),
    l.variable_inputs,l.line_override_params
  from public.budget_period_lines l
  join public.budget_item_definitions i on i.id=l.item_id
  left join public.budget_item_definitions p on p.id=i.parent_item_id
  where l.period_id=p_period_id
  order by i.group_key,p.sort_order,i.sort_order,i.name;
end;$$;

create function public.budget_period_statement(p_period_id uuid)
returns table(line_id uuid,obligation_id uuid,item_id uuid,parent_item_id uuid,group_key text,item_name text,parent_name text,unit_label text,calculation_type text,cash_effect_type text,due_date date,expected_amount numeric,confirmed_amount numeric,paid_amount numeric,unpaid_amount numeric,required_reserve numeric,reserved_outstanding numeric,reserve_gap numeric,variable_inputs jsonb,line_override_params jsonb)
language sql security invoker set search_path='' as $$ select * from private.fn_budget_rpc_period_statement(p_period_id) $$;
revoke all on function public.budget_period_statement(uuid) from public,anon;
grant execute on function public.budget_period_statement(uuid) to authenticated,service_role;
revoke all on function private.fn_budget_rpc_period_statement(uuid) from public,anon;
grant execute on function private.fn_budget_rpc_period_statement(uuid) to authenticated,service_role;

create or replace function private.fn_budget_rpc_period_summary(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_open numeric; v_due numeric; v_confirmed numeric; v_paid numeric; v_req numeric; v_reserved_month numeric; v_protected numeric;
  v_in numeric; v_out numeric; v_min_cash numeric; v_min_free numeric;
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  select opening_bank_balance into v_open from public.budget_periods where id=p_period_id;
  select coalesce(sum(case when cash_effect_type='due_now' then expected_amount else 0 end),0),
    coalesce(sum(case when cash_effect_type='due_now' then coalesce(private.fn_budget_effective_confirmed(id),expected_amount) else 0 end),0),
    coalesce(sum(private.fn_budget_paid_amount(id)),0),
    coalesce(sum(case when cash_effect_type='reserve_only' then required_reserve else 0 end),0)
  into v_due,v_confirmed,v_paid,v_req from public.budget_period_lines where period_id=p_period_id;
  select coalesce(sum(case when direction='reserve' then amount else -amount end),0) into v_reserved_month from public.budget_reserve_movements where period_id=p_period_id;
  select coalesce(sum(private.fn_budget_reserved_balance(x.obligation_id)),0) into v_protected from (select distinct obligation_id from public.budget_period_lines where period_id=p_period_id) x;
  select coalesce(sum(amount) filter(where direction='in' and lifecycle_status<>'cancelled'),0),coalesce(sum(amount) filter(where direction='out' and lifecycle_status<>'cancelled'),0)
  into v_in,v_out from public.budget_period_cash_events where period_id=p_period_id;
  select min(bank_balance),min(free_balance) into v_min_cash,v_min_free from private.fn_budget_period_cashflow_curve(p_period_id);
  return jsonb_build_object(
    'opening_bank_balance',v_open,
    'protected_balance',v_protected,
    'free_opening_balance',case when v_open is null then null else v_open-v_protected end,
    'expected_due',v_due,
    'confirmed_due',v_confirmed,
    'paid',v_paid,
    'required_reserve',v_req,
    'reserved_this_period',v_reserved_month,
    'reserve_gap',greatest(v_req-v_reserved_month,0),
    'expected_inflows',v_in,
    'expected_other_outflows',v_out,
    'plan_surplus_deficit',case when v_open is null then null else v_open+v_in-v_out-v_confirmed-v_req end,
    'min_expected_cash',v_min_cash,
    'min_expected_free_balance',v_min_free
  );
end;$$;
