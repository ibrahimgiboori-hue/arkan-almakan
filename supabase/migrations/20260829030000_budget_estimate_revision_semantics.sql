-- ميزانية التشغيل تبدأ كتقدير، ثم قيمة فعلية، ثم سداد خزينة.
-- تصحيح التقدير يعيد احتساب المتوقع فقط، ولا يغيّر confirmed_amount أو التسويات.

create or replace function private.fn_budget_restate_item_estimates(
  p_item_id uuid,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_rate uuid;
  v_amount numeric;
  v_snapshot jsonb;
  v_old_obligation numeric;
  v_count integer := 0;
  v_uid uuid := auth.uid();
begin
  if nullif(trim(p_reason),'') is null then
    raise exception 'سبب إعادة تقدير البند مطلوب';
  end if;

  for r in
    select l.*, p.period_start
    from public.budget_period_lines l
    join public.budget_periods p on p.id=l.period_id
    where l.item_id=p_item_id
    order by p.period_start, l.id
  loop
    v_rate := private.fn_budget_resolve_rate_version(p_item_id,r.period_start);
    select amount,snapshot
    into v_amount,v_snapshot
    from private.fn_budget_compute_line_amount(
      p_item_id,r.period_id,v_rate,r.variable_inputs,r.line_override_params
    );

    if r.expected_amount is distinct from v_amount
       or r.rate_version_id is distinct from v_rate
       or r.calculation_snapshot is distinct from v_snapshot then
      update public.budget_period_lines
      set rate_version_id=v_rate,
          expected_amount=v_amount,
          calculation_snapshot=v_snapshot
      where id=r.id;
      v_count := v_count + 1;
    end if;

    if r.cash_effect_type='reserve_only' then
      select expected_amount into v_old_obligation
      from public.budget_obligations
      where id=r.obligation_id
      for update;

      if v_old_obligation is distinct from v_amount then
        insert into public.budget_obligation_estimate_events(
          obligation_id,previous_amount,new_amount,reason,changed_by
        ) values(
          r.obligation_id,coalesce(v_old_obligation,0),v_amount,trim(p_reason),v_uid
        );
        update public.budget_obligations
        set expected_amount=v_amount
        where id=r.obligation_id;
      end if;

      update public.budget_period_lines
      set required_reserve=private.fn_budget_required_reserve(r.obligation_id,r.period_id)
      where id=r.id;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function private.fn_budget_rpc_set_item_rate(
  p_item_id uuid,
  p_valid_from date,
  p_params jsonb,
  p_source text,
  p_source_note text,
  p_verified_at date,
  p_bands jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid;
  v_current public.budget_rate_versions;
  v_id uuid;
  b jsonb;
  v_type text;
  v_existing_bands jsonb;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  select calculation_type into v_type
  from public.budget_item_definitions
  where id=p_item_id and node_type='item';
  if v_type is null then raise exception 'البند غير موجود'; end if;
  if p_source not in ('official_documented','actual_invoice','published_source','estimated','manual_entry') then
    raise exception 'مصدر التعرفة غير صحيح';
  end if;

  select * into v_current
  from public.budget_rate_versions
  where item_id=p_item_id
    and valid_from<=p_valid_from
    and (valid_to is null or valid_to>=p_valid_from)
  order by valid_from desc
  limit 1
  for update;

  -- نفس بداية الإصدار = تصحيح للمعلومة التقديرية، وليس إنشاء تاريخ مالي جديد.
  if v_current.id is not null and v_current.valid_from=p_valid_from then
    select coalesce(jsonb_agg(jsonb_build_object(
      'band_order',band_order,
      'min_count',min_count,
      'max_count',max_count,
      'band_mode',band_mode,
      'band_amount',band_amount
    ) order by band_order),'[]'::jsonb)
    into v_existing_bands
    from public.budget_tariff_bands
    where rate_version_id=v_current.id;

    if v_current.params is not distinct from coalesce(p_params,'{}'::jsonb)
       and (v_type<>'tiered' or v_existing_bands is not distinct from coalesce(p_bands,'[]'::jsonb)) then
      return v_current.id;
    end if;

    update public.budget_rate_versions
    set params=coalesce(p_params,'{}'::jsonb),
        source=p_source,
        source_note=nullif(trim(p_source_note),''),
        verified_at=p_verified_at,
        verified_by=case when p_verified_at is null then null else v_uid end
    where id=v_current.id;

    delete from public.budget_tariff_bands where rate_version_id=v_current.id;
    if v_type='tiered' then
      for b in select * from jsonb_array_elements(coalesce(p_bands,'[]'::jsonb)) loop
        insert into public.budget_tariff_bands(
          rate_version_id,band_order,min_count,max_count,band_mode,band_amount
        ) values(
          v_current.id,
          (b->>'band_order')::int,
          (b->>'min_count')::numeric,
          nullif(b->>'max_count','')::numeric,
          coalesce(b->>'band_mode','flat_fee_on_entry'),
          (b->>'band_amount')::numeric
        );
      end loop;
    end if;

    perform private.fn_budget_restate_item_estimates(
      p_item_id,'تصحيح تقدير سابق من '||p_valid_from::text
    );
    return v_current.id;
  end if;

  -- تاريخ بداية أحدث = تغيير من هذه الدورة وما بعدها؛ الماضي يبقى على إصداره السابق.
  if v_current.id is not null then
    update public.budget_rate_versions
    set valid_to=p_valid_from-1
    where id=v_current.id;
  end if;

  insert into public.budget_rate_versions(
    item_id,valid_from,params,source,source_note,verified_at,verified_by,created_by
  ) values(
    p_item_id,p_valid_from,coalesce(p_params,'{}'::jsonb),p_source,
    nullif(trim(p_source_note),''),p_verified_at,
    case when p_verified_at is null then null else v_uid end,v_uid
  )
  returning id into v_id;

  if v_type='tiered' then
    for b in select * from jsonb_array_elements(coalesce(p_bands,'[]'::jsonb)) loop
      insert into public.budget_tariff_bands(
        rate_version_id,band_order,min_count,max_count,band_mode,band_amount
      ) values(
        v_id,(b->>'band_order')::int,(b->>'min_count')::numeric,
        nullif(b->>'max_count','')::numeric,
        coalesce(b->>'band_mode','flat_fee_on_entry'),
        (b->>'band_amount')::numeric
      );
    end loop;
  end if;

  perform private.fn_budget_restate_item_estimates(
    p_item_id,'تغيير تقدير من دورة '||p_valid_from::text
  );
  return v_id;
end;
$$;

revoke all on function private.fn_budget_restate_item_estimates(uuid,text) from public, anon, authenticated;
