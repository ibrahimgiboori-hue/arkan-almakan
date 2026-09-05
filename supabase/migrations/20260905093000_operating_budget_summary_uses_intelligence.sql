create or replace function private.fn_budget_rpc_period_summary_v2(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_monthly numeric;
  v_accum numeric;
  v_due numeric;
  v_due_now numeric;
  v_overdue numeric;
  v_intelligence jsonb;
  v_i_summary jsonb;
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  v_base:=private.fn_budget_rpc_period_summary(p_period_id);

  select
    coalesce(sum(monthly_cost),0),
    coalesce(sum(accumulated_cost),0),
    coalesce(sum(due_amount_this_period),0),
    coalesce(sum(amount_due_now),0),
    coalesce(sum(case when payment_status='overdue' then amount_due_now else 0 end),0)
  into v_monthly,v_accum,v_due,v_due_now,v_overdue
  from private.fn_budget_rpc_period_statement_v2(p_period_id);

  v_intelligence:=private.fn_budget_rpc_period_intelligence_v1(p_period_id);
  v_i_summary:=coalesce(v_intelligence->'summary','{}'::jsonb);

  return v_base||jsonb_build_object(
    'monthly_operating_cost',round(v_monthly,2),
    'accumulated_cycle_cost',round(v_accum,2),
    'scheduled_due_this_period',round(v_due,2),
    'amount_due_now',round(v_due_now,2),
    'overdue_amount',round(v_overdue,2),
    'paid',coalesce((v_i_summary->>'actual_paid_this_period')::numeric,0),
    'planned_cash_outflow',coalesce((v_i_summary->>'planned_due_this_period')::numeric,0),
    'actual_cash_outflow',coalesce((v_i_summary->>'actual_paid_this_period')::numeric,0),
    'cash_variance',coalesce((v_i_summary->>'cash_variance')::numeric,0),
    'opening_outstanding',coalesce((v_i_summary->>'opening_outstanding')::numeric,0),
    'closing_outstanding',coalesce((v_i_summary->>'closing_outstanding')::numeric,0),
    'outstanding_change',coalesce((v_i_summary->>'outstanding_change')::numeric,0),
    'outstanding_obligation_count',coalesce((v_i_summary->>'outstanding_obligation_count')::numeric,0),
    'analysis_as_of',v_i_summary->>'as_of'
  );
end;
$function$;
