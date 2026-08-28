do $$
declare
  v_hq uuid;
  g_office uuid; g_hospitality uuid; g_cleaning uuid; g_rent uuid; g_utilities uuid; g_government uuid; g_payroll uuid; g_other uuid;
  i_office uuid; i_hospitality uuid; i_cleaning uuid; i_rent uuid; i_electricity uuid; i_water uuid; i_gosi uuid; i_qiwa uuid; i_absher uuid; i_payroll uuid;
  v_item uuid;
begin
  select id into v_hq from public.company_branches where is_headquarters=true limit 1;
  if v_hq is null then insert into public.company_branches(name,is_headquarters,is_active) values('المقر الرئيسي',true,true) returning id into v_hq; end if;

  select id into g_office from public.budget_item_definitions where node_type='group' and group_key='office_supplies' limit 1;
  if g_office is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','office_supplies','المستلزمات المكتبية',10) returning id into g_office; end if;
  select id into g_hospitality from public.budget_item_definitions where node_type='group' and group_key='hospitality' limit 1;
  if g_hospitality is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','hospitality','الضيافة',20) returning id into g_hospitality; end if;
  select id into g_cleaning from public.budget_item_definitions where node_type='group' and group_key='cleaning' limit 1;
  if g_cleaning is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','cleaning','النظافة والخدمات',30) returning id into g_cleaning; end if;
  select id into g_rent from public.budget_item_definitions where node_type='group' and group_key='rent' limit 1;
  if g_rent is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','rent','الإيجارات',40) returning id into g_rent; end if;
  select id into g_utilities from public.budget_item_definitions where node_type='group' and group_key='utilities' limit 1;
  if g_utilities is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','utilities','الخدمات والفواتير',50) returning id into g_utilities; end if;
  select id into g_government from public.budget_item_definitions where node_type='group' and group_key='government_subscriptions' limit 1;
  if g_government is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','government_subscriptions','الاشتراكات والالتزامات الحكومية',60) returning id into g_government; end if;
  select id into g_payroll from public.budget_item_definitions where node_type='group' and group_key='payroll' limit 1;
  if g_payroll is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','payroll','الرواتب',70) returning id into g_payroll; end if;
  select id into g_other from public.budget_item_definitions where node_type='group' and group_key='other' limit 1;
  if g_other is null then insert into public.budget_item_definitions(node_type,group_key,name,sort_order) values('group','other','أخرى',90) returning id into g_other; end if;

  select id into i_office from public.budget_item_definitions where node_type='item' and group_key='office_supplies' and name='مستلزمات مكتبية' limit 1;
  if i_office is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order) values(g_office,'item',v_hq,'office_supplies','مستلزمات مكتبية','شهر','variable_monthly','consumable_budget','ميزانية شهرية للمستلزمات؛ لا تسجل كل قلم كبند مستقل.',10) returning id into i_office; end if;
  select id into i_hospitality from public.budget_item_definitions where node_type='item' and group_key='hospitality' and name='ضيافة المكتب' limit 1;
  if i_hospitality is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order) values(g_hospitality,'item',v_hq,'hospitality','ضيافة المكتب','شهر','variable_monthly','consumable_budget','قهوة وشاي وماء وأكواب ضمن غلاف ميزانية واحد.',10) returning id into i_hospitality; end if;
  select id into i_cleaning from public.budget_item_definitions where node_type='item' and group_key='cleaning' and name='النظافة والخدمات' limit 1;
  if i_cleaning is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,sort_order) values(g_cleaning,'item',v_hq,'cleaning','النظافة والخدمات','شهر','fixed_amount','fixed_contractual',10) returning id into i_cleaning; end if;
  select id into i_rent from public.budget_item_definitions where node_type='item' and group_key='rent' and name='إيجار المكتب' limit 1;
  if i_rent is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order) values(g_rent,'item',v_hq,'rent','إيجار المكتب','دفعة','fixed_amount','fixed_contractual','يحدد تاريخ الاستحقاق والدورية من العقد؛ لم تفترض الدورية.',10) returning id into i_rent; end if;
  select id into i_electricity from public.budget_item_definitions where node_type='item' and group_key='utilities' and name='فاتورة الكهرباء' limit 1;
  if i_electricity is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,sort_order) values(g_utilities,'item',v_hq,'utilities','فاتورة الكهرباء','شهر','variable_monthly','variable_recurring',10) returning id into i_electricity; end if;
  select id into i_water from public.budget_item_definitions where node_type='item' and group_key='utilities' and name='فاتورة المياه' limit 1;
  if i_water is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,sort_order) values(g_utilities,'item',v_hq,'utilities','فاتورة المياه','شهر','variable_monthly','variable_recurring',20) returning id into i_water; end if;
  select id into i_gosi from public.budget_item_definitions where node_type='item' and group_key='government_subscriptions' and name='التأمينات الاجتماعية (GOSI)' limit 1;
  if i_gosi is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order) values(g_government,'item',v_hq,'government_subscriptions','التأمينات الاجتماعية (GOSI)','شهر','variable_monthly','government_payroll_linked','القيمة مؤقتًا مدخل شهري؛ الربط الآلي بنسبة التأمينات لا يفعل قبل اعتماد قاعدته.',10) returning id into i_gosi; end if;
  select id into i_qiwa from public.budget_item_definitions where node_type='item' and group_key='government_subscriptions' and name='اشتراك منصة قوى (Qiwa)' limit 1;
  if i_qiwa is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order) values(g_government,'item',v_hq,'government_subscriptions','اشتراك منصة قوى (Qiwa)','اشتراك','fixed_amount','recurring_subscription','لا ينشأ استحقاق حتى تدخل القيمة وتاريخ التجديد الفعلي.',20) returning id into i_qiwa; end if;
  select id into i_absher from public.budget_item_definitions where node_type='item' and group_key='government_subscriptions' and name='اشتراك منصة أبشر أعمال' limit 1;
  if i_absher is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,cost_behavior,notes,sort_order) values(g_government,'item',v_hq,'government_subscriptions','اشتراك منصة أبشر أعمال','اشتراك','fixed_amount','recurring_subscription','لا ينشأ استحقاق حتى تدخل القيمة وتاريخ التجديد الفعلي.',30) returning id into i_absher; end if;
  select id into i_payroll from public.budget_item_definitions where node_type='item' and group_key='payroll' and name='رواتب الموظفين' limit 1;
  if i_payroll is null then insert into public.budget_item_definitions(parent_item_id,node_type,branch_scope_id,group_key,name,unit_label,calculation_type,external_source,cost_behavior,notes,sort_order) values(g_payroll,'item',v_hq,'payroll','رواتب الموظفين','شهر','external_forecast_actual','payroll_run','payroll_linked','يقرأ الراتب الفعلي من مسير معتمد، ويستخدم آخر مسير/بيانات الموظفين كتوقع فقط.',10) returning id into i_payroll; end if;

  foreach v_item in array array[i_office,i_hospitality,i_cleaning,i_electricity,i_water,i_gosi,i_payroll] loop
    if not exists(select 1 from public.budget_item_schedules where item_id=v_item) then
      insert into public.budget_item_schedules(item_id,valid_from,recurrence_unit,recurrence_interval_count,anchor_date,accrual_start_rule)
      values(v_item,date '2026-08-01','month',1,date '2026-08-31','from_period_start');
    end if;
  end loop;

  if not exists(select 1 from public.budget_rate_versions where item_id=i_office) then insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note) values(i_office,date '2026-08-01','{"amount":0}'::jsonb,'estimated','أدخل متوسط المصروف الشهري عند توفره'); end if;
  if not exists(select 1 from public.budget_rate_versions where item_id=i_hospitality) then insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note) values(i_hospitality,date '2026-08-01','{"amount":315}'::jsonb,'manual_entry','القيمة التشغيلية الحالية المسجلة للضيافة'); end if;
  if not exists(select 1 from public.budget_rate_versions where item_id=i_cleaning) then insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note) values(i_cleaning,date '2026-08-01','{"amount":0}'::jsonb,'estimated','أدخل قيمة النظافة الفعلية'); end if;
  if not exists(select 1 from public.budget_rate_versions where item_id=i_electricity) then insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note) values(i_electricity,date '2026-08-01','{"amount":0}'::jsonb,'estimated','أدخل متوسط الكهرباء ثم أكد الفاتورة الفعلية كل شهر'); end if;
  if not exists(select 1 from public.budget_rate_versions where item_id=i_water) then insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note) values(i_water,date '2026-08-01','{"amount":0}'::jsonb,'estimated','أدخل متوسط المياه ثم أكد الفاتورة الفعلية كل شهر'); end if;
  if not exists(select 1 from public.budget_rate_versions where item_id=i_gosi) then insert into public.budget_rate_versions(item_id,valid_from,params,source,source_note) values(i_gosi,date '2026-08-01','{"amount":0}'::jsonb,'estimated','إلى أن يربط محرك التأمينات ببيانات الرواتب المعتمدة'); end if;
end $$;

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
