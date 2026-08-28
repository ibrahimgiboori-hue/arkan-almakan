create or replace function private.fn_budget_guard_item_definition_history() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.node_type='item' and exists(select 1 from public.budget_period_lines where item_id=old.id) then
    if new.parent_item_id is distinct from old.parent_item_id
      or new.branch_scope_id is distinct from old.branch_scope_id
      or new.group_key is distinct from old.group_key
      or new.name is distinct from old.name
      or new.unit_label is distinct from old.unit_label
      or new.calculation_type is distinct from old.calculation_type
      or new.external_source is distinct from old.external_source
      or new.cost_behavior is distinct from old.cost_behavior then
      raise exception 'هذا البند دخل كشفًا شهريًا؛ لا يمكن تغيير بنيته التاريخية. أوقفه وأنشئ بندًا جديدًا بدلًا من ذلك';
    end if;
  end if;
  return new;
end;$$;

drop trigger if exists trg_budget_item_definition_history on public.budget_item_definitions;
create trigger trg_budget_item_definition_history
before update on public.budget_item_definitions
for each row execute function private.fn_budget_guard_item_definition_history();

create or replace function private.fn_budget_rpc_save_catalog_item(
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
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_rate public.budget_rate_versions;
  v_schedule public.budget_item_schedules;
  v_rate_source text;
  v_sched_unit text;
  v_sched_count integer;
  v_sched_anchor date;
  v_sched_rule text;
  v_sched_lead integer;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');

  v_id:=private.fn_budget_rpc_upsert_item(
    p_item_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,
    p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order
  );

  if p_rate_params is not null then
    if p_rate_valid_from is null then raise exception 'تاريخ سريان التعرفة مطلوب'; end if;
    v_rate_source:=coalesce(p_rate_source,'manual_entry');
    select * into v_rate from public.budget_rate_versions
    where item_id=v_id and valid_from<=p_rate_valid_from and (valid_to is null or valid_to>=p_rate_valid_from)
    order by valid_from desc limit 1;

    if v_rate.id is not null and v_rate.valid_from=p_rate_valid_from then
      if v_rate.params is distinct from p_rate_params then
        raise exception 'يوجد إصدار تعرفة يبدأ في نفس التاريخ؛ عدّل الشهر الحالي من كشف الشهر أو اختر تاريخ سريان لاحقًا';
      end if;
    else
      perform private.fn_budget_rpc_set_item_rate(v_id,p_rate_valid_from,p_rate_params,v_rate_source,'إعداد من كتالوج ميزانية وتشغيل الشركة',null,'[]'::jsonb);
    end if;
  end if;

  if p_schedule is not null then
    if p_schedule_valid_from is null then raise exception 'تاريخ سريان الجدولة مطلوب'; end if;
    v_sched_unit:=p_schedule->>'recurrence_unit';
    v_sched_count:=coalesce((p_schedule->>'recurrence_interval_count')::integer,1);
    v_sched_anchor:=(p_schedule->>'anchor_date')::date;
    v_sched_rule:=coalesce(p_schedule->>'accrual_start_rule','from_period_start');
    v_sched_lead:=nullif(p_schedule->>'accrual_lead_months','')::integer;

    select * into v_schedule from public.budget_item_schedules
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
      perform private.fn_budget_rpc_set_schedule(v_id,p_schedule_valid_from,v_sched_unit,v_sched_count,v_sched_anchor,v_sched_rule,v_sched_lead);
    end if;
  end if;

  return v_id;
end;$$;

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
) returns uuid language sql security invoker set search_path='' as $$
  select private.fn_budget_rpc_save_catalog_item(
    p_item_id,p_parent_item_id,p_branch_scope_id,p_group_key,p_name,p_unit_label,
    p_calculation_type,p_external_source,p_cost_behavior,p_is_active,p_notes,p_sort_order,
    p_rate_valid_from,p_rate_params,p_rate_source,p_schedule_valid_from,p_schedule
  )
$$;

revoke all on function public.budget_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb) from public,anon;
grant execute on function public.budget_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb) to authenticated,service_role;
revoke execute on function public.budget_upsert_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer) from authenticated;
revoke execute on function public.budget_set_item_rate(uuid,date,jsonb,text,text,date,jsonb) from authenticated;
revoke execute on function public.budget_set_schedule(uuid,date,text,integer,date,text,integer) from authenticated;
revoke execute on function private.fn_budget_rpc_upsert_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer) from authenticated;
revoke execute on function private.fn_budget_rpc_set_item_rate(uuid,date,jsonb,text,text,date,jsonb) from authenticated;
revoke execute on function private.fn_budget_rpc_set_schedule(uuid,date,text,integer,date,text,integer) from authenticated;
grant execute on function private.fn_budget_rpc_save_catalog_item(uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb) to authenticated,service_role;

