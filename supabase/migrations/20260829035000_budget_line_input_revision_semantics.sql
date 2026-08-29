-- كشف الشهر يميّز بين تقدير خاص بالشهر وبين تغيير القيمة الافتراضية من هذه الدورة وما بعدها.
-- القيم الفعلية والمدفوع لا تتأثر بمراجعة التقدير.

create or replace function private.fn_budget_rpc_save_line_inputs(
  p_line_id uuid,
  p_inputs jsonb,
  p_scope text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  l public.budget_period_lines;
  p public.budget_periods;
  d public.budget_item_definitions;
  r public.budget_rate_versions;
  v_params jsonb;
begin
  perform private.fn_budget_require('finance.operating_budget.edit');
  if p_scope not in ('this_month','ongoing') then
    raise exception 'نطاق التعديل غير صحيح';
  end if;

  select * into l
  from public.budget_period_lines
  where id=p_line_id;
  if l.id is null then raise exception 'السطر غير موجود'; end if;

  select * into p from public.budget_periods where id=l.period_id;
  if p.id is null then raise exception 'دورة الميزانية غير موجودة'; end if;

  select * into d from public.budget_item_definitions where id=l.item_id;
  if d.id is null then raise exception 'بند الميزانية غير موجود'; end if;

  if p_scope='this_month' then
    perform private.fn_budget_recalculate_line(
      p_line_id,l.variable_inputs,coalesce(p_inputs,'{}'::jsonb),
      coalesce(nullif(trim(p_reason),''),'تحديث تقدير هذا الشهر')
    );
    return true;
  end if;

  -- هذه الأنواع فقط تمثل مدخلاتها نفس قاعدة التقدير الافتراضية.
  if d.calculation_type not in ('fixed_amount','variable_monthly','quantity_x_unit_price') then
    raise exception 'هذا النوع من الحساب تُدخل قيمته لكل شهر على حدة؛ استخدم «تقدير هذا الشهر» أو عدّل قاعدة الحساب من الكتالوج';
  end if;

  select * into r
  from public.budget_rate_versions
  where item_id=l.item_id
    and valid_from<=p.period_start
    and (valid_to is null or valid_to>=p.period_start)
  order by valid_from desc
  limit 1;

  if r.id is null then raise exception 'لا توجد قاعدة تقدير سارية لهذا البند'; end if;

  v_params := coalesce(r.params,'{}'::jsonb) || coalesce(p_inputs,'{}'::jsonb);
  perform private.fn_budget_rpc_set_item_rate(
    l.item_id,
    p.period_start,
    v_params,
    'estimated',
    coalesce(nullif(trim(p_reason),''),'تغيير القيمة الافتراضية للتقدير من الدورة الحالية'),
    null,
    '[]'::jsonb
  );

  -- السطر الحالي يصبح أول دورة تستخدم القيمة الافتراضية الجديدة.
  -- overrides الشهرية الأخرى تبقى خاصة بأشهرها ولا تُمحى.
  perform private.fn_budget_recalculate_line(
    p_line_id,null,null,
    coalesce(nullif(trim(p_reason),''),'تغيير القيمة الافتراضية للتقدير من الدورة الحالية')
  );

  return true;
end;
$$;

revoke all on function private.fn_budget_rpc_save_line_inputs(uuid,jsonb,text,text) from public,anon;
grant execute on function private.fn_budget_rpc_save_line_inputs(uuid,jsonb,text,text) to authenticated,service_role;
