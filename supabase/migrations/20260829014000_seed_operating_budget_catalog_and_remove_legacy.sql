do $$
begin
  if not exists(select 1 from public.company_branches where is_headquarters=true) then
    insert into public.company_branches(name,is_headquarters,is_active) values('المقر الرئيسي',true,true);
  end if;
end $$;

insert into public.budget_item_definitions(node_type,group_key,name,sort_order)
select 'group',v.group_key,v.name,v.sort_order
from (values
  ('office_supplies','المستلزمات المكتبية',10),
  ('hospitality','الضيافة',20),
  ('cleaning','النظافة والخدمات',30),
  ('rent','الإيجارات',40),
  ('utilities','الخدمات والفواتير',50),
  ('government_subscriptions','الاشتراكات والالتزامات الحكومية',60),
  ('payroll','الرواتب',70),
  ('other','أخرى',90)
) v(group_key,name,sort_order)
where not exists(
  select 1 from public.budget_item_definitions d where d.node_type='group' and d.group_key=v.group_key
);

insert into public.budget_item_definitions(
  parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,external_source,cost_behavior,notes,sort_order
)
select g.id,'item',hq.id,v.group_key,v.name,v.unit_label,v.calculation_type,v.external_source,v.cost_behavior,v.notes,v.sort_order
from (values
  ('office_supplies','دبابيس دباسة','كرتون','quantity_x_unit_price',null,'consumable_budget','استهلاك سنوي مرجعي: 4 كراتين × 20 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',10),
  ('office_supplies','أقلام','كرتون','quantity_x_unit_price',null,'consumable_budget','استهلاك سنوي مرجعي: 5 كراتين × 25 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',20),
  ('office_supplies','ورق طباعة','كرتون','quantity_x_unit_price',null,'consumable_budget','استهلاك سنوي مرجعي: 5 كراتين × 100 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',30),
  ('office_supplies','حبر الطابعة','عبوة','quantity_x_unit_price',null,'consumable_budget','استهلاك سنوي مرجعي: 3 عبوات × 180 ريال. لا ينشأ استحقاق قبل تحديد توقيت الشراء.',40),
  ('hospitality','مياه معبأة 330 مل','كرتون','quantity_x_unit_price',null,'consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',10),
  ('hospitality','نسكافيه 3 في 1','كرتون','quantity_x_unit_price',null,'consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',20),
  ('hospitality','أكواب ورقية','باكيت','quantity_x_unit_price',null,'consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',30),
  ('hospitality','ملاعق بلاستيك','باكيت','quantity_x_unit_price',null,'consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',40),
  ('hospitality','سكر 5 كجم','كيس','quantity_x_unit_price',null,'consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',50),
  ('cleaning','منظفات نظافة','شهر','fixed_amount',null,'variable_recurring','تقدير شهري قابل للتأكيد بالقيمة الفعلية.',10),
  ('cleaning','مناديل ورقية','باكيت','quantity_x_unit_price',null,'consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',20),
  ('cleaning','أكياس نفايات','باكيت','quantity_x_unit_price',null,'consumable_budget','خط أساس شهري قابل للتعديل لكل شهر.',30),
  ('rent','إيجار المكتب','دفعة','fixed_amount',null,'fixed_contractual','يحدد تاريخ الاستحقاق والدورية من العقد؛ لم تفترض الدورية.',10),
  ('utilities','فاتورة الكهرباء','شهر','variable_monthly',null,'variable_recurring','تقدير شهري ثم تأكيد الفاتورة الفعلية.',10),
  ('utilities','فاتورة المياه','شهر','variable_monthly',null,'variable_recurring','تقدير شهري ثم تأكيد الفاتورة الفعلية.',20),
  ('government_subscriptions','التأمينات الاجتماعية (GOSI)','شهر','variable_monthly',null,'government_payroll_linked','القيمة مؤقتًا مدخل شهري؛ الربط الآلي لا يفعل قبل اعتماد قاعدة التأمينات.',10),
  ('government_subscriptions','اشتراك منصة قوى (Qiwa)','اشتراك','fixed_amount',null,'recurring_subscription','لا ينشأ استحقاق حتى تدخل القيمة وتاريخ التجديد الفعلي.',20),
  ('government_subscriptions','اشتراك منصة أبشر أعمال','اشتراك','fixed_amount',null,'recurring_subscription','لا ينشأ استحقاق حتى تدخل القيمة وتاريخ التجديد الفعلي.',30),
  ('payroll','رواتب الموظفين','شهر','external_forecast_actual','payroll_run','payroll_linked','يقرأ الراتب الفعلي من مسير معتمد، ويستخدم آخر مسير/بيانات الموظفين كتوقع فقط.',10)
) v(group_key,name,unit_label,calculation_type,external_source,cost_behavior,notes,sort_order)
join public.budget_item_definitions g on g.node_type='group' and g.group_key=v.group_key
cross join lateral (select id from public.company_branches where is_headquarters=true limit 1) hq
where not exists(
  select 1 from public.budget_item_definitions d where d.node_type='item' and d.group_key=v.group_key and d.name=v.name
);

