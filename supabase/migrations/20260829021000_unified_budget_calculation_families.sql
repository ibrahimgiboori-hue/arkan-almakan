-- المحرك الموحد لبنود ميزانية التشغيل.
-- القيمة لا تنشأ إلا في leaf item. التصنيفات تجمع فقط.
-- لا توجد معادلات JavaScript أو eval؛ المعادلات المركبة وصف بيانات محدود وآمن.

create or replace function private.fn_budget_component_engine(
  p_inputs jsonb,
  p_components jsonb
) returns table(total numeric, breakdown jsonb, metrics jsonb)
language plpgsql stable set search_path=''
as $$
declare
  c jsonb;
  v_mode text;
  v_key text;
  v_label text;
  v_bucket text;
  v_input_key text;
  v_second_key text;
  v_value numeric;
  v_base numeric;
  v_rate numeric;
  v_units numeric;
  v_included numeric;
  v_price numeric;
  v_include boolean;
  v_breakdown jsonb := '[]'::jsonb;
  v_metrics jsonb := '{}'::jsonb;
  v_total numeric := 0;
  v_existing numeric;
begin
  if jsonb_typeof(coalesce(p_components,'[]'::jsonb)) <> 'array' then
    raise exception 'مكونات قاعدة الحساب يجب أن تكون مصفوفة';
  end if;

  for c in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    v_mode := c->>'mode';
    v_key := coalesce(nullif(c->>'key',''),'component');
    v_label := coalesce(nullif(c->>'label',''),v_key);
    v_bucket := coalesce(nullif(c->>'bucket',''),'other');
    v_include := coalesce((c->>'include_in_total')::boolean,true);
    v_value := 0;
    v_base := null;
    v_rate := null;
    v_units := null;
    v_price := null;

    case v_mode
      when 'fixed' then
        v_value := coalesce((c->>'amount')::numeric,0);

      when 'input_amount' then
        v_input_key := c->>'input_key';
        if nullif(v_input_key,'') is null then raise exception 'input_key مطلوب للمكون %',v_label; end if;
        v_value := coalesce((p_inputs->>v_input_key)::numeric,0);

      when 'percentage_of_input' then
        v_input_key := c->>'input_key';
        if nullif(v_input_key,'') is null then raise exception 'input_key مطلوب للمكون %',v_label; end if;
        v_base := coalesce((p_inputs->>v_input_key)::numeric,0);
        v_rate := coalesce((c->>'rate_percent')::numeric,0);
        v_value := v_base * v_rate / 100;

      when 'per_unit' then
        v_input_key := c->>'input_key';
        if nullif(v_input_key,'') is null then raise exception 'input_key مطلوب للمكون %',v_label; end if;
        v_units := coalesce((p_inputs->>v_input_key)::numeric,0);
        v_included := coalesce((c->>'included_units')::numeric,0);
        v_price := coalesce((c->>'unit_price')::numeric,0);
        v_value := greatest(v_units-v_included,0) * v_price;

      when 'multiply_inputs' then
        v_input_key := c->>'left_input_key';
        v_second_key := c->>'right_input_key';
        if nullif(v_input_key,'') is null or nullif(v_second_key,'') is null then
          raise exception 'مفتاحا المدخلين مطلوبان للمكون %',v_label;
        end if;
        v_base := coalesce((p_inputs->>v_input_key)::numeric,0);
        v_rate := coalesce((p_inputs->>v_second_key)::numeric,0);
        v_value := v_base * v_rate;

      when 'input_times_constant' then
        v_input_key := c->>'input_key';
        if nullif(v_input_key,'') is null then raise exception 'input_key مطلوب للمكون %',v_label; end if;
        v_base := coalesce((p_inputs->>v_input_key)::numeric,0);
        v_rate := coalesce((c->>'factor')::numeric,0);
        v_value := v_base * v_rate;

      else
        raise exception 'نوع مكون حساب غير مدعوم: %',coalesce(v_mode,'NULL');
    end case;

    if v_value < 0 then raise exception 'ناتج المكون % لا يمكن أن يكون سالبًا',v_label; end if;
    v_value := round(v_value,2);
    if v_include then v_total := v_total + v_value; end if;

    v_existing := coalesce((v_metrics->>v_bucket)::numeric,0);
    v_metrics := jsonb_set(v_metrics,array[v_bucket],to_jsonb(round(v_existing+v_value,2)),true);
    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object(
      'key',v_key,
      'label',v_label,
      'mode',v_mode,
      'bucket',v_bucket,
      'include_in_total',v_include,
      'amount',v_value,
      'base',v_base,
      'rate_or_factor',v_rate,
      'units',v_units,
      'unit_price',v_price
    ));
  end loop;

  total := round(greatest(v_total,0),2);
  breakdown := v_breakdown;
  metrics := v_metrics;
  return next;
