-- بعض واجهات الكتالوج لا تعرض نطاق الفرع؛ null عند التعديل يعني «لم يُغيّر» لا «امسح الفرع».
-- يمنع ذلك تحويل تعديل وصفي بسيط إلى تغيير تاريخي كاذب.

create or replace function private.fn_budget_rpc_upsert_item(
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
  p_sort_order integer
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid;
  v_id uuid;
  v_parent_type text;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');
  if nullif(trim(p_group_key),'') is null or nullif(trim(p_name),'') is null then
    raise exception 'التصنيف واسم البند مطلوبان';
  end if;
  if p_parent_item_id is not null then
    select node_type into v_parent_type
    from public.budget_item_definitions
    where id=p_parent_item_id;
    if v_parent_type is distinct from 'group' then
      raise exception 'المجموعة الأب غير صحيحة';
    end if;
  end if;

  if p_item_id is null then
    insert into public.budget_item_definitions(
      parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,
      calculation_type,external_source,cost_behavior,is_active,notes,sort_order,created_by
    ) values(
      p_parent_item_id,'item',p_branch_scope_id,trim(p_group_key),trim(p_name),
      nullif(trim(p_unit_label),''),p_calculation_type,p_external_source,p_cost_behavior,
      coalesce(p_is_active,true),nullif(trim(p_notes),''),coalesce(p_sort_order,0),v_uid
    ) returning id into v_id;
  else
    update public.budget_item_definitions
    set parent_item_id=p_parent_item_id,
        branch_scope_id=coalesce(p_branch_scope_id,branch_scope_id),
        group_key=trim(p_group_key),
        name=trim(p_name),
        unit_label=nullif(trim(p_unit_label),''),
        calculation_type=p_calculation_type,
        external_source=p_external_source,
        cost_behavior=p_cost_behavior,
        is_active=coalesce(p_is_active,true),
        notes=nullif(trim(p_notes),''),
        sort_order=coalesce(p_sort_order,0)
    where id=p_item_id and node_type='item'
    returning id into v_id;
    if v_id is null then raise exception 'البند غير موجود'; end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function private.fn_budget_rpc_upsert_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer) from public,anon,authenticated;
