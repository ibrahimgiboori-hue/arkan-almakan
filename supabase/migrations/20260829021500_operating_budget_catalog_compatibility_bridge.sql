-- جسر نشر مؤقت: يحافظ على نسخة الواجهة الحالية أثناء انتقالها إلى budget_save_catalog_node.
-- لا يحتوي أي منطق مستقل؛ كل العمل يمر إلى البوابة الموحدة الجديدة.
create or replace function public.budget_save_catalog_item(
  p_item_id uuid,
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
  p_schedule_valid_from date,
  p_schedule jsonb
) returns uuid
language sql security invoker set search_path=''
as $$
  select public.budget_save_catalog_node(
    p_item_id,
    'item',
    p_parent_item_id,
    p_branch_scope_id,
    p_group_key,
    p_name,
    p_unit_label,
    p_calculation_type,
    p_external_source,
    p_cost_behavior,
    p_is_active,
    p_notes,
    p_sort_order,
    p_rate_valid_from,
    p_rate_params,
    p_rate_source,
    '[]'::jsonb,
    p_schedule_valid_from,
    p_schedule
  )
$$;

revoke all on function public.budget_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb) from public,anon;
grant execute on function public.budget_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb) to authenticated,service_role;

comment on function public.budget_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb)
is 'Temporary compatibility alias to budget_save_catalog_node; remove after unified editor is deployed everywhere.';