insert into public.budget_item_schedules(item_id,valid_from,recurrence_unit,recurrence_interval_count,anchor_date,accrual_start_rule)
select d.id,date '2026-08-01','month',1,date '2026-08-31','from_period_start'
from public.budget_item_definitions d
where d.node_type='item'
  and d.name in (
    'مياه معبأة 330 مل','نسكافيه 3 في 1','أكواب ورقية','ملاعق بلاستيك','سكر 5 كجم',
    'منظفات نظافة','مناديل ورقية','أكياس نفايات',
    'فاتورة الكهرباء','فاتورة المياه','التأمينات الاجتماعية (GOSI)','رواتب الموظفين'
  )
  and not exists(select 1 from public.budget_item_schedules s where s.item_id=d.id);

insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note)
select d.id,date '2026-08-01',v.params,v.source,v.source_note
from (values
  ('office_supplies','دبابيس دباسة','{"quantity":4,"unit_price":20}'::jsonb,'manual_entry','استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('office_supplies','أقلام','{"quantity":5,"unit_price":25}'::jsonb,'manual_entry','استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('office_supplies','ورق طباعة','{"quantity":5,"unit_price":100}'::jsonb,'manual_entry','استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('office_supplies','حبر الطابعة','{"quantity":3,"unit_price":180}'::jsonb,'manual_entry','استهلاك سنوي مرجعي أدخله المستخدم؛ توقيت الشراء غير مفترض'),
  ('hospitality','مياه معبأة 330 مل','{"quantity":10,"unit_price":15}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('hospitality','نسكافيه 3 في 1','{"quantity":5,"unit_price":15}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('hospitality','أكواب ورقية','{"quantity":10,"unit_price":5}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('hospitality','ملاعق بلاستيك','{"quantity":3,"unit_price":5}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('hospitality','سكر 5 كجم','{"quantity":1,"unit_price":25}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('cleaning','منظفات نظافة','{"amount":30}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('cleaning','مناديل ورقية','{"quantity":2,"unit_price":15}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('cleaning','أكياس نفايات','{"quantity":3,"unit_price":5}'::jsonb,'manual_entry','خط الأساس الشهري الحالي'),
  ('utilities','فاتورة الكهرباء','{"amount":0}'::jsonb,'estimated','أدخل متوسط الكهرباء ثم أكد الفاتورة الفعلية كل شهر'),
  ('utilities','فاتورة المياه','{"amount":0}'::jsonb,'estimated','أدخل متوسط المياه ثم أكد الفاتورة الفعلية كل شهر'),
  ('government_subscriptions','التأمينات الاجتماعية (GOSI)','{"amount":0}'::jsonb,'estimated','إلى أن يربط محرك التأمينات ببيانات الرواتب المعتمدة')
) v(group_key,name,params,source,source_note)
join public.budget_item_definitions d on d.node_type='item' and d.group_key=v.group_key and d.name=v.name
where not exists(select 1 from public.budget_rate_versions r where r.item_id=d.id);

do $$
begin
  if to_regclass('public.company_fixed_expenses') is not null then
    if exists(select 1 from public.company_fixed_expenses where coalesce(amount,0)<>0 or vendor is not null) then
      raise exception 'تعذر حذف جدول المصروفات القديم لأنه يحتوي بيانات مالية فعلية؛ يجب ترحيلها أولًا';
    end if;
    drop table public.company_fixed_expenses;
  end if;
end $$;

delete from public.permission_bundle_capabilities where capability_key in ('finance.office_expenses.view','finance.office_expenses.edit');
delete from public.permission_capabilities where capability_key in ('finance.office_expenses.view','finance.office_expenses.edit');
