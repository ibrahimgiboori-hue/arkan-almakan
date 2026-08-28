create or replace function private.fn_budget_require(p_capability text, p_amount numeric default null)
returns uuid language plpgsql stable set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not public.has_capability(p_capability,'all',null,p_amount) then raise exception 'لا تملك الصلاحية المطلوبة: %',p_capability; end if;
  return v_uid;
end;$$;

create or replace function private.fn_budget_assert_period_editable(p_period_id uuid)
returns public.budget_periods language plpgsql stable set search_path='' as $$
declare v_period public.budget_periods;
begin
  select * into v_period from public.budget_periods where id=p_period_id;
  if v_period.id is null then raise exception 'الشهر غير موجود'; end if;
  if v_period.status='closed' then raise exception 'الشهر مقفل؛ أعد فتحه بتصريح قبل التعديل'; end if;
  return v_period;
end;$$;

create or replace function private.fn_budget_resolve_rate_version(p_item_id uuid,p_as_of date)
returns uuid language sql stable set search_path='' as $$
  select id from public.budget_rate_versions where item_id=p_item_id and valid_from<=p_as_of and (valid_to is null or valid_to>=p_as_of) order by valid_from desc limit 1
$$;

create or replace function private.fn_budget_payroll_forecast(p_period_id uuid)
returns numeric language sql stable set search_path='' as $$
  with p as (select period_end from public.budget_periods where id=p_period_id)
  select coalesce(sum(coalesce(e.basic_salary,0)+coalesce(e.housing_allowance,0)+coalesce(e.transport_allowance,0)+coalesce(e.other_allowance,0)),0)
  from public.employees e,p
  where coalesce(e.in_payroll,true)=true and e.status::text in ('active','on_leave','suspended') and coalesce(e.hire_date,e.planned_start_date,p.period_end)<=p.period_end
$$;

create or replace function private.fn_budget_effective_confirmed(p_line_id uuid)
returns numeric language plpgsql stable set search_path='' as $$
declare v_line public.budget_period_lines; v_source text; v_month date; v_actual numeric;
begin
  select * into v_line from public.budget_period_lines where id=p_line_id;
  if v_line.confirmed_amount is not null then return v_line.confirmed_amount; end if;
  select external_source into v_source from public.budget_item_definitions where id=v_line.item_id;
  if v_source='payroll_run' then
    select period_start into v_month from public.budget_periods where id=v_line.period_id;
    select total_net into v_actual from public.payroll_runs where run_month=date_trunc('month',v_month)::date and approved_at is not null limit 1;
    if v_actual is not null then return v_actual; end if;
  end if;
  return null;
end;$$;

create or replace function private.fn_budget_paid_amount(p_line_id uuid)
returns numeric language sql stable set search_path='' as $$
  select coalesce(sum(s.amount),0) from public.budget_line_settlements s join public.treasury_movements t on t.id=s.treasury_movement_id and t.status='posted' where s.period_line_id=p_line_id
$$;

create or replace function private.fn_budget_reserved_balance(p_obligation_id uuid)
returns numeric language sql stable set search_path='' as $$
  select coalesce(sum(case when direction='reserve' then amount else -amount end),0) from public.budget_reserve_movements where obligation_id=p_obligation_id
$$;

create or replace function private.fn_budget_compute_line_amount(p_item_id uuid,p_period_id uuid,p_rate_version_id uuid,p_variable_inputs jsonb default null,p_override jsonb default null)
returns table(amount numeric,snapshot jsonb) language plpgsql stable set search_path='' as $$
declare
  v_item public.budget_item_definitions; v_rate public.budget_rate_versions; v_params jsonb; v_amount numeric:=0;
  v_qty numeric; v_price numeric; v_count numeric; v_base numeric; v_pct numeric; v_band public.budget_tariff_bands; v_period_start date;
