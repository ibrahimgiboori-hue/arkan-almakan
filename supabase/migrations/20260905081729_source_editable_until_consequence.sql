-- Source mutability law:
-- A source remains directly editable until a server-grounded consequential action exists.
-- Derived views must recompute from that source. Once a consequential action exists,
-- committed history is not rewritten; later changes use a new effective version.

create or replace function public.budget_item_edit_state(p_item_id uuid)
returns table(
  item_id uuid,
  has_committed_action boolean,
  edit_mode text
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  if not exists(select 1 from public.budget_item_definitions d where d.id=p_item_id and d.node_type='item') then
    raise exception 'البند غير موجود';
  end if;

  return query
  select
    p_item_id,
    private.fn_budget_item_has_committed_action(p_item_id),
    case
      when private.fn_budget_item_has_committed_action(p_item_id) then 'versioned_change'
      else 'direct_source_edit'
    end;
end;
$function$;

revoke all on function public.budget_item_edit_state(uuid) from public;
grant execute on function public.budget_item_edit_state(uuid) to authenticated;

create or replace function private.fn_budget_rpc_save_catalog_item_revision(
  p_node_id uuid,
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
  p_rate_version_id uuid,
  p_rate_valid_from date,
  p_rate_params jsonb,
  p_rate_source text,
  p_rate_bands jsonb,
  p_schedule_id uuid,
  p_schedule_valid_from date,
  p_schedule jsonb,
  p_revision_mode text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_valid_to date;
  v_unit text;
  v_count integer;
  v_anchor date;
  v_rule text;
  v_lead integer;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  if p_revision_mode not in('correction','current_cycle') then
    raise exception 'نوع التعديل غير صحيح';
  end if;

  if p_revision_mode='current_cycle' then
    return private.fn_budget_rpc_save_catalog_node(
      p_node_id,'item',p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,
      p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order,
      p_rate_valid_from,p_rate_params,p_rate_source,p_rate_bands,p_schedule_valid_from,p_schedule
    );
  end if;

  -- correction here means direct edit of the still-uncommitted source.
  -- The guard inside the correction functions remains the authority that blocks
  -- rewriting once an actual action has been committed.
  v_id:=private.fn_budget_rpc_upsert_item(
    p_node_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,
    p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order
  );

  if p_rate_params is not null then
    if p_rate_version_id is not null then
      perform private.fn_budget_correct_rate_version(
        v_id,p_rate_version_id,p_rate_valid_from,p_rate_params,
        coalesce(p_rate_source,'manual_entry'),coalesce(p_rate_bands,'[]'::jsonb)
      );
    else
      perform private.fn_budget_rpc_set_item_rate(
        v_id,p_rate_valid_from,p_rate_params,coalesce(p_rate_source,'manual_entry'),
        'إعداد من محرك بنود ميزانية التشغيل',null,coalesce(p_rate_bands,'[]'::jsonb)
      );
    end if;
  end if;

  if p_schedule is not null then
    if p_schedule_valid_from is null then
      raise exception 'تاريخ سريان الجدولة مطلوب';
    end if;
    v_valid_to:=nullif(p_schedule->>'valid_to','')::date;
    v_unit:=p_schedule->>'recurrence_unit';
    v_count:=coalesce((p_schedule->>'recurrence_interval_count')::integer,1);
    v_anchor:=(p_schedule->>'anchor_date')::date;
    v_rule:=coalesce(p_schedule->>'accrual_start_rule','from_period_start');
    v_lead:=nullif(p_schedule->>'accrual_lead_months','')::integer;

    if p_schedule_id is not null then
      perform private.fn_budget_correct_schedule_version(
        v_id,p_schedule_id,p_schedule_valid_from,v_valid_to,
        v_unit,v_count,v_anchor,v_rule,v_lead
      );
    else
      perform private.fn_budget_rpc_set_schedule_v2(
        v_id,p_schedule_valid_from,v_valid_to,
        v_unit,v_count,v_anchor,v_rule,v_lead
      );
    end if;
  end if;

  return v_id;
end;
$function$;
