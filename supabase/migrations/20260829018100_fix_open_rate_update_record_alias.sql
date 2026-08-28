create or replace function private.fn_budget_rpc_set_item_rate(
  p_item_id uuid,p_valid_from date,p_params jsonb,p_source text,p_source_note text,p_verified_at date,p_bands jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid;
  v_current public.budget_rate_versions;
  v_id uuid;
  b jsonb;
  v_type text;
  v_line record;
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
      select 1 from public.budget_period_lines pl
      join public.budget_periods bp on bp.id=pl.period_id
      where pl.rate_version_id=v_current.id and bp.status='closed'
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

    for v_line in
      select pl.id from public.budget_period_lines pl
      join public.budget_periods bp on bp.id=pl.period_id
      where pl.item_id=p_item_id and bp.status<>'closed' and bp.period_start>=p_valid_from
    loop
      perform private.fn_budget_recalculate_line(v_line.id);
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

revoke all on function private.fn_budget_rpc_set_item_rate(uuid,date,jsonb,text,text,date,jsonb) from public,anon;
grant execute on function private.fn_budget_rpc_set_item_rate(uuid,date,jsonb,text,text,date,jsonb) to authenticated,service_role;
