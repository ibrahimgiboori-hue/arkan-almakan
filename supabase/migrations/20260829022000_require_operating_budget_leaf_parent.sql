-- كل قيمة مالية يجب أن تنتمي إلى تصنيف تجميعي؛ لا أوراق مالية يتيمة.
create or replace function private.fn_budget_guard_value_tree_definition()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_parent_type text;
  v_cycle boolean := false;
begin
  if new.node_type='item' and new.parent_item_id is null then
    raise exception 'العنصر الحسابي يجب أن ينتمي إلى تصنيف تجميعي';
  end if;

  if new.parent_item_id is not null then
    if new.parent_item_id = new.id then
      raise exception 'لا يمكن أن يكون البند أبًا لنفسه';
    end if;

    select d.node_type into v_parent_type
    from public.budget_item_definitions d
    where d.id=new.parent_item_id;

    if v_parent_type is distinct from 'group' then
      raise exception 'الأب يجب أن يكون تصنيفًا تجميعيًا؛ العنصر الحسابي لا يقبل أبناء';
    end if;

    if tg_op='UPDATE' then
      with recursive ancestors as (
        select d.id,d.parent_item_id from public.budget_item_definitions d where d.id=new.parent_item_id
        union all
        select d.id,d.parent_item_id
        from public.budget_item_definitions d
        join ancestors a on d.id=a.parent_item_id
      )
      select exists(select 1 from ancestors where id=new.id) into v_cycle;
      if v_cycle then raise exception 'شجرة بنود التشغيل لا تسمح بدورة مرجعية بين التصنيفات'; end if;
    end if;
  end if;

  if new.node_type='item' and exists(
    select 1 from public.budget_item_definitions child where child.parent_item_id=new.id
  ) then
    raise exception 'العنصر الحسابي ورقة نهائية ولا يجوز أن يحمل أبناء؛ استخدم تصنيفًا تجميعيًا';
  end if;

  return new;
end;
$$;

-- يجب أن تكون البيانات الحالية متوافقة قبل تفعيل الحارس.
do $$
begin
  if exists(select 1 from public.budget_item_definitions where node_type='item' and parent_item_id is null) then
    raise exception 'توجد أوراق مالية بلا تصنيف أب؛ صححها قبل تفعيل الحارس';
  end if;
end $$;

revoke execute on function private.fn_budget_guard_value_tree_definition() from public,anon,authenticated;
