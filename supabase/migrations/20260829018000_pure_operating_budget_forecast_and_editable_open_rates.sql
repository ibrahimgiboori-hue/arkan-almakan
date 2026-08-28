create or replace function private.fn_budget_project_obligation_cycles(p_from date,p_horizon_months integer)
returns table(
  projection_key text,
  item_id uuid,
  due_date date,
  accrual_start date,
  expected_amount numeric,
  reserved_amount numeric,
  paid_amount numeric,
  obligation_id uuid
)
language plpgsql stable set search_path='' as $$
declare
  v_start date:=date_trunc('month',p_from)::date;
  v_end date:=(date_trunc('month',p_from)+make_interval(months=>p_horizon_months)+interval '1 month - 1 day')::date;
  s record;
  v_months integer;
  i integer;
  v_due date;
  v_accrual date;
  v_obligation public.budget_obligations;
  v_expected numeric;
  v_reserved numeric;
  v_paid numeric;
begin
  if p_horizon_months<1 then return; end if;

  for s in
    select sch.*, d.id as definition_id
    from public.budget_item_schedules sch
    join public.budget_item_definitions d on d.id=sch.item_id and d.node_type='item' and d.is_active
    where sch.valid_from<=v_end and coalesce(sch.valid_to,v_end)>=v_start
    order by d.sort_order,d.name,sch.valid_from
  loop
    if s.recurrence_unit='one_time' then
      v_due:=s.anchor_date;
      if v_due<v_start or v_due>v_end or v_due<s.valid_from or (s.valid_to is not null and v_due>s.valid_to) then continue; end if;
      v_accrual:=case s.accrual_start_rule
        when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date
        else s.valid_from
      end;

      select * into v_obligation from public.budget_obligations o where o.item_id=s.item_id and o.due_date=v_due limit 1;
      if v_obligation.id is not null and v_obligation.status='cancelled' then continue; end if;
      v_expected:=coalesce(nullif(v_obligation.expected_amount,0),private.fn_budget_forecast_default_amount(s.item_id,v_due));
      v_reserved:=case when v_obligation.id is null then 0 else private.fn_budget_reserved_balance(v_obligation.id) end;
      select coalesce(sum(st.amount),0) into v_paid
      from public.budget_line_settlements st
      join public.budget_period_lines l on l.id=st.period_line_id and l.obligation_id=v_obligation.id
      join public.treasury_movements t on t.id=st.treasury_movement_id and t.status='posted';

      projection_key:=s.item_id::text||'|'||v_due::text;
      item_id:=s.item_id; due_date:=v_due; accrual_start:=least(v_accrual,v_due);
      expected_amount:=round(greatest(coalesce(v_expected,0),0),2);
      reserved_amount:=round(greatest(coalesce(v_reserved,0),0),2);
      paid_amount:=round(greatest(coalesce(v_paid,0),0),2);
      obligation_id:=v_obligation.id;
      return next;
      continue;
    end if;

    v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
    if v_months<=0 then continue; end if;

    for i in 0..240 loop
      v_due:=(s.anchor_date+make_interval(months=>i*v_months))::date;
      exit when v_due>v_end or (s.valid_to is not null and v_due>s.valid_to);
      continue when v_due<v_start or v_due<s.valid_from;

      v_accrual:=case s.accrual_start_rule
        when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(s.accrual_lead_months,1)))::date
        when 'immediately_after_previous_due' then (v_due-make_interval(months=>v_months)+interval '1 day')::date
        else date_trunc('month',v_due)::date
      end;

      v_obligation:=null;
      select * into v_obligation from public.budget_obligations o where o.item_id=s.item_id and o.due_date=v_due limit 1;
      if v_obligation.id is not null and v_obligation.status='cancelled' then continue; end if;
      v_expected:=coalesce(nullif(v_obligation.expected_amount,0),private.fn_budget_forecast_default_amount(s.item_id,v_due));
      v_reserved:=case when v_obligation.id is null then 0 else private.fn_budget_reserved_balance(v_obligation.id) end;
      select coalesce(sum(st.amount),0) into v_paid
      from public.budget_line_settlements st
      join public.budget_period_lines l on l.id=st.period_line_id and l.obligation_id=v_obligation.id
      join public.treasury_movements t on t.id=st.treasury_movement_id and t.status='posted';

      projection_key:=s.item_id::text||'|'||v_due::text;
      item_id:=s.item_id; due_date:=v_due; accrual_start:=least(v_accrual,v_due);
      expected_amount:=round(greatest(coalesce(v_expected,0),0),2);
      reserved_amount:=round(greatest(coalesce(v_reserved,0),0),2);
      paid_amount:=round(greatest(coalesce(v_paid,0),0),2);
      obligation_id:=v_obligation.id;
      return next;
    end loop;
  end loop;
end;$$;

create or replace function private.fn_budget_rpc_forecast(p_from date,p_months integer)
returns table(period_start date,expected_due numeric,required_reserve numeric,planned_total numeric)
language plpgsql security definer set search_path='' as $$
declare
  i integer;
  v_start date:=date_trunc('month',p_from)::date;
  v_month date;
  v_due numeric;
  v_reserve numeric;
  v_simulated jsonb:='{}'::jsonb;
  r record;
  v_key text;
  v_sim_reserved numeric;
  v_remaining numeric;
  v_months_to_due integer;
  v_contribution numeric;