end;
$$;

create or replace function private.fn_budget_compute_line_amount(
  p_item_id uuid,
  p_period_id uuid,
  p_rate_version_id uuid,
  p_variable_inputs jsonb default null,
  p_override jsonb default null
) returns table(amount numeric,snapshot jsonb)
language plpgsql stable set search_path=''
as $$
declare
  v_item public.budget_item_definitions;
  v_rate public.budget_rate_versions;
  v_params jsonb;
  v_amount numeric := 0;
  v_qty numeric;
  v_price numeric;
  v_count numeric;
  v_base numeric;
  v_pct numeric;
  v_band public.budget_tariff_bands;
  v_breakdown jsonb := '[]'::jsonb;
  v_metrics jsonb := '{}'::jsonb;
  v_input_schema jsonb := '[]'::jsonb;
begin
  select * into v_item from public.budget_item_definitions where id=p_item_id and node_type='item';
  if v_item.id is null then raise exception 'البند المالي غير موجود'; end if;

  if p_rate_version_id is not null then
    select * into v_rate from public.budget_rate_versions where id=p_rate_version_id and item_id=p_item_id;
    if v_rate.id is null then raise exception 'إصدار التعرفة لا يخص هذا البند'; end if;
  end if;

  if p_rate_version_id is null and v_item.calculation_type <> 'external_forecast_actual' then
    raise exception 'لا توجد تعرفة سارية للبند %',v_item.name;
  end if;

  v_params := coalesce(v_rate.params,'{}'::jsonb)
    || coalesce(p_variable_inputs,'{}'::jsonb)
    || coalesce(p_override,'{}'::jsonb);
  v_input_schema := coalesce(v_rate.params->'input_schema','[]'::jsonb);

  case v_item.calculation_type
    when 'fixed_amount' then
      v_amount := coalesce((v_params->>'amount')::numeric,0);

    when 'quantity_x_unit_price' then
      v_qty := coalesce((v_params->>'quantity')::numeric,0);
      v_price := coalesce((v_params->>'unit_price')::numeric,0);
      v_amount := v_qty*v_price;
      v_breakdown := jsonb_build_array(jsonb_build_object('label',v_item.name,'mode','quantity_x_unit_price','quantity',v_qty,'unit_price',v_price,'amount',round(v_amount,2)));

    when 'variable_monthly' then
      v_amount := coalesce((v_params->>'amount')::numeric,0);

    when 'manual_actual' then
      v_amount := coalesce((v_params->>'amount')::numeric,0);

    when 'percentage_of_base' then
      v_base := coalesce((v_params->>'base_amount')::numeric,0);
      v_pct := coalesce((v_params->>'percentage')::numeric,0);
      v_amount := v_base*v_pct/100;
      v_breakdown := jsonb_build_array(jsonb_build_object('label',v_item.name,'mode','percentage_of_base','base_amount',v_base,'percentage',v_pct,'amount',round(v_amount,2)));

    when 'tiered' then
      v_count := coalesce((v_params->>'count')::numeric,0);
      select * into v_band
      from public.budget_tariff_bands
      where rate_version_id=p_rate_version_id
        and min_count<=v_count
        and (max_count is null or v_count<max_count)
      order by band_order
      limit 1;
      if v_band.id is null then raise exception 'لا توجد شريحة مطابقة للعدد %',v_count; end if;
      if v_band.band_mode='flat_fee_on_entry' then
        v_amount := v_band.band_amount;
      elsif v_band.band_mode='per_unit_in_band' then
        v_amount := v_count*v_band.band_amount;
      else
        select coalesce(sum(greatest(least(v_count,coalesce(b.max_count,v_count))-b.min_count,0)*b.band_amount),0)
        into v_amount
        from public.budget_tariff_bands b
        where b.rate_version_id=p_rate_version_id and b.min_count<v_count;
      end if;
      v_breakdown := jsonb_build_array(jsonb_build_object('label','الشريحة المحتسبة','count',v_count,'band_order',v_band.band_order,'min',v_band.min_count,'max',v_band.max_count,'mode',v_band.band_mode,'amount',round(v_amount,2)));

    when 'external_forecast_actual' then
      if v_item.external_source='payroll_run' then
        v_amount := private.fn_budget_payroll_forecast(p_period_id);
      else
        raise exception 'مصدر خارجي غير مدعوم';
      end if;

    when 'employee_based_contribution' then
      if jsonb_array_length(coalesce(v_rate.params->'components','[]'::jsonb))=0 then
        raise exception 'تعرفة المساهمة تحتاج مكونات نسب معتمدة';
      end if;
      select e.total,e.breakdown,e.metrics
      into v_amount,v_breakdown,v_metrics
      from private.fn_budget_component_engine(v_params,v_rate.params->'components') e;

    when 'subscription_plus_usage' then
      if jsonb_array_length(coalesce(v_rate.params->'components','[]'::jsonb))=0 then
        raise exception 'تعرفة الاشتراك + الاستخدام تحتاج مكونات';
      end if;
      select e.total,e.breakdown,e.metrics
      into v_amount,v_breakdown,v_metrics
      from private.fn_budget_component_engine(v_params,v_rate.params->'components') e;

    when 'composite_formula' then
      if jsonb_array_length(coalesce(v_rate.params->'components','[]'::jsonb))=0 then
        raise exception 'المعادلة المركبة تحتاج مكونات حساب';
      end if;
      select e.total,e.breakdown,e.metrics
      into v_amount,v_breakdown,v_metrics
      from private.fn_budget_component_engine(v_params,v_rate.params->'components') e;

    else
      raise exception 'نوع حساب غير مدعوم: %',v_item.calculation_type;
  end case;

  v_amount := round(greatest(coalesce(v_amount,0),0),2);
  snapshot := jsonb_build_object(
    'engine_version','2.0.0',
    'calculated_at',now(),
    'calculation_type',v_item.calculation_type,
    'rate_version_id',p_rate_version_id,
    'input_schema',v_input_schema,
    'resolved_inputs',v_params,
    'breakdown',v_breakdown,
    'metrics',v_metrics,
    'amount',v_amount,
    'matched_band',case when v_band.id is null then null else jsonb_build_object(
      'id',v_band.id,'order',v_band.band_order,'min',v_band.min_count,'max',v_band.max_count,'mode',v_band.band_mode,'amount',v_band.band_amount
    ) end
  );
  amount := v_amount;
  return next;