do $$
declare v_legacy record;
begin
  for v_legacy in
    select id,name from public.budget_item_definitions
    where node_type='item' and (
      (group_key='office_supplies' and name='مستلزمات مكتبية')
      or (group_key='hospitality' and name='ضيافة المكتب')
      or (group_key='cleaning' and name='النظافة والخدمات')
    )
  loop
    if not exists(select 1 from public.budget_period_lines where item_id=v_legacy.id)
       and not exists(select 1 from public.budget_obligations where item_id=v_legacy.id) then
      delete from public.budget_rate_versions where item_id=v_legacy.id;
      delete from public.budget_item_schedules where item_id=v_legacy.id;
      delete from public.budget_item_definitions where id=v_legacy.id;
    else
      update public.budget_item_definitions
      set is_active=false,notes=concat_ws(' | ',notes,'بند تجميعي موروث أوقف بعد تحويل التشغيل إلى أصناف تفصيلية')
      where id=v_legacy.id;
    end if;
  end loop;
end $$;

insert into public.budget_item_definitions(
  parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order
)
select g.id,'item',hq.id,v.group_key,v.name,v.unit_label,v.calculation_type,v.cost_behavior,v.notes,v.sort_order
from (values
  ('office_supplies','دبابيس دباسة','كرتون','quantity_x_unit_price','consumable_budget','استهلاك سنوي مرجعي: 4 كراتين × 20 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',10),
  ('office_supplies','أقلام','كرتون','quantity_x_unit_price','consumable_budget','استهلاك سنوي مرجعي: 5 كراتين × 25 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',20),
  ('office_supplies','ورق طباعة','كرتون','quantity_x_unit_price','consumable_budget','استهلاك سنوي مرجعي: 5 كراتين × 100 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',30),
  ('office_supplies','حبر الطابعة','عبوة','quantity_x_unit_price','consumable_budget','استهلاك سنوي مرجعي: 3 عبوات × 180 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',40),
  ('hospitality','مياه معبأة 330 مل','كرتون','quantity_x_unit_price','consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',10),
  ('hospitality','نسكافيه 3 في 1','كرتون','quantity_x_unit_price','consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',20),
  ('hospitality','أكواب ورقية','باكيت','quantity_x_unit_price','consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',30),
  ('hospitality','ملاعق بلاستيك','باكيت','quantity_x_unit_price','consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',40),
  ('hospitality','سكر 5 كجم','كيس','quantity_x_unit_price','consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',50),
  ('cleaning','منظفات نظافة','شهر','fixed_amount','variable_recurring','تقدير شهري قابل للتأكيد بالقيمة الفعلية.',10),
  ('cleaning','مناديل ورقية','باكيت','quantity_x_unit_price','consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',20),
  ('cleaning','أكياس نفايات','باكيت','quantity_x_unit_price','consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',30)
) v(group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order)
join public.budget_item_definitions g on g.node_type='group' and g.group_key=v.group_key
cross join lateral (select id from public.company_branches where is_headquarters=true limit 1) hq
where not exists(
  select 1 from public.budget_item_definitions d where d.node_type='item' and d.group_key=v.group_key and d.name=v.name
);

insert into public.budget_item_schedules(item_id,valid_from,recurrence_unit,recurrence_interval_count,anchor_date,accrual_start_rule)
select d.id,date '2026-08-01','month',1,date '2026-08-31','from_period_start'
from public.budget_item_definitions d
where d.node_type='item'
  and d.name in ('مياه معبأة 330 مل','نسكافيه 3 في 1','أكواب ورقية','ملاعق بلاستيك','سكر 5 كجم','منظفات نظافة','مناديل ورقية','أكياس نفايات')
  and not exists(select 1 from public.budget_item_schedules s where s.item_id=d.id);

insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note)
select d.id,date '2026-08-01',v.params,'manual_entry',v.source_note
from (values
  ('office_supplies','دبابيس دباسة','{"quantity":4,"unit_price":20}'::jsonb,'استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('office_supplies','أقلام','{"quantity":5,"unit_price":25}'::jsonb,'استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('office_supplies','ورق طباعة','{"quantity":5,"unit_price":100}'::jsonb,'استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('office_supplies','حبر الطابعة','{"quantity":3,"unit_price":180}'::jsonb,'استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('hospitality','مياه معبأة 330 مل','{"quantity":10,"unit_price":15}'::jsonb,'خط الأساس الشهري الحالي'),
  ('hospitality','نسكافيه 3 في 1','{"quantity":5,"unit_price":15}'::jsonb,'خط الأساس الشهري الحالي'),
  ('hospitality','أكواب ورقية','{"quantity":10,"unit_price":5}'::jsonb,'خط الأساس الشهري الحالي'),
  ('hospitality','ملاعق بلاستيك','{"quantity":3,"unit_price":5}'::jsonb,'خط الأساس الشهري الحالي'),
  ('hospitality','سكر 5 كجم','{"quantity":1,"unit_price":25}'::jsonb,'خط الأساس الشهري الحالي'),
  ('cleaning','منظفات نظافة','{"amount":30}'::jsonb,'خط الأساس الشهري الحالي'),
  ('cleaning','مناديل ورقية','{"quantity":2,"unit_price":15}'::jsonb,'خط الأساس الشهري الحالي'),
  ('cleaning','أكياس نفايات','{"quantity":3,"unit_price":5}'::jsonb,'خط الأساس الشهري الحالي')
) v(group_key,name,params,source_note)
join public.budget_item_definitions d on d.node_type='item' and d.group_key=v.group_key and d.name=v.name
where not exists(select 1 from public.budget_rate_versions r where r.item_id=d.id);
