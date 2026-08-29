-- التاريخ المالي يحمي الهوية الحسابية والتصنيف، لا النصوص الوصفية.
-- الاسم والوحدة والملاحظات والترتيب وحالة النشاط يمكن تصحيحها دون إعادة كتابة المبالغ التاريخية.

create or replace function private.fn_budget_guard_item_definition_history()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.node_type='item'
     and exists(select 1 from public.budget_period_lines where item_id=old.id) then
    if new.parent_item_id is distinct from old.parent_item_id
      or new.branch_scope_id is distinct from old.branch_scope_id
      or new.group_key is distinct from old.group_key
      or new.calculation_type is distinct from old.calculation_type
      or new.external_source is distinct from old.external_source
      or new.cost_behavior is distinct from old.cost_behavior then
      raise exception 'هذا البند دخل كشفًا شهريًا؛ لا يمكن تغيير هويته الحسابية أو تصنيفه التاريخي. الاسم والوحدة والملاحظات والترتيب والحالة قابلة للتعديل، أما قاعدة الحساب فتُصحح أو تُغيّر بإصدار زمني';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.fn_budget_guard_item_definition_history() from public,anon,authenticated;