end;
$$;

-- بوابة موحدة: نفس المحرر ينشئ تصنيفًا أو ورقة حسابية.
create or replace function private.fn_budget_rpc_upsert_group(
  p_group_id uuid,
  p_parent_item_id uuid,
  p_branch_scope_id uuid,
  p_group_key text,
  p_name text,
  p_is_active boolean,
  p_notes text,
  p_sort_order integer
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid;
  v_id uuid;
  v_parent_type text;
begin
  v_uid := private.fn_budget_require('finance.operating_budget.edit');
  if nullif(trim(p_group_key),'') is null or nullif(trim(p_name),'') is null then
    raise exception 'التصنيف واسم المجموعة مطلوبان';
  end if;
  if p_parent_item_id is not null then
    select node_type into v_parent_type from public.budget_item_definitions where id=p_parent_item_id;
    if v_parent_type is distinct from 'group' then raise exception 'الأب يجب أن يكون تصنيفًا تجميعيًا'; end if;
  end if;

  if p_group_id is null then
    insert into public.budget_item_definitions(
      parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,external_source,cost_behavior,is_active,notes,sort_order,created_by
    ) values(
      p_parent_item_id,'group',p_branch_scope_id,trim(p_group_key),trim(p_name),null,null,null,null,coalesce(p_is_active,true),nullif(trim(p_notes),''),coalesce(p_sort_order,0),v_uid
    ) returning id into v_id;
  else
    update public.budget_item_definitions set
      parent_item_id=p_parent_item_id,
      branch_scope_id=p_branch_scope_id,
      group_key=trim(p_group_key),
      name=trim(p_name),
      is_active=coalesce(p_is_active,true),
      notes=nullif(trim(p_notes),''),
      sort_order=coalesce(p_sort_order,0)
    where id=p_group_id and node_type='group'
    returning id into v_id;
    if v_id is null then raise exception 'التصنيف غير موجود أو ليس مجموعة'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function private.fn_budget_rpc_save_catalog_node(
  p_node_id uuid,
  p_node_type text,
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
  p_sort_order integer,
  p_rate_valid_from date,
  p_rate_params jsonb,
  p_rate_source text,
  p_rate_bands jsonb,
  p_schedule_valid_from date,
  p_schedule jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_id uuid;
  v_existing_type text;
  v_rate public.budget_rate_versions;
  v_schedule public.budget_item_schedules;
  v_sched_unit text;
  v_sched_count integer;
  v_sched_anchor date;
  v_sched_rule text;
  v_sched_lead integer;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  if p_node_type not in ('group','item') then raise exception 'نوع العقدة غير صحيح'; end if;

  if p_node_id is not null then
    select node_type into v_existing_type from public.budget_item_definitions where id=p_node_id;
    if v_existing_type is null then raise exception 'العقدة غير موجودة'; end if;
    if v_existing_type<>p_node_type then raise exception 'لا يمكن تحويل تصنيف إلى عنصر مالي أو العكس؛ أنشئ عقدة جديدة'; end if;
  end if;

  if p_node_type='group' then
    if p_rate_params is not null or coalesce(jsonb_array_length(coalesce(p_rate_bands,'[]'::jsonb)),0)>0 or p_schedule is not null then
      raise exception 'التصنيف لا يحمل تعرفة أو جدولة أو قيمة مستقلة';
    end if;
    return private.fn_budget_rpc_upsert_group(
      p_node_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_is_active,p_notes,p_sort_order
    );
  end if;

  v_id := private.fn_budget_rpc_upsert_item(
    p_node_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,
    p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order
  );

  if p_rate_params is not null then
    if p_rate_valid_from is null then raise exception 'تاريخ سريان التعرفة مطلوب'; end if;

    if p_calculation_type='tiered' and jsonb_array_length(coalesce(p_rate_bands,'[]'::jsonb))=0 then
      raise exception 'الحساب بالشرائح يحتاج شريحة واحدة على الأقل';
    end if;
    if p_calculation_type in ('employee_based_contribution','subscription_plus_usage','composite_formula')
       and jsonb_array_length(coalesce(p_rate_params->'components','[]'::jsonb))=0 then
      raise exception 'نوع الحساب المختار يحتاج مكونات حساب';
    end if;

    select * into v_rate
    from public.budget_rate_versions
    where item_id=v_id and valid_from<=p_rate_valid_from and (valid_to is null or valid_to>=p_rate_valid_from)
    order by valid_from desc limit 1;

    if v_rate.id is not null and v_rate.valid_from=p_rate_valid_from then
      if v_rate.params is distinct from p_rate_params
         or (p_calculation_type='tiered' and exists(
           select 1
           from (
             select jsonb_agg(jsonb_build_object(
               'band_order',b.band_order,'min_count',b.min_count,'max_count',b.max_count,'band_mode',b.band_mode,'band_amount',b.band_amount
             ) order by b.band_order) as bands
             from public.budget_tariff_bands b where b.rate_version_id=v_rate.id
           ) x
           where coalesce(x.bands,'[]'::jsonb) is distinct from coalesce(p_rate_bands,'[]'::jsonb)
         )) then
        raise exception 'يوجد إصدار تعرفة يبدأ في نفس التاريخ؛ أنشئ تغييرًا بتاريخ سريان لاحقًا أو عدّل الشهر فقط';
      end if;
    else
      perform private.fn_budget_rpc_set_item_rate(
        v_id,p_rate_valid_from,p_rate_params,coalesce(p_rate_source,'manual_entry'),
        'إعداد من محرك بنود ميزانية التشغيل',null,coalesce(p_rate_bands,'[]'::jsonb)
      );
    end if;
  end if;

  if p_schedule is not null then
    if p_schedule_valid_from is null then raise exception 'تاريخ سريان الجدولة مطلوب'; end if;
    v_sched_unit := p_schedule->>'recurrence_unit';
    v_sched_count := coalesce((p_schedule->>'recurrence_interval_count')::integer,1);
    v_sched_anchor := (p_schedule->>'anchor_date')::date;
    v_sched_rule := coalesce(p_schedule->>'accrual_start_rule','from_period_start');
    v_sched_lead := nullif(p_schedule->>'accrual_lead_months','')::integer;

    select * into v_schedule
    from public.budget_item_schedules
    where item_id=v_id and valid_from<=p_schedule_valid_from and (valid_to is null or valid_to>=p_schedule_valid_from)
    order by valid_from desc limit 1;

    if v_schedule.id is not null
       and v_schedule.valid_from=p_schedule_valid_from
       and v_schedule.recurrence_unit=v_sched_unit
       and v_schedule.recurrence_interval_count=v_sched_count
       and v_schedule.anchor_date=v_sched_anchor
       and v_schedule.accrual_start_rule=v_sched_rule
       and v_schedule.accrual_lead_months is not distinct from v_sched_lead then
      null;
    else
      perform private.fn_budget_rpc_set_schedule(
        v_id,p_schedule_valid_from,v_sched_unit,v_sched_count,v_sched_anchor,v_sched_rule,v_sched_lead
      );
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.budget_save_catalog_node(
  p_node_id uuid,
  p_node_type text,
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
  p_sort_order integer,
  p_rate_valid_from date,
  p_rate_params jsonb,
  p_rate_source text,
  p_rate_bands jsonb,
  p_schedule_valid_from date,
  p_schedule jsonb
) returns uuid
language sql security invoker set search_path=''
as $$
  select private.fn_budget_rpc_save_catalog_node(
    p_node_id,p_node_type,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,
    p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order,
    p_rate_valid_from,p_rate_params,p_rate_source,p_rate_bands,p_schedule_valid_from,p_schedule
  )
$$;

revoke all on function public.budget_save_catalog_node(uuid,text,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,jsonb,date,jsonb) from public,anon;
grant execute on function public.budget_save_catalog_node(uuid,text,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,jsonb,date,jsonb) to authenticated,service_role;
revoke all on function private.fn_budget_rpc_save_catalog_node(uuid,text,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,jsonb,date,jsonb) from public,anon;
grant execute on function private.fn_budget_rpc_save_catalog_node(uuid,text,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,jsonb,date,jsonb) to authenticated,service_role;
revoke all on function private.fn_budget_rpc_upsert_group(uuid,uuid,uuid,text,text,boolean,text,integer) from public,anon,authenticated;
grant execute on function private.fn_budget_rpc_upsert_group(uuid,uuid,uuid,text,text,boolean,text,integer) to service_role;
revoke all on function private.fn_budget_component_engine(jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.fn_budget_component_engine(jsonb,jsonb) to service_role;

-- أزل بوابات الكتالوج القديمة من قاعدة التشغيل؛ البوابة الموحدة أعلاه هي المدخل الوحيد للواجهة.
drop function if exists public.budget_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb);
drop function if exists public.budget_upsert_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer);
drop function if exists public.budget_set_item_rate(uuid,date,jsonb,text,text,date,jsonb);
drop function if exists public.budget_set_schedule(uuid,date,text,integer,date,text,integer);
drop function if exists private.fn_budget_rpc_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb);

