alter table public.budget_item_definitions add column if not exists cost_behavior text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='budget_item_cost_behavior_ck') then
    alter table public.budget_item_definitions add constraint budget_item_cost_behavior_ck check (
      (node_type='group' and cost_behavior is null)
      or
      (node_type='item' and cost_behavior in ('fixed_contractual','variable_recurring','consumable_budget','government_payroll_linked','recurring_subscription','payroll_linked','one_off'))
    );
  end if;
end $$;

create or replace function private.fn_budget_rpc_upsert_item(
  p_item_id uuid,
  p_parent_item_id uuid,
  p_branch_scope_id uuid,
  p_group_key text,
  p_name text,
  p_unit_label text,
  p_calculation_type text,
  p_external_source text,
  p_cost_behavior text,
  p_is_active boolean,
  p_notes text,
  p_sort_order integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_id uuid; v_parent_type text;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  if nullif(trim(p_group_key),'') is null or nullif(trim(p_name),'') is null then raise exception 'التصنيف واسم البند مطلوبان'; end if;
  if p_parent_item_id is not null then
    select node_type into v_parent_type from public.budget_item_definitions where id=p_parent_item_id;
    if v_parent_type is distinct from 'group' then raise exception 'المجموعة الأب غير صحيحة'; end if;
  end if;
  if p_item_id is null then
    insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,external_source,cost_behavior,is_active,notes,sort_order,created_by)
    values(p_parent_item_id,'item',p_branch_scope_id,trim(p_group_key),trim(p_name),nullif(trim(p_unit_label),''),p_calculation_type,p_external_source,p_cost_behavior,coalesce(p_is_active,true),nullif(trim(p_notes),''),coalesce(p_sort_order,0),v_uid)
    returning id into v_id;
  else
    update public.budget_item_definitions set
      parent_item_id=p_parent_item_id,
      branch_scope_id=p_branch_scope_id,
      group_key=trim(p_group_key),
      name=trim(p_name),
      unit_label=nullif(trim(p_unit_label),''),
      calculation_type=p_calculation_type,
      external_source=p_external_source,
      cost_behavior=p_cost_behavior,
      is_active=coalesce(p_is_active,true),
      notes=nullif(trim(p_notes),''),
      sort_order=coalesce(p_sort_order,0)
    where id=p_item_id and node_type='item'
    returning id into v_id;
    if v_id is null then raise exception 'البند غير موجود'; end if;
  end if;
  return v_id;
end;$$;

