-- Mid-month budget rules must remain editable without pretending the first day of
-- the month is the rule's effective date. Period recalculation paths historically
-- pass period_start to the resolver, while the real obligation can begin later in
-- that same month (the current budget baseline is 2026-06-15).
--
-- When the supplied date is an opened budget period start, resolve the rate on the
-- first real active obligation/accrual date inside that period. Direct date lookups
-- outside that context retain normal as-of semantics.

create or replace function private.fn_budget_resolve_rate_version(p_item_id uuid, p_as_of date)
returns uuid
language plpgsql
stable
set search_path=''
as $function$
declare
  v_period public.budget_periods;
  v_obligation public.budget_obligations;
  v_effective_date date;
  v_rate uuid;
begin
  if p_item_id is null or p_as_of is null then
    return null;
  end if;

  select * into v_period
  from public.budget_periods
  where period_start=p_as_of
  order by period_start desc
  limit 1;

  if v_period.id is not null then
    select * into v_obligation
    from public.budget_obligations o
    where o.item_id=p_item_id
      and o.status<>'cancelled'
      and o.accrual_start<=v_period.period_end
      and o.due_date>=v_period.period_start
    order by o.due_date,o.accrual_start
    limit 1;

    if v_obligation.id is not null then
      v_effective_date:=least(
        greatest(v_obligation.accrual_start,v_period.period_start),
        v_period.period_end
      );

      select r.id into v_rate
      from public.budget_rate_versions r
      where r.item_id=p_item_id
        and r.valid_from<=v_effective_date
        and (r.valid_to is null or r.valid_to>=v_effective_date)
      order by r.valid_from desc
      limit 1;

      if v_rate is not null then
        return v_rate;
      end if;
    end if;
  end if;

  select r.id into v_rate
  from public.budget_rate_versions r
  where r.item_id=p_item_id
    and r.valid_from<=p_as_of
    and (r.valid_to is null or r.valid_to>=p_as_of)
  order by r.valid_from desc
  limit 1;

  return v_rate;
end;
$function$;
