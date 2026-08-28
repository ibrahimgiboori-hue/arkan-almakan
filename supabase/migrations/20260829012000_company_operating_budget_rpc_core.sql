create or replace function private.fn_budget_due_amount(p_line_id uuid)
returns numeric language plpgsql stable set search_path='' as $$
declare l public.budget_period_lines; v_conf numeric;
begin
  select * into l from public.budget_period_lines where id=p_line_id;
  if l.id is null then return 0; end if;
  v_conf:=private.fn_budget_effective_confirmed(p_line_id);
  return coalesce(v_conf,l.expected_amount,0);
end;$$;

create or replace function private.fn_budget_forecast_default_amount(p_item_id uuid,p_as_of date)
returns numeric language plpgsql stable set search_path='' as $$
declare i public.budget_item_definitions; r public.budget_rate_versions; v numeric:=0; c numeric; b public.budget_tariff_bands; pend date;
begin
  select * into i from public.budget_item_definitions where id=p_item_id and node_type='item';
  if i.id is null then return 0; end if;
  if i.calculation_type='external_forecast_actual' and i.external_source='payroll_run' then
    pend:=(date_trunc('month',p_as_of)+interval '1 month - 1 day')::date;
    select coalesce((select pr.total_net from public.payroll_runs pr where pr.run_month=date_trunc('month',p_as_of)::date and pr.approved_at is not null order by pr.approved_at desc limit 1),
      (select pr.total_net from public.payroll_runs pr where pr.approved_at is not null and pr.run_month<date_trunc('month',p_as_of)::date order by pr.run_month desc limit 1),
      (select sum(coalesce(e.basic_salary,0)+coalesce(e.housing_allowance,0)+coalesce(e.transport_allowance,0)+coalesce(e.other_allowance,0)) from public.employees e where coalesce(e.in_payroll,true)=true and e.status::text in ('active','on_leave','suspended') and coalesce(e.hire_date,e.planned_start_date,pend)<=pend),0)
    into v;
    return round(v,2);
  end if;
  select * into r from public.budget_rate_versions where item_id=p_item_id and valid_from<=p_as_of and (valid_to is null or valid_to>=p_as_of) order by valid_from desc limit 1;
  if r.id is null then return 0; end if;
  case i.calculation_type
    when 'fixed_amount' then v:=coalesce((r.params->>'amount')::numeric,0);
    when 'variable_monthly' then v:=coalesce((r.params->>'amount')::numeric,0);
    when 'manual_actual' then v:=coalesce((r.params->>'amount')::numeric,0);
    when 'quantity_x_unit_price' then v:=coalesce((r.params->>'quantity')::numeric,0)*coalesce((r.params->>'unit_price')::numeric,0);
    when 'percentage_of_base' then v:=coalesce((r.params->>'base_amount')::numeric,0)*coalesce((r.params->>'percentage')::numeric,0)/100;
    when 'tiered' then
      c:=coalesce((r.params->>'count')::numeric,0);
      select * into b from public.budget_tariff_bands where rate_version_id=r.id and min_count<=c and (max_count is null or c<max_count) order by band_order limit 1;
      if b.id is not null then v:=case when b.band_mode='flat_fee_on_entry' then b.band_amount when b.band_mode='per_unit_in_band' then c*b.band_amount else 0 end; end if;
    else v:=0;
  end case;
  return round(greatest(v,0),2);
end;$$;