begin
  select * into v_item from public.budget_item_definitions where id=p_item_id and node_type='item';
  if v_item.id is null then raise exception 'البند المالي غير موجود'; end if;
  select period_start into v_period_start from public.budget_periods where id=p_period_id;
  if p_rate_version_id is not null then select * into v_rate from public.budget_rate_versions where id=p_rate_version_id; end if;
  if p_rate_version_id is null and v_item.calculation_type not in ('external_forecast_actual') then raise exception 'لا توجد تعرفة سارية للبند %',v_item.name; end if;
  v_params:=coalesce(v_rate.params,'{}'::jsonb)||coalesce(p_variable_inputs,'{}'::jsonb)||coalesce(p_override,'{}'::jsonb);
  case v_item.calculation_type
    when 'fixed_amount' then v_amount:=coalesce((v_params->>'amount')::numeric,0);
    when 'quantity_x_unit_price' then v_qty:=coalesce((v_params->>'quantity')::numeric,0); v_price:=coalesce((v_params->>'unit_price')::numeric,0); v_amount:=v_qty*v_price;
    when 'variable_monthly' then v_amount:=coalesce((v_params->>'amount')::numeric,0);
    when 'manual_actual' then v_amount:=coalesce((v_params->>'amount')::numeric,0);
    when 'percentage_of_base' then v_base:=coalesce((v_params->>'base_amount')::numeric,0); v_pct:=coalesce((v_params->>'percentage')::numeric,0); v_amount:=v_base*v_pct/100;
    when 'tiered' then
      v_count:=coalesce((v_params->>'count')::numeric,0);
      select * into v_band from public.budget_tariff_bands where rate_version_id=p_rate_version_id and min_count<=v_count and (max_count is null or v_count<max_count) order by band_order limit 1;
      if v_band.id is null then raise exception 'لا توجد شريحة مطابقة للعدد %',v_count; end if;
      if v_band.band_mode='flat_fee_on_entry' then v_amount:=v_band.band_amount;
      elsif v_band.band_mode='per_unit_in_band' then v_amount:=v_count*v_band.band_amount;
      else select coalesce(sum(greatest(least(v_count,coalesce(b.max_count,v_count))-b.min_count,0)*b.band_amount),0) into v_amount from public.budget_tariff_bands b where b.rate_version_id=p_rate_version_id and b.min_count<v_count; end if;
    when 'external_forecast_actual' then if v_item.external_source='payroll_run' then v_amount:=private.fn_budget_payroll_forecast(p_period_id); else raise exception 'مصدر خارجي غير مدعوم'; end if;
    when 'employee_based_contribution' then raise exception 'حساب مساهمات الموظفين محجوز معماريًا ولم يُفعّل بعد';
    when 'subscription_plus_usage' then raise exception 'محرك الاشتراك + الاستخدام محجوز ولم يُفعّل بعد';
    when 'composite_formula' then raise exception 'المعادلة المركبة محجوزة ولم تُفعّل بعد';
    else raise exception 'نوع حساب غير مدعوم: %',v_item.calculation_type;
  end case;
  v_amount:=round(greatest(coalesce(v_amount,0),0),2);
  snapshot:=jsonb_build_object('engine_version','1.0.0','calculated_at',now(),'calculation_type',v_item.calculation_type,'rate_version_id',p_rate_version_id,'resolved_inputs',v_params,'amount',v_amount,'matched_band',case when v_band.id is null then null else jsonb_build_object('id',v_band.id,'min',v_band.min_count,'max',v_band.max_count,'mode',v_band.band_mode,'amount',v_band.band_amount) end);
  amount:=v_amount; return next;
end;$$;

create or replace function private.fn_budget_recurrence_months(p_unit text,p_count int) returns int language sql immutable set search_path='' as $$ select case p_unit when 'month' then 1 when 'quarter' then 3 when 'half_year' then 6 when 'year' then 12 else 0 end * p_count $$;

