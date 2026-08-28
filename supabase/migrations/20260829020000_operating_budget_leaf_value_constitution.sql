-- دستور القيمة في ميزانية التشغيل:
-- التصنيف (group) لا يحمل قيمة مالية مستقلة؛ قيمته مشتقة من مجموع أوراقه الحسابية.
-- العنصر (item) هو ورقة حسابية نهائية فقط، ولا يجوز أن يكون أبًا لعناصر أخرى.

create or replace function private.fn_budget_guard_value_tree_definition()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_parent_type text;
  v_cycle boolean := false;
begin
  if new.parent_item_id is not null then
    if new.parent_item_id = new.id then
      raise exception 'لا يمكن أن يكون البند أبًا لنفسه';
    end if;

    select d.node_type
      into v_parent_type
    from public.budget_item_definitions d
    where d.id = new.parent_item_id;

    if v_parent_type is distinct from 'group' then
      raise exception 'الأب يجب أن يكون تصنيفًا تجميعيًا؛ العنصر الحسابي لا يقبل أبناء';
    end if;

    if tg_op = 'UPDATE' then
      with recursive ancestors as (
        select d.id,d.parent_item_id
        from public.budget_item_definitions d
        where d.id = new.parent_item_id
        union all
        select d.id,d.parent_item_id
        from public.budget_item_definitions d
        join ancestors a on d.id = a.parent_item_id
      )
      select exists(select 1 from ancestors where id = new.id)
        into v_cycle;

      if v_cycle then
        raise exception 'شجرة بنود التشغيل لا تسمح بدورة مرجعية بين التصنيفات';
      end if;
    end if;
  end if;

  if new.node_type = 'item'
     and exists(
       select 1
       from public.budget_item_definitions child
       where child.parent_item_id = new.id
     ) then
    raise exception 'العنصر الحسابي ورقة نهائية ولا يجوز أن يحمل أبناء؛ استخدم تصنيفًا تجميعيًا';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_budget_value_tree_definition on public.budget_item_definitions;
create trigger trg_budget_value_tree_definition
before insert or update of parent_item_id,node_type on public.budget_item_definitions
for each row execute function private.fn_budget_guard_value_tree_definition();

create or replace function private.fn_budget_require_financial_leaf_reference()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_node_type text;
begin
  select d.node_type
    into v_node_type
  from public.budget_item_definitions d
  where d.id = new.item_id;

  if v_node_type is distinct from 'item' then
    raise exception 'القيمة المالية والتعرفة والجدولة والاستحقاق لا ترتبط إلا بعنصر حسابي نهائي';
  end if;

  if exists(
    select 1
    from public.budget_item_definitions child
    where child.parent_item_id = new.item_id
  ) then
    raise exception 'العنصر الذي يحمل أبناء لا يجوز أن يحمل قيمة مالية مستقلة';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_budget_schedule_leaf_only on public.budget_item_schedules;
create trigger trg_budget_schedule_leaf_only
before insert or update of item_id on public.budget_item_schedules
for each row execute function private.fn_budget_require_financial_leaf_reference();

drop trigger if exists trg_budget_rate_leaf_only on public.budget_rate_versions;
create trigger trg_budget_rate_leaf_only
before insert or update of item_id on public.budget_rate_versions
for each row execute function private.fn_budget_require_financial_leaf_reference();

drop trigger if exists trg_budget_obligation_leaf_only on public.budget_obligations;
create trigger trg_budget_obligation_leaf_only
before insert or update of item_id on public.budget_obligations
for each row execute function private.fn_budget_require_financial_leaf_reference();

drop trigger if exists trg_budget_period_line_leaf_only on public.budget_period_lines;
create trigger trg_budget_period_line_leaf_only
before insert or update of item_id on public.budget_period_lines
for each row execute function private.fn_budget_require_financial_leaf_reference();

-- افشل المهاجرة فورًا إذا كان التاريخ الحالي يخالف الدستور الجديد بدل إخفاء المشكلة.
do $$
begin
  if exists(
    select 1
    from public.budget_item_definitions child
    join public.budget_item_definitions parent on parent.id = child.parent_item_id
    where parent.node_type <> 'group'
  ) then
    raise exception 'توجد عناصر حالية تحت أب حسابي؛ صحح الشجرة قبل اعتماد دستور القيمة';
  end if;

  if exists(
    select 1
    from public.budget_item_definitions d
    where d.node_type='item'
      and exists(select 1 from public.budget_item_definitions child where child.parent_item_id=d.id)
  ) then
    raise exception 'يوجد عنصر حسابي حالي يحمل أبناء؛ صحح الشجرة قبل اعتماد دستور القيمة';
  end if;

  if exists(
    select 1 from public.budget_item_schedules s
    join public.budget_item_definitions d on d.id=s.item_id
    where d.node_type<>'item'
  ) or exists(
    select 1 from public.budget_rate_versions r
    join public.budget_item_definitions d on d.id=r.item_id
    where d.node_type<>'item'
  ) or exists(
    select 1 from public.budget_obligations o
    join public.budget_item_definitions d on d.id=o.item_id
    where d.node_type<>'item'
  ) or exists(
    select 1 from public.budget_period_lines l
    join public.budget_item_definitions d on d.id=l.item_id
    where d.node_type<>'item'
  ) then
    raise exception 'يوجد أثر مالي مربوط بتصنيف تجميعي؛ التصنيفات لا تحمل قيمة مستقلة';
  end if;
end $$;

revoke execute on function private.fn_budget_guard_value_tree_definition() from public,anon,authenticated;
revoke execute on function private.fn_budget_require_financial_leaf_reference() from public,anon,authenticated;