create or replace function private.fn_budget_rpc_set_schedule(
  p_item_id uuid,
  p_valid_from date,
  p_recurrence_unit text,
  p_recurrence_interval_count integer,
  p_anchor_date date,
  p_accrual_start_rule text,
  p_accrual_lead_months integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_current public.budget_item_schedules; v_id uuid;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  if not exists(select 1 from public.budget_item_definitions where id=p_item_id and node_type='item') then raise exception 'البند غير موجود'; end if;
  if p_valid_from is null or p_anchor_date is null then raise exception 'تاريخ السريان وتاريخ الاستحقاق المرجعي مطلوبان'; end if;

  select * into v_current from public.budget_item_schedules
  where item_id=p_item_id and valid_from<=p_valid_from and (valid_to is null or valid_to>=p_valid_from)
  order by valid_from desc limit 1 for update;

  if v_current.id is not null and v_current.valid_from=p_valid_from then
    if exists(select 1 from public.budget_obligations where schedule_id=v_current.id) then
      raise exception 'هذا الجدول استُخدم فعليًا؛ أنشئ تغييرًا بتاريخ سريان لاحق';
    end if;
    update public.budget_item_schedules set recurrence_unit=p_recurrence_unit,recurrence_interval_count=p_recurrence_interval_count,anchor_date=p_anchor_date,accrual_start_rule=p_accrual_start_rule,accrual_lead_months=p_accrual_lead_months
    where id=v_current.id returning id into v_id;
    return v_id;
  end if;

  if v_current.id is not null then update public.budget_item_schedules set valid_to=p_valid_from-1 where id=v_current.id; end if;
  insert into public.budget_item_schedules(item_id,valid_from,recurrence_unit,recurrence_interval_count,anchor_date,accrual_start_rule,accrual_lead_months,created_by)
  values(p_item_id,p_valid_from,p_recurrence_unit,coalesce(p_recurrence_interval_count,1),p_anchor_date,p_accrual_start_rule,p_accrual_lead_months,v_uid)
  returning id into v_id;
  return v_id;
end;$$;

create or replace function public.budget_open_period(p_period_start date) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_open_period(p_period_start) $$;
create or replace function public.budget_set_opening_balance(p_period_id uuid,p_amount numeric) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_set_opening_balance(p_period_id,p_amount) $$;
create or replace function public.budget_save_line_inputs(p_line_id uuid,p_inputs jsonb,p_scope text,p_reason text default null) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_save_line_inputs(p_line_id,p_inputs,p_scope,p_reason) $$;
create or replace function public.budget_recalculate_line(p_line_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_recalculate_line(p_line_id) $$;
create or replace function public.budget_confirm_line(p_line_id uuid,p_confirmed numeric,p_source text,p_note text default null) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_confirm_line(p_line_id,p_confirmed,p_source,p_note) $$;
create or replace function public.budget_reserve_adjust(p_obligation_id uuid,p_period_id uuid,p_direction text,p_amount numeric,p_reason text default null) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_reserve_adjust(p_obligation_id,p_period_id,p_direction,p_amount,p_reason) $$;
create or replace function public.budget_update_obligation_estimate(p_obligation_id uuid,p_new_amount numeric,p_reason text) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_update_obligation_estimate(p_obligation_id,p_new_amount,p_reason) $$;
create or replace function public.budget_pay_from_treasury(p_line_id uuid,p_account_id uuid,p_amount numeric,p_reference text default null) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_pay_from_treasury(p_line_id,p_account_id,p_amount,p_reference) $$;
create or replace function public.budget_link_existing_treasury(p_line_id uuid,p_treasury_id uuid,p_amount numeric) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_link_existing_treasury(p_line_id,p_treasury_id,p_amount) $$;
create or replace function public.budget_add_cash_event(p_period_id uuid,p_date date,p_direction text,p_amount numeric,p_label text) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_add_cash_event(p_period_id,p_date,p_direction,p_amount,p_label) $$;
create or replace function public.budget_update_cash_event_status(p_event_id uuid,p_status text,p_treasury_id uuid default null) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_update_cash_event_status(p_event_id,p_status,p_treasury_id) $$;
create or replace function public.budget_set_item_rate(p_item_id uuid,p_valid_from date,p_params jsonb,p_source text,p_source_note text default null,p_verified_at date default null,p_bands jsonb default '[]'::jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_set_item_rate(p_item_id,p_valid_from,p_params,p_source,p_source_note,p_verified_at,p_bands) $$;
create or replace function public.budget_upsert_item(p_item_id uuid,p_parent_item_id uuid,p_branch_scope_id uuid,p_group_key text,p_name text,p_unit_label text,p_calculation_type text,p_external_source text,p_cost_behavior text,p_is_active boolean,p_notes text,p_sort_order integer) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_upsert_item(p_item_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order) $$;
create or replace function public.budget_set_schedule(p_item_id uuid,p_valid_from date,p_recurrence_unit text,p_recurrence_interval_count integer,p_anchor_date date,p_accrual_start_rule text,p_accrual_lead_months integer default null) returns uuid language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_set_schedule(p_item_id,p_valid_from,p_recurrence_unit,p_recurrence_interval_count,p_anchor_date,p_accrual_start_rule,p_accrual_lead_months) $$;
create or replace function public.budget_period_statement(p_period_id uuid)
returns table(line_id uuid,item_id uuid,parent_item_id uuid,group_key text,item_name text,parent_name text,unit_label text,calculation_type text,cash_effect_type text,due_date date,expected_amount numeric,confirmed_amount numeric,paid_amount numeric,unpaid_amount numeric,required_reserve numeric,reserved_outstanding numeric,reserve_gap numeric,variable_inputs jsonb,line_override_params jsonb)
language sql security invoker set search_path='' as $$ select * from private.fn_budget_rpc_period_statement(p_period_id) $$;
create or replace function public.budget_period_summary(p_period_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_period_summary(p_period_id) $$;
create or replace function public.budget_cashflow_curve(p_period_id uuid) returns table(event_date date,bank_balance numeric,reserved_outstanding numeric,free_balance numeric) language sql security invoker set search_path='' as $$ select * from private.fn_budget_rpc_cashflow_curve(p_period_id) $$;
create or replace function public.budget_forecast(p_from date,p_months integer) returns table(period_start date,expected_due numeric,required_reserve numeric,planned_total numeric) language sql security invoker set search_path='' as $$ select * from private.fn_budget_rpc_forecast(p_from,p_months) $$;
create or replace function public.budget_close_period(p_period_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_close_period(p_period_id) $$;
create or replace function public.budget_reopen_period(p_period_id uuid,p_reason text) returns boolean language sql security invoker set search_path='' as $$ select private.fn_budget_rpc_reopen_period(p_period_id,p_reason) $$;

revoke insert,update,delete on public.company_branches,public.budget_item_definitions,public.budget_item_schedules,public.budget_tariff_bands from authenticated;

revoke all on function public.budget_open_period(date) from public,anon;
revoke all on function public.budget_set_opening_balance(uuid,numeric) from public,anon;
revoke all on function public.budget_save_line_inputs(uuid,jsonb,text,text) from public,anon;
revoke all on function public.budget_recalculate_line(uuid) from public,anon;
revoke all on function public.budget_confirm_line(uuid,numeric,text,text) from public,anon;
revoke all on function public.budget_reserve_adjust(uuid,uuid,text,numeric,text) from public,anon;
revoke all on function public.budget_update_obligation_estimate(uuid,numeric,text) from public,anon;
revoke all on function public.budget_pay_from_treasury(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.budget_link_existing_treasury(uuid,uuid,numeric) from public,anon;
revoke all on function public.budget_add_cash_event(uuid,date,text,numeric,text) from public,anon;
revoke all on function public.budget_update_cash_event_status(uuid,text,uuid) from public,anon;
revoke all on function public.budget_set_item_rate(uuid,date,jsonb,text,text,date,jsonb) from public,anon;
revoke all on function public.budget_upsert_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer) from public,anon;
revoke all on function public.budget_set_schedule(uuid,date,text,integer,date,text,integer) from public,anon;
revoke all on function public.budget_period_statement(uuid) from public,anon;
revoke all on function public.budget_period_summary(uuid) from public,anon;
revoke all on function public.budget_cashflow_curve(uuid) from public,anon;
revoke all on function public.budget_forecast(date,integer) from public,anon;
revoke all on function public.budget_close_period(uuid) from public,anon;
revoke all on function public.budget_reopen_period(uuid,text) from public,anon;

grant execute on function public.budget_open_period(date),public.budget_set_opening_balance(uuid,numeric),public.budget_save_line_inputs(uuid,jsonb,text,text),public.budget_recalculate_line(uuid),public.budget_confirm_line(uuid,numeric,text,text),public.budget_reserve_adjust(uuid,uuid,text,numeric,text),public.budget_update_obligation_estimate(uuid,numeric,text),public.budget_pay_from_treasury(uuid,uuid,numeric,text),public.budget_link_existing_treasury(uuid,uuid,numeric),public.budget_add_cash_event(uuid,date,text,numeric,text),public.budget_update_cash_event_status(uuid,text,uuid),public.budget_set_item_rate(uuid,date,jsonb,text,text,date,jsonb),public.budget_upsert_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer),public.budget_set_schedule(uuid,date,text,integer,date,text,integer),public.budget_period_statement(uuid),public.budget_period_summary(uuid),public.budget_cashflow_curve(uuid),public.budget_forecast(date,integer),public.budget_close_period(uuid),public.budget_reopen_period(uuid,text) to authenticated,service_role;