-- تحويل بند التأمينات الصفري القديم إلى تصنيف حقيقي له أوراق حسابية.
-- لا نزرع نسبًا نظامية من شركة أخرى أو من الذاكرة؛ المستخدم سيضيف التعرفة الموثقة لاحقًا.
do $$
declare
  v_old uuid;
  v_parent uuid;
  v_gosi_group uuid;
  v_branch uuid;
begin
  select id into v_old
  from public.budget_item_definitions
  where node_type='item' and name='التأمينات الاجتماعية (GOSI)'
  limit 1;

  if v_old is not null then
    if exists(select 1 from public.budget_period_lines where item_id=v_old)
       or exists(select 1 from public.budget_obligations where item_id=v_old) then
      raise exception 'بند التأمينات القديم له تاريخ مالي؛ يلزم ترحيل تاريخي صريح قبل تحويله';
    end if;
    select parent_item_id,branch_scope_id into v_parent,v_branch from public.budget_item_definitions where id=v_old;
    delete from public.budget_tariff_bands where rate_version_id in (select id from public.budget_rate_versions where item_id=v_old);
    delete from public.budget_rate_versions where item_id=v_old;
    delete from public.budget_item_schedules where item_id=v_old;
    delete from public.budget_item_definitions where id=v_old;
  else
    select id into v_parent from public.budget_item_definitions where node_type='group' and group_key='government_subscriptions' and parent_item_id is null order by sort_order limit 1;
    select id into v_branch from public.company_branches where is_headquarters=true limit 1;
  end if;

  select id into v_gosi_group
  from public.budget_item_definitions
  where node_type='group' and name='التأمينات الاجتماعية (GOSI)'
  limit 1;

  if v_gosi_group is null then
    insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,is_active,notes,sort_order)
    values(v_parent,'group',v_branch,'government_subscriptions','التأمينات الاجتماعية (GOSI)',true,'تصنيف تجميعي؛ قيمته تأتي من فئات العمالة تحته ولا يحمل مبلغًا مستقلًا.',20)
    returning id into v_gosi_group;
  end if;

  if not exists(select 1 from public.budget_item_definitions where parent_item_id=v_gosi_group and name='سعودي') then
    insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,is_active,notes,sort_order)
    values(v_gosi_group,'item',v_branch,'government_subscriptions','سعودي','إجمالي الأجور الخاضعة للاشتراك','employee_based_contribution','government_payroll_linked',true,'الإدخال الشهري هو إجمالي الأجور الخاضعة للاشتراك لهذه الفئة؛ لا حاجة لأسماء الموظفين.',10);
  end if;

  if not exists(select 1 from public.budget_item_definitions where parent_item_id=v_gosi_group and name='غير سعودي') then
    insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,is_active,notes,sort_order)
    values(v_gosi_group,'item',v_branch,'government_subscriptions','غير سعودي','إجمالي الأجور الخاضعة للاشتراك','employee_based_contribution','government_payroll_linked',true,'الإدخال الشهري هو إجمالي الأجور الخاضعة للاشتراك لهذه الفئة؛ لا حاجة لأسماء الموظفين.',20);
  end if;
end $$;

-- لا ينبغي أن يبقى أي نوع حساب معلن لكنه متوقف برسالة "محجوز" بعد هذه المهاجرة.
revoke execute on function private.fn_budget_compute_line_amount(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.fn_budget_compute_line_amount(uuid,uuid,uuid,jsonb,jsonb) to service_role;
