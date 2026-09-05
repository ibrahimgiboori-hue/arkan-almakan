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

    -- Mid-month starts belong to that month. Resolve the rate on the first real
    -- obligation date inside the month; for reserve-only obligations due later,
    -- never look beyond this period end so future rates do not leak backward.
    v_rate_as_of:=least(o.due_date,p.period_end);
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
    v_req:=case when v_effect='reserve_only' then private.fn_budget_required_reserve(o.id,p.id) else 0 end;

    insert into public.budget_period_lines(
      period_id,item_id,obligation_id,rate_version_id,calculation_snapshot,variable_inputs,
      due_date,cash_effect_type,expected_amount,required_reserve
    ) values(
      p.id,r.id,o.id,v_rate,v_snapshot,v_prev,o.due_date,v_effect,greatest(o.expected_amount,v_amount),v_req
    );
  end loop;
end;
$function$;