create or replace function private.fn_budget_ensure_obligation_cycles(p_item_id uuid,p_from_date date,p_horizon_months int default 24)
returns void language plpgsql security definer set search_path='' as $$
declare s public.budget_item_schedules; v_months int; i int; v_due date; v_accrual date; v_name text;
begin
  select * into s from public.budget_item_schedules where item_id=p_item_id and valid_from<=p_from_date and (valid_to is null or valid_to>=p_from_date) order by valid_from desc limit 1;
  if s.id is null then return; end if;
  select name into v_name from public.budget_item_definitions where id=p_item_id and node_type='item'; if v_name is null then return; end if;
  if s.recurrence_unit='one_time' then
    v_due:=s.anchor_date;
    if v_due between p_from_date and (p_from_date + make_interval(months=>p_horizon_months))::date then
      v_accrual:=case s.accrual_start_rule when 'fixed_months_before_due' then (v_due-make_interval(months=>s.accrual_lead_months))::date when 'from_period_start' then date_trunc('month',v_due)::date else s.valid_from end;
      insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine) values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),least(v_accrual,v_due),v_due,true) on conflict(item_id,due_date) do nothing;
    end if; return;
  end if;
  v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
  for i in 0..240 loop
    v_due:=(s.anchor_date+make_interval(months=>i*v_months))::date; exit when v_due>(p_from_date+make_interval(months=>p_horizon_months))::date; continue when v_due<p_from_date;
    v_accrual:=case s.accrual_start_rule when 'fixed_months_before_due' then (v_due-make_interval(months=>s.accrual_lead_months))::date when 'from_period_start' then date_trunc('month',v_due)::date else (v_due-make_interval(months=>v_months)+interval '1 day')::date end;
    insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine) values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),least(v_accrual,v_due),v_due,true) on conflict(item_id,due_date) do nothing;
  end loop;
end;$$;

create or replace function private.fn_budget_required_reserve(p_obligation_id uuid,p_period_id uuid)
returns numeric language plpgsql stable set search_path='' as $$
declare o public.budget_obligations; p public.budget_periods; v_reserved numeric; v_remaining numeric; v_months int;
begin
  select * into o from public.budget_obligations where id=p_obligation_id; select * into p from public.budget_periods where id=p_period_id;
  if o.id is null or p.id is null or date_trunc('month',o.due_date)<=date_trunc('month',p.period_start) then return 0; end if;
  v_reserved:=private.fn_budget_reserved_balance(o.id); v_remaining:=greatest(o.expected_amount-v_reserved,0);
  v_months:=((extract(year from age(date_trunc('month',o.due_date),date_trunc('month',p.period_start)))::int)*12 + extract(month from age(date_trunc('month',o.due_date),date_trunc('month',p.period_start)))::int);
  if v_months<=0 then return 0; end if; return round(v_remaining/v_months,2);
end;$$;