create or replace function private.fn_budget_validate_settlement(p_line_id uuid,p_treasury_id uuid,p_amount numeric)
returns void language plpgsql stable set search_path='' as $$
declare l public.budget_period_lines; t public.treasury_movements; v_line_paid numeric; v_movement_linked numeric; v_due numeric;
begin
  if p_amount<=0 then raise exception 'قيمة السداد يجب أن تكون موجبة'; end if;
  select * into l from public.budget_period_lines where id=p_line_id;
  if l.id is null then raise exception 'سطر الميزانية غير موجود'; end if;
  if l.cash_effect_type<>'due_now' then raise exception 'لا يمكن سداد سطر مخصص مستقبلي'; end if;
  select * into t from public.treasury_movements where id=p_treasury_id and status='posted';
  if t.id is null or t.direction<>'outflow' then raise exception 'حركة الخزينة غير صالحة للسداد'; end if;
  v_line_paid:=private.fn_budget_paid_amount(p_line_id); v_due:=private.fn_budget_due_amount(p_line_id);
  if v_line_paid+p_amount>v_due then raise exception 'السداد يتجاوز المستحق على البند'; end if;
  select coalesce(sum(amount),0) into v_movement_linked from public.budget_line_settlements where treasury_movement_id=p_treasury_id;
  if v_movement_linked+p_amount>t.amount then raise exception 'الربط يتجاوز قيمة حركة الخزينة الأصلية'; end if;
end;$$;

create or replace function private.fn_budget_period_cashflow_curve(p_period_id uuid)
returns table(event_date date,bank_balance numeric,reserved_outstanding numeric,free_balance numeric)
language sql stable set search_path='' as $$
with p as (select * from public.budget_periods where id=p_period_id),
days as (select gs::date d from p cross join lateral generate_series(p.period_start,p.period_end,interval '1 day') gs),
actual_settlements as (
  select t.movement_date d,-sum(s.amount) amt from public.budget_line_settlements s join public.budget_period_lines l on l.id=s.period_line_id join public.treasury_movements t on t.id=s.treasury_movement_id and t.status='posted' where l.period_id=p_period_id group by t.movement_date
),
cash_events as (
  select e.event_date d,sum(case when e.direction='in' then e.amount else -e.amount end) amt from public.budget_period_cash_events e where e.period_id=p_period_id and e.lifecycle_status<>'cancelled' and ((e.lifecycle_status='realized' and exists(select 1 from public.treasury_movements t where t.id=e.treasury_movement_id and t.status='posted')) or (e.lifecycle_status='planned' and e.event_date>=current_date)) group by e.event_date
),
future_due as (
  select greatest(l.due_date,current_date)::date d,-sum(greatest(private.fn_budget_due_amount(l.id)-private.fn_budget_paid_amount(l.id),0)) amt from public.budget_period_lines l where l.period_id=p_period_id and l.cash_effect_type='due_now' and greatest(l.due_date,current_date)<=(select period_end from p) and private.fn_budget_due_amount(l.id)>private.fn_budget_paid_amount(l.id) group by greatest(l.due_date,current_date)
),
flows as (select d,sum(amt) amt from (select * from actual_settlements union all select * from cash_events union all select * from future_due) q group by d),
res as (
  select d.d,coalesce(sum(case when rm.direction='reserve' then rm.amount else -rm.amount end) filter(where rm.recorded_at::date<=d.d),0) r
  from days d left join public.budget_reserve_movements rm on rm.obligation_id in (select obligation_id from public.budget_period_lines where period_id=p_period_id) group by d.d
)
select d.d,coalesce((select opening_bank_balance from p),0)+coalesce(sum(f.amt) over(order by d.d rows unbounded preceding),0),res.r,coalesce((select opening_bank_balance from p),0)+coalesce(sum(f.amt) over(order by d.d rows unbounded preceding),0)-res.r
from days d left join flows f on f.d=d.d join res on res.d=d.d order by d.d;
$$;

