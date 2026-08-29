-- نفس البوابة الموحدة تستوعب الآن التصحيح والتغيير الزمني.
-- لا بوابة تشغيلية موازية.

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
language plpgsql
security definer
set search_path=''
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
  v_sched_valid_to date;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  if p_node_type not in ('group','item') then raise exception 'نوع العقدة غير صحيح'; end if;

  if p_node_id is not null then
    select node_type into v_existing_type
    from public.budget_item_definitions
    where id=p_node_id;
    if v_existing_type is null then raise exception 'العقدة غير موجودة'; end if;
    if v_existing_type<>p_node_type then
      raise exception 'لا يمكن تحويل تصنيف إلى عنصر مالي أو العكس؛ أنشئ عقدة جديدة';
    end if;
  end if;

  if p_node_type='group' then
    if p_rate_params is not null
       or coalesce(jsonb_array_length(coalesce(p_rate_bands,'[]'::jsonb)),0)>0
       or p_schedule is not null then
      raise exception 'التصنيف لا يحمل تعرفة أو جدولة أو قيمة مستقلة';
    end if;
    return private.fn_budget_rpc_upsert_group(
      p_node_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,
      p_is_active,p_notes,p_sort_order
    );
  end if;

  v_id := private.fn_budget_rpc_upsert_item(
    p_node_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,
    p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order
  );

  if p_rate_params is not null then
    if p_rate_valid_from is null then raise exception 'تاريخ سريان التعرفة مطلوب'; end if;
    if p_calculation_type='tiered'
       and jsonb_array_length(coalesce(p_rate_bands,'[]'::jsonb))=0 then
      raise exception 'الحساب بالشرائح يحتاج شريحة واحدة على الأقل';
    end if;
    if p_calculation_type in ('employee_based_contribution','subscription_plus_usage','composite_formula')
       and jsonb_array_length(coalesce(p_rate_params->'components','[]'::jsonb))=0 then
      raise exception 'نوع الحساب المختار يحتاج مكونات حساب';
    end if;

    select * into v_rate
    from public.budget_rate_versions
    where item_id=v_id
      and valid_from<=p_rate_valid_from
      and (valid_to is null or valid_to>=p_rate_valid_from)
    order by valid_from desc
    limit 1;

    if v_rate.id is not null
       and v_rate.valid_from=p_rate_valid_from
       and v_rate.params is not distinct from p_rate_params
       and (
         p_calculation_type<>'tiered'
         or not exists(
           select 1
           from (
             select jsonb_agg(jsonb_build_object(
               'band_order',b.band_order,
               'min_count',b.min_count,
               'max_count',b.max_count,
               'band_mode',b.band_mode,
               'band_amount',b.band_amount
             ) order by b.band_order) as bands
             from public.budget_tariff_bands b
             where b.rate_version_id=v_rate.id
           ) x
           where coalesce(x.bands,'[]'::jsonb)
             is distinct from coalesce(p_rate_bands,'[]'::jsonb)
         )
       ) then
      null;
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
    v_sched_valid_to := nullif(p_schedule->>'valid_to','')::date;

    select * into v_schedule
    from public.budget_item_schedules
    where item_id=v_id
      and valid_from<=p_schedule_valid_from
      and (valid_to is null or valid_to>=p_schedule_valid_from)
    order by valid_from desc
    limit 1;

    if v_schedule.id is not null
       and v_schedule.valid_from=p_schedule_valid_from
       and v_schedule.valid_to is not distinct from v_sched_valid_to
       and v_schedule.recurrence_unit=v_sched_unit
       and v_schedule.recurrence_interval_count=v_sched_count
       and v_schedule.anchor_date=v_sched_anchor
       and v_schedule.accrual_start_rule=v_sched_rule
       and v_schedule.accrual_lead_months is not distinct from v_sched_lead then
      null;
    else
      perform private.fn_budget_rpc_set_schedule_v2(
        v_id,p_schedule_valid_from,v_sched_valid_to,v_sched_unit,v_sched_count,
        v_sched_anchor,v_sched_rule,v_sched_lead
      );
    end if;
  end if;

  return v_id;
end;
$$;