create or replace function private.fn_budget_generate_period(p_period_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.budget_periods; r record; o public.budget_obligations; v_rate uuid; v_prev jsonb; v_amount numeric; v_snapshot jsonb; v_effect text; v_req numeric;
begin
  select * into p from public.budget_periods where id=p_period_id; if p.id is null or p.status='closed' then raise exception 'الشهر غير متاح للتوليد'; end if;
  for r in select id from public.budget_item_definitions where node_type='item' and is_active=true order by sort_order,name loop
    perform private.fn_budget_ensure_obligation_cycles(r.id,p.period_start,24);
    select * into o from public.budget_obligations where item_id=r.id and status<>'cancelled' and accrual_start<=p.period_end and due_date>=p.period_start order by due_date limit 1;
    if o.id is null then continue; end if; if exists(select 1 from public.budget_period_lines where period_id=p.id and item_id=r.id) then continue; end if;
    v_rate:=private.fn_budget_resolve_rate_version(r.id,p.period_start);
    select variable_inputs into v_prev from public.budget_period_lines l join public.budget_periods pp on pp.id=l.period_id where l.item_id=r.id and pp.period_start<p.period_start order by pp.period_start desc limit 1;
    select amount,snapshot into v_amount,v_snapshot from private.fn_budget_compute_line_amount(r.id,p.id,v_rate,v_prev,null);
    if o.expected_amount=0 and v_amount>=0 then update public.budget_obligations set expected_amount=v_amount where id=o.id; o.expected_amount:=v_amount; end if;
    v_effect:=case when o.due_date between p.period_start and p.period_end then 'due_now' else 'reserve_only' end; v_req:=case when v_effect='reserve_only' then private.fn_budget_required_reserve(o.id,p.id) else 0 end;
    insert into public.budget_period_lines(period_id,item_id,obligation_id,rate_version_id,calculation_snapshot,variable_inputs,due_date,cash_effect_type,expected_amount,required_reserve) values(p.id,r.id,o.id,v_rate,v_snapshot,v_prev,o.due_date,v_effect,case when v_effect='due_now' then greatest(o.expected_amount,v_amount) else v_amount end,v_req);
  end loop;
end;$$;

create or replace function private.fn_budget_recalculate_line(p_line_id uuid,p_inputs jsonb,p_override jsonb,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare l public.budget_period_lines; p public.budget_periods; v_amount numeric; v_snapshot jsonb; v_rate uuid;
begin
  select * into l from public.budget_period_lines where id=p_line_id for update; if l.id is null then raise exception 'السطر غير موجود'; end if; p:=private.fn_budget_assert_period_editable(l.period_id);
  v_rate:=private.fn_budget_resolve_rate_version(l.item_id,p.period_start); select amount,snapshot into v_amount,v_snapshot from private.fn_budget_compute_line_amount(l.item_id,l.period_id,v_rate,p_inputs,p_override);
  update public.budget_period_lines set rate_version_id=v_rate,variable_inputs=p_inputs,line_override_params=p_override,override_reason=case when p_override is null then null else nullif(trim(p_reason),'') end,overridden_by=case when p_override is null then null else auth.uid() end,overridden_at=case when p_override is null then null else now() end,expected_amount=v_amount,calculation_snapshot=v_snapshot where id=l.id;
  if l.cash_effect_type='reserve_only' then update public.budget_obligations set expected_amount=v_amount where id=l.obligation_id and status in ('accumulating','due_soon'); update public.budget_period_lines set required_reserve=private.fn_budget_required_reserve(l.obligation_id,l.period_id) where id=l.id; end if;
end;$$;

create or replace function private.fn_budget_auto_release_reserve(p_settlement_id uuid) returns numeric language plpgsql security definer set search_path='' as $$
declare s public.budget_line_settlements; l public.budget_period_lines; v_reserved numeric; v_release numeric;
begin
  select * into s from public.budget_line_settlements where id=p_settlement_id; select * into l from public.budget_period_lines where id=s.period_line_id;
  v_reserved:=greatest(private.fn_budget_reserved_balance(l.obligation_id),0); v_release:=least(v_reserved,s.amount);
  if v_release>0 then insert into public.budget_reserve_movements(obligation_id,period_id,direction,amount,reason,is_auto_release,source_settlement_id,recorded_by) values(l.obligation_id,l.period_id,'release',v_release,'تصفية تلقائية للمخصص مقابل سداد فعلي',true,s.id,s.recorded_by); end if; return v_release;
end;$$;

create or replace function private.fn_budget_on_treasury_void() returns trigger language plpgsql security definer set search_path='' as $$
declare s record; rm record;
begin
  if old.status='posted' and new.status='void' then
    for s in select id,period_line_id from public.budget_line_settlements where treasury_movement_id=new.id loop
      for rm in select * from public.budget_reserve_movements where source_settlement_id=s.id and direction='release' and is_auto_release=true loop
        if not exists(select 1 from public.budget_reserve_movements where reverses_movement_id=rm.id) then insert into public.budget_reserve_movements(obligation_id,period_id,direction,amount,reason,is_auto_release,reverses_movement_id,recorded_by) values(rm.obligation_id,rm.period_id,'reserve',rm.amount,'استعادة المخصص بعد إلغاء حركة الخزينة',true,rm.id,new.voided_by); end if;
      end loop;
      update public.budget_obligations o set status=case when o.due_date<=current_date+30 then 'due_soon' else 'accumulating' end where o.id=(select obligation_id from public.budget_period_lines where id=s.period_line_id) and o.status='settled';
    end loop;
  end if; return new;
end;$$;
drop trigger if exists trg_budget_treasury_void_restore on public.treasury_movements;
create trigger trg_budget_treasury_void_restore after update of status on public.treasury_movements for each row execute function private.fn_budget_on_treasury_void();