create or replace function private.fn_budget_rpc_open_period(p_period_start date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_start date; v_end date; v_id uuid; v_status text;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  v_start:=date_trunc('month',p_period_start)::date; v_end:=(date_trunc('month',p_period_start)+interval '1 month - 1 day')::date;
  insert into public.budget_periods(period_start,period_end,status,opened_at,opened_by) values(v_start,v_end,'open',now(),v_uid) on conflict(period_start,period_end) do nothing returning id into v_id;
  if v_id is null then select id,status into v_id,v_status from public.budget_periods where period_start=v_start and period_end=v_end; end if;
  if v_status='closed' then return v_id; end if;
  update public.budget_periods set status='open',opened_at=coalesce(opened_at,now()),opened_by=coalesce(opened_by,v_uid) where id=v_id and status='draft';
  perform private.fn_budget_generate_period(v_id); return v_id;
end;$$;

create or replace function private.fn_budget_rpc_set_opening_balance(p_period_id uuid,p_amount numeric)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform private.fn_budget_require('finance.operating_budget.edit'); perform private.fn_budget_assert_period_editable(p_period_id);
  update public.budget_periods set opening_bank_balance=p_amount where id=p_period_id; return found;
end;$$;

create or replace function private.fn_budget_rpc_save_line_inputs(p_line_id uuid,p_inputs jsonb,p_scope text,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare l public.budget_period_lines;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  if p_scope not in ('this_month','ongoing') then raise exception 'نطاق التعديل غير صحيح'; end if;
  select * into l from public.budget_period_lines where id=p_line_id; if l.id is null then raise exception 'السطر غير موجود'; end if;
  if p_scope='this_month' then perform private.fn_budget_recalculate_line(p_line_id,l.variable_inputs,p_inputs,p_reason); else perform private.fn_budget_recalculate_line(p_line_id,p_inputs,null,p_reason); end if;
  return true;
end;$$;

create or replace function private.fn_budget_rpc_recalculate_line(p_line_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare l public.budget_period_lines;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  select * into l from public.budget_period_lines where id=p_line_id; if l.id is null then raise exception 'السطر غير موجود'; end if;
  perform private.fn_budget_recalculate_line(l.id,l.variable_inputs,l.line_override_params,l.override_reason); return true;
end;$$;

create or replace function private.fn_budget_rpc_confirm_line(p_line_id uuid,p_confirmed numeric,p_source text,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare l public.budget_period_lines;
begin
  perform private.fn_budget_require('finance.operating_budget.edit',p_confirmed);
  if p_confirmed<0 or p_source not in ('manual','external_actual','invoice') then raise exception 'بيانات التأكيد غير صحيحة'; end if;
  select * into l from public.budget_period_lines where id=p_line_id for update; if l.id is null then raise exception 'السطر غير موجود'; end if;
  perform private.fn_budget_assert_period_editable(l.period_id);
  update public.budget_period_lines set confirmed_amount=p_confirmed,confirmed_source=p_source,confirmed_by=auth.uid(),confirmed_at=now(),notes=coalesce(nullif(trim(p_note),''),notes) where id=p_line_id;
  return true;
end;$$;

create or replace function private.fn_budget_rpc_reserve_adjust(p_obligation_id uuid,p_period_id uuid,p_direction text,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_id uuid; v_bal numeric; v_expected numeric; v_status text; v_accrual date; v_due date; v_period public.budget_periods;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit',p_amount); v_period:=private.fn_budget_assert_period_editable(p_period_id);
  if p_direction not in ('reserve','release') or p_amount<=0 then raise exception 'حركة المخصص غير صحيحة'; end if;
  select expected_amount,status,accrual_start,due_date into v_expected,v_status,v_accrual,v_due from public.budget_obligations where id=p_obligation_id for update;
  if v_expected is null then raise exception 'الاستحقاق غير موجود'; end if;
  if v_status in ('settled','cancelled') then raise exception 'لا يمكن تعديل مخصص استحقاق مسدد أو ملغى'; end if;
  if v_period.period_end<v_accrual or v_period.period_start>v_due then raise exception 'الشهر خارج فترة تراكم هذا الاستحقاق'; end if;
  v_bal:=private.fn_budget_reserved_balance(p_obligation_id);
  if p_direction='release' and p_amount>v_bal then raise exception 'لا يمكن تحرير أكثر من الرصيد المحجوز'; end if;
  if p_direction='reserve' and v_bal+p_amount>v_expected then raise exception 'الحجز يتجاوز قيمة الاستحقاق المتوقعة'; end if;
  insert into public.budget_reserve_movements(obligation_id,period_id,direction,amount,reason,recorded_by) values(p_obligation_id,p_period_id,p_direction,p_amount,nullif(trim(p_reason),''),v_uid) returning id into v_id;
  return v_id;
end;$$;

create or replace function private.fn_budget_rpc_update_obligation_estimate(p_obligation_id uuid,p_new_amount numeric,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_old numeric;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit',p_new_amount);
  if p_new_amount<0 or nullif(trim(p_reason),'') is null then raise exception 'القيمة والسبب مطلوبان'; end if;
  select expected_amount into v_old from public.budget_obligations where id=p_obligation_id for update; if v_old is null then raise exception 'الاستحقاق غير موجود'; end if;
  insert into public.budget_obligation_estimate_events(obligation_id,previous_amount,new_amount,reason,changed_by) values(p_obligation_id,v_old,p_new_amount,trim(p_reason),v_uid);
  update public.budget_obligations set expected_amount=p_new_amount where id=p_obligation_id;
  update public.budget_period_lines set required_reserve=private.fn_budget_required_reserve(p_obligation_id,period_id) where obligation_id=p_obligation_id and cash_effect_type='reserve_only' and period_id in (select id from public.budget_periods where status<>'closed');
  return true;
end;$$;

create or replace function private.fn_budget_rpc_pay_from_treasury(p_line_id uuid,p_account_id uuid,p_amount numeric,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; l public.budget_period_lines; a public.treasury_accounts; v_bal numeric; v_move uuid; v_settle uuid; v_name text; v_due numeric;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit',p_amount);
  if not public.has_capability('finance.treasury.pay','all',null,p_amount) then raise exception 'لا تملك صلاحية السداد من الخزينة'; end if;
  select * into l from public.budget_period_lines where id=p_line_id for update; if l.id is null then raise exception 'السطر غير موجود'; end if;
  perform private.fn_budget_assert_period_editable(l.period_id); if l.cash_effect_type<>'due_now' then raise exception 'لا يمكن السداد قبل شهر الاستحقاق'; end if;
  v_due:=private.fn_budget_due_amount(l.id); if private.fn_budget_paid_amount(l.id)+p_amount>v_due then raise exception 'السداد يتجاوز المستحق'; end if;
  select * into a from public.treasury_accounts where id=p_account_id and is_active=true for update; if a.id is null then raise exception 'حساب الخزينة غير موجود أو غير نشط'; end if;
  v_bal:=coalesce(public.fn_treasury_current_balance(p_account_id),0); if not a.allow_negative and v_bal<p_amount then raise exception 'الرصيد المتاح لا يكفي'; end if;
  select name into v_name from public.budget_item_definitions where id=l.item_id;
  insert into public.treasury_movements(account_id,movement_date,direction,amount,movement_type,source_type,source_id,source_ref,counterparty_type,counterparty_name,reference,recorded_by)
  values(p_account_id,current_date,'outflow',p_amount,'operating_budget_payment','budget_period_line',l.id,v_name,'operating_budget',v_name,nullif(trim(p_reference),''),v_uid) returning id into v_move;
  perform private.fn_budget_validate_settlement(l.id,v_move,p_amount);
  insert into public.budget_line_settlements(period_line_id,treasury_movement_id,amount,settlement_mode,recorded_by) values(l.id,v_move,p_amount,'engine_initiated',v_uid) returning id into v_settle;
  perform private.fn_budget_auto_release_reserve(v_settle);
  if private.fn_budget_paid_amount(l.id)>=v_due then update public.budget_obligations set status='settled' where id=l.obligation_id; end if;
  return v_move;
end;$$;

create or replace function private.fn_budget_rpc_link_existing_treasury(p_line_id uuid,p_treasury_id uuid,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; l public.budget_period_lines; v_id uuid; v_due numeric;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit',p_amount);
  if not public.has_capability('finance.treasury.view','all',null,p_amount) then raise exception 'لا تملك صلاحية الاطلاع على الخزينة'; end if;
  select * into l from public.budget_period_lines where id=p_line_id for update; if l.id is null then raise exception 'السطر غير موجود'; end if;
  perform private.fn_budget_assert_period_editable(l.period_id); perform private.fn_budget_validate_settlement(l.id,p_treasury_id,p_amount);
  insert into public.budget_line_settlements(period_line_id,treasury_movement_id,amount,settlement_mode,recorded_by) values(l.id,p_treasury_id,p_amount,'linked_existing',v_uid) returning id into v_id;
  perform private.fn_budget_auto_release_reserve(v_id); v_due:=private.fn_budget_due_amount(l.id);
  if private.fn_budget_paid_amount(l.id)>=v_due then update public.budget_obligations set status='settled' where id=l.obligation_id; end if;
  return v_id;
end;$$;

create or replace function private.fn_budget_rpc_add_cash_event(p_period_id uuid,p_date date,p_direction text,p_amount numeric,p_label text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_id uuid;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit',p_amount); perform private.fn_budget_assert_period_editable(p_period_id);
  if p_direction not in ('in','out') or p_amount<=0 or nullif(trim(p_label),'') is null then raise exception 'بيانات التدفق غير صحيحة'; end if;
  insert into public.budget_period_cash_events(period_id,event_date,direction,amount,label,created_by) values(p_period_id,p_date,p_direction,p_amount,trim(p_label),v_uid) returning id into v_id;
  return v_id;
end;$$;

create or replace function private.fn_budget_rpc_update_cash_event_status(p_event_id uuid,p_status text,p_treasury_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.budget_period_cash_events; t public.treasury_movements;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  select * into e from public.budget_period_cash_events where id=p_event_id for update; if e.id is null then raise exception 'التدفق غير موجود'; end if;
  perform private.fn_budget_assert_period_editable(e.period_id);
  if p_status='realized' then
    select * into t from public.treasury_movements where id=p_treasury_id and status='posted'; if t.id is null then raise exception 'حركة خزينة صالحة مطلوبة'; end if;
    if (e.direction='in' and t.direction<>'inflow') or (e.direction='out' and t.direction<>'outflow') then raise exception 'اتجاه حركة الخزينة لا يطابق التدفق'; end if;
    update public.budget_period_cash_events set lifecycle_status='realized',treasury_movement_id=p_treasury_id where id=p_event_id;
  elsif p_status='cancelled' then update public.budget_period_cash_events set lifecycle_status='cancelled',treasury_movement_id=null where id=p_event_id;
  elsif p_status='planned' then update public.budget_period_cash_events set lifecycle_status='planned',treasury_movement_id=null where id=p_event_id;
  else raise exception 'حالة التدفق غير صحيحة'; end if;
  return true;
end;$$;

create or replace function private.fn_budget_rpc_set_item_rate(p_item_id uuid,p_valid_from date,p_params jsonb,p_source text,p_source_note text,p_verified_at date,p_bands jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid; v_current public.budget_rate_versions; v_id uuid; b jsonb; v_type text;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  select calculation_type into v_type from public.budget_item_definitions where id=p_item_id and node_type='item'; if v_type is null then raise exception 'البند غير موجود'; end if;
  if p_source not in ('official_documented','actual_invoice','published_source','estimated','manual_entry') then raise exception 'مصدر التعرفة غير صحيح'; end if;
  select * into v_current from public.budget_rate_versions where item_id=p_item_id and valid_from<=p_valid_from and (valid_to is null or valid_to>=p_valid_from) order by valid_from desc limit 1 for update;
  if v_current.id is not null then
    if v_current.valid_from>=p_valid_from then raise exception 'يوجد إصدار يبدأ في نفس التاريخ؛ اختر تاريخ سريان لاحقًا أو استخدم تجاوز الشهر'; end if;
    update public.budget_rate_versions set valid_to=p_valid_from-1 where id=v_current.id;
  end if;
  insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note,verified_at,verified_by,created_by)
  values(p_item_id,p_valid_from,coalesce(p_params,'{}'::jsonb),p_source,nullif(trim(p_source_note),''),p_verified_at,case when p_verified_at is null then null else v_uid end,v_uid) returning id into v_id;
  if v_type='tiered' then
    for b in select * from jsonb_array_elements(coalesce(p_bands,'[]'::jsonb)) loop
      insert into public.budget_tariff_bands(rate_version_id,band_order,min_count,max_count,band_mode,band_amount)
      values(v_id,(b->>'band_order')::int,(b->>'min_count')::numeric,nullif(b->>'max_count','')::numeric,coalesce(b->>'band_mode','flat_fee_on_entry'),(b->>'band_amount')::numeric);
    end loop;
  end if;
  return v_id;
end;$$;

create or replace function private.fn_budget_rpc_period_statement(p_period_id uuid)
returns table(line_id uuid,item_id uuid,parent_item_id uuid,group_key text,item_name text,parent_name text,unit_label text,calculation_type text,cash_effect_type text,due_date date,expected_amount numeric,confirmed_amount numeric,paid_amount numeric,unpaid_amount numeric,required_reserve numeric,reserved_outstanding numeric,reserve_gap numeric,variable_inputs jsonb,line_override_params jsonb)
language plpgsql security definer set search_path='' as $$
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  return query
  select l.id,l.item_id,i.parent_item_id,i.group_key,i.name,p.name,i.unit_label,i.calculation_type,l.cash_effect_type,l.due_date,l.expected_amount,
    private.fn_budget_effective_confirmed(l.id),private.fn_budget_paid_amount(l.id),greatest(coalesce(private.fn_budget_effective_confirmed(l.id),l.expected_amount)-private.fn_budget_paid_amount(l.id),0),
    l.required_reserve,private.fn_budget_reserved_balance(l.obligation_id),
    greatest(l.required_reserve-coalesce((select sum(case when rm.direction='reserve' then rm.amount else -rm.amount end) from public.budget_reserve_movements rm where rm.obligation_id=l.obligation_id and rm.period_id=l.period_id),0),0),
    l.variable_inputs,l.line_override_params
  from public.budget_period_lines l join public.budget_item_definitions i on i.id=l.item_id left join public.budget_item_definitions p on p.id=i.parent_item_id
  where l.period_id=p_period_id order by i.group_key,p.sort_order,i.sort_order,i.name;
end;$$;

create or replace function private.fn_budget_rpc_period_summary(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_open numeric; v_due numeric; v_confirmed numeric; v_paid numeric; v_req numeric; v_reserved_month numeric; v_in numeric; v_out numeric; v_min_cash numeric; v_min_free numeric;
begin
  perform private.fn_budget_require('finance.operating_budget.view'); select opening_bank_balance into v_open from public.budget_periods where id=p_period_id;
  select coalesce(sum(case when cash_effect_type='due_now' then expected_amount else 0 end),0),coalesce(sum(case when cash_effect_type='due_now' then coalesce(private.fn_budget_effective_confirmed(id),expected_amount) else 0 end),0),coalesce(sum(private.fn_budget_paid_amount(id)),0),coalesce(sum(case when cash_effect_type='reserve_only' then required_reserve else 0 end),0)
  into v_due,v_confirmed,v_paid,v_req from public.budget_period_lines where period_id=p_period_id;
  select coalesce(sum(case when direction='reserve' then amount else -amount end),0) into v_reserved_month from public.budget_reserve_movements where period_id=p_period_id;
  select coalesce(sum(amount) filter(where direction='in' and lifecycle_status<>'cancelled'),0),coalesce(sum(amount) filter(where direction='out' and lifecycle_status<>'cancelled'),0) into v_in,v_out from public.budget_period_cash_events where period_id=p_period_id;
  select min(bank_balance),min(free_balance) into v_min_cash,v_min_free from private.fn_budget_period_cashflow_curve(p_period_id);
  return jsonb_build_object('opening_bank_balance',v_open,'expected_due',v_due,'confirmed_due',v_confirmed,'paid',v_paid,'required_reserve',v_req,'reserved_this_period',v_reserved_month,'reserve_gap',greatest(v_req-v_reserved_month,0),'expected_inflows',v_in,'expected_other_outflows',v_out,'plan_surplus_deficit',case when v_open is null then null else v_open+v_in-v_out-v_confirmed-v_req end,'min_expected_cash',v_min_cash,'min_expected_free_balance',v_min_free);
end;$$;

create or replace function private.fn_budget_rpc_cashflow_curve(p_period_id uuid)
returns table(event_date date,bank_balance numeric,reserved_outstanding numeric,free_balance numeric)
language plpgsql security definer set search_path='' as $$
begin
  perform private.fn_budget_require('finance.operating_budget.view'); return query select * from private.fn_budget_period_cashflow_curve(p_period_id);
end;$$;

create or replace function private.fn_budget_rpc_forecast(p_from date,p_months integer)
returns table(period_start date,expected_due numeric,required_reserve numeric,planned_total numeric)
language plpgsql security definer set search_path='' as $$
declare i int; it record; v_start date:=date_trunc('month',p_from)::date; v_month date; v_horizon date; v_due numeric; v_res numeric;
begin
  perform private.fn_budget_require('finance.operating_budget.view'); if p_months not between 1 and 24 then raise exception 'أفق التوقع يجب أن يكون بين شهر و24 شهرًا'; end if;
  v_horizon:=(v_start+make_interval(months=>p_months+12))::date;
  for it in select id from public.budget_item_definitions where node_type='item' and is_active loop perform private.fn_budget_ensure_obligation_cycles(it.id,v_start,p_months+12); end loop;
  for i in 0..p_months-1 loop
    v_month:=(v_start+make_interval(months=>i))::date;
    select coalesce(sum(case when date_trunc('month',o.due_date)=v_month then coalesce(nullif(o.expected_amount,0),private.fn_budget_forecast_default_amount(o.item_id,o.due_date)) else 0 end),0),
      coalesce(sum(case when date_trunc('month',o.due_date)>v_month and date_trunc('month',o.accrual_start)<=v_month then
        round(greatest(coalesce(nullif(o.expected_amount,0),private.fn_budget_forecast_default_amount(o.item_id,o.due_date))-private.fn_budget_reserved_balance(o.id),0)
        / greatest(1,((extract(year from age(date_trunc('month',o.due_date),greatest(date_trunc('month',o.accrual_start),v_start)))::int)*12 + extract(month from age(date_trunc('month',o.due_date),greatest(date_trunc('month',o.accrual_start),v_start)))::int)),2)
      else 0 end),0)
    into v_due,v_res from public.budget_obligations o
    where o.status<>'cancelled' and o.due_date>=v_start and o.due_date<v_horizon and v_month between greatest(date_trunc('month',o.accrual_start)::date,v_start) and date_trunc('month',o.due_date)::date;
    period_start:=v_month; expected_due:=round(v_due,2); required_reserve:=round(v_res,2); planned_total:=round(v_due+v_res,2); return next;
  end loop;
end;$$;

create or replace function private.fn_budget_rpc_close_period(p_period_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_uid uuid;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  update public.budget_periods set status='closed',closed_at=now(),closed_by=v_uid where id=p_period_id and status='open'; if not found then raise exception 'لا يمكن إقفال هذا الشهر'; end if;
  update public.budget_period_reopen_log set reclosed_at=now(),reclosed_by=v_uid where period_id=p_period_id and reclosed_at is null; return true;
end;$$;

create or replace function private.fn_budget_rpc_reopen_period(p_period_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_uid uuid;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.reopen'); if nullif(trim(p_reason),'') is null then raise exception 'سبب إعادة الفتح مطلوب'; end if;
  update public.budget_periods set status='open',closed_at=null,closed_by=null where id=p_period_id and status='closed'; if not found then raise exception 'الشهر غير مقفل'; end if;
  insert into public.budget_period_reopen_log(period_id,reopened_by,reason) values(p_period_id,v_uid,trim(p_reason)); return true;
end;$$;

revoke all on all functions in schema private from public,anon;
grant execute on all functions in schema private to authenticated,service_role;