begin
  perform private.fn_budget_require('finance.operating_budget.view');
  if p_months not between 1 and 24 then raise exception 'أفق التوقع يجب أن يكون بين شهر و24 شهرًا'; end if;

  for i in 0..p_months-1 loop
    v_month:=(v_start+make_interval(months=>i))::date;
    v_due:=0; v_reserve:=0;

    for r in select * from private.fn_budget_project_obligation_cycles(v_start,p_months+12) loop
      v_key:=r.projection_key;
      v_sim_reserved:=coalesce((v_simulated->>v_key)::numeric,r.reserved_amount,0);

      if date_trunc('month',r.due_date)::date=v_month then
        v_due:=v_due+greatest(r.expected_amount-r.paid_amount,0);
      elsif date_trunc('month',r.due_date)::date>v_month
        and date_trunc('month',r.accrual_start)::date<=v_month then
        v_remaining:=greatest(r.expected_amount-v_sim_reserved,0);
        v_months_to_due:=((extract(year from age(date_trunc('month',r.due_date),v_month))::int)*12
          + extract(month from age(date_trunc('month',r.due_date),v_month))::int);
        if v_months_to_due>0 and v_remaining>0 then
          v_contribution:=round(v_remaining/v_months_to_due,2);
          v_contribution:=least(v_contribution,v_remaining);
          v_reserve:=v_reserve+v_contribution;
          v_simulated:=jsonb_set(v_simulated,array[v_key],to_jsonb(round(v_sim_reserved+v_contribution,2)),true);
        end if;
      end if;
    end loop;

    period_start:=v_month;
    expected_due:=round(v_due,2);
    required_reserve:=round(v_reserve,2);
    planned_total:=round(v_due+v_reserve,2);
    return next;
  end loop;
end;$$;

create or replace function private.fn_budget_rpc_set_item_rate(
  p_item_id uuid,p_valid_from date,p_params jsonb,p_source text,p_source_note text,p_verified_at date,p_bands jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid;
  v_current public.budget_rate_versions;
  v_id uuid;
  b jsonb;
  v_type text;
  l record;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  select calculation_type into v_type from public.budget_item_definitions where id=p_item_id and node_type='item';
  if v_type is null then raise exception 'البند غير موجود'; end if;
  if p_source not in ('official_documented','actual_invoice','published_source','estimated','manual_entry') then raise exception 'مصدر التعرفة غير صحيح'; end if;

  select * into v_current from public.budget_rate_versions
  where item_id=p_item_id and valid_from<=p_valid_from and (valid_to is null or valid_to>=p_valid_from)
  order by valid_from desc limit 1 for update;

  if v_current.id is not null and v_current.valid_from=p_valid_from then
    if exists(
      select 1 from public.budget_period_lines l
      join public.budget_periods p on p.id=l.period_id
      where l.rate_version_id=v_current.id and p.status='closed'
    ) then
      raise exception 'هذه التعرفة دخلت شهرًا مقفلًا؛ أنشئ إصدارًا جديدًا بتاريخ سريان لاحق';
    end if;

    update public.budget_rate_versions set
      params=coalesce(p_params,'{}'::jsonb),source=p_source,source_note=nullif(trim(p_source_note),''),
      verified_at=p_verified_at,verified_by=case when p_verified_at is null then null else v_uid end
    where id=v_current.id returning id into v_id;

    if v_type='tiered' then
      delete from public.budget_tariff_bands where rate_version_id=v_id;
      for b in select * from jsonb_array_elements(coalesce(p_bands,'[]'::jsonb)) loop
        insert into public.budget_tariff_bands(rate_version_id,band_order,min_count,max_count,band_mode,band_amount)
        values(v_id,(b->>'band_order')::int,(b->>'min_count')::numeric,nullif(b->>'max_count','')::numeric,coalesce(b->>'band_mode','flat_fee_on_entry'),(b->>'band_amount')::numeric);
      end loop;
    end if;

    for l in
      select pl.id from public.budget_period_lines pl join public.budget_periods p on p.id=pl.period_id
      where pl.item_id=p_item_id and p.status<>'closed' and p.period_start>=p_valid_from
    loop
      perform private.fn_budget_recalculate_line(l.id);
    end loop;
    return v_id;
  end if;

  if v_current.id is not null then update public.budget_rate_versions set valid_to=p_valid_from-1 where id=v_current.id; end if;
  insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note,verified_at,verified_by,created_by)
  values(p_item_id,p_valid_from,coalesce(p_params,'{}'::jsonb),p_source,nullif(trim(p_source_note),''),p_verified_at,case when p_verified_at is null then null else v_uid end,v_uid)
  returning id into v_id;

  if v_type='tiered' then
    for b in select * from jsonb_array_elements(coalesce(p_bands,'[]'::jsonb)) loop
      insert into public.budget_tariff_bands(rate_version_id,band_order,min_count,max_count,band_mode,band_amount)
      values(v_id,(b->>'band_order')::int,(b->>'min_count')::numeric,nullif(b->>'max_count','')::numeric,coalesce(b->>'band_mode','flat_fee_on_entry'),(b->>'band_amount')::numeric);
    end loop;
  end if;
  return v_id;
end;$$;

revoke all on function private.fn_budget_project_obligation_cycles(date,integer) from public,anon,authenticated;
grant execute on function private.fn_budget_project_obligation_cycles(date,integer) to service_role;
revoke all on function private.fn_budget_rpc_forecast(date,integer),private.fn_budget_rpc_set_item_rate(uuid,date,jsonb,text,text,date,jsonb) from public,anon;
grant execute on function private.fn_budget_rpc_forecast(date,integer),private.fn_budget_rpc_set_item_rate(uuid,date,jsonb,text,text,date,jsonb) to authenticated,service_role;
