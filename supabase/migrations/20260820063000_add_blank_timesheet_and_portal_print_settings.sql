create or replace function public.fn_portal_print_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_allowed boolean; v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'سجل الدخول أولاً'; end if;
  select (select public.current_app_role()) is not null or exists (
    select 1 from public.contractor_portal_accounts a
    where a.auth_user_id=(select auth.uid()) and a.is_active
  ) into v_allowed;
  if not v_allowed then raise exception 'الحساب غير مفعل'; end if;
  select jsonb_build_object(
    'company_name_ar',s.company_name_ar,
    'letterhead_image_path',s.letterhead_image_path,
    'header_image_path',s.header_image_path,
    'footer_image_path',s.footer_image_path,
    'watermark_image_path',s.watermark_image_path,
    'header_height_mm',s.header_height_mm,
    'footer_height_mm',s.footer_height_mm,
    'letterhead_top_mm',s.letterhead_top_mm,
    'letterhead_bottom_mm',s.letterhead_bottom_mm,
    'letterhead_side_mm',s.letterhead_side_mm
  ) into v_result from public.app_settings s where s.id=1;
  return v_result;
end $$;
revoke execute on function public.fn_portal_print_settings() from public,anon;
grant execute on function public.fn_portal_print_settings() to authenticated;

insert into public.document_templates(
  code,name_ar,category,prefix,layout,logic,description_ar,relation_scope,keywords,
  template_profile,catalog_order,constitution_version,template_source,is_custom,is_active
) values (
  'CAT_PROJECTS_OPERATIONS_CONTRACTOR_DAILY_TIMESHEET',
  'نموذج حضور عمال مقاول — فارغ','projects_operations','OPS',
  $json${
    "schemaVersion":3,"constitutionVersion":"1.16","gridColumns":48,"profile":"contractor_timesheet",
    "sections":[
      {"id":"basic_data","kind":"cards","style":"info","title":"البيانات الأساسية","fields":[
        {"key":"transaction_date","label":"تاريخ المعاملة","type":"date","span":12,"required":true},
        {"key":"project_name","label":"المشروع","type":"text","span":24,"required":true},
        {"key":"project_no","label":"رقم المشروع","type":"text","span":12},
        {"key":"site_location","label":"الموقع","type":"text","span":24},
        {"key":"client_name","label":"العميل / الجهة","type":"text","span":24},
        {"key":"party_name","label":"اسم الطرف","type":"text","span":24,"required":true},
        {"key":"party_role","label":"صفة الطرف","type":"text","span":12},
        {"key":"party_identifier","label":"رقم الهوية / السجل","type":"text","span":16},
        {"key":"party_contact","label":"وسيلة التواصل","type":"text","span":20},
        {"key":"subject","label":"الموضوع","type":"text","span":32,"required":true},
        {"key":"effective_date","label":"تاريخ السريان","type":"date","span":12}
      ]},
      {"id":"contractor_timesheet_lines","kind":"table","style":"strict","title":"بيان العمالة والحضور","columns":[
        {"key":"worker_name","label":"اسم العامل","type":"text","span":20,"required":true},
        {"key":"labor_class","label":"التصنيف","type":"text","span":7},
        {"key":"trade","label":"المهنة","type":"text","span":9},
        {"key":"attendance","label":"الحضور","type":"text","span":6},
        {"key":"supervisor_notes","label":"ملاحظات المشرف","type":"text","span":6}
      ]},
      {"id":"details","kind":"text","style":"strict","title":"التفاصيل والمبررات","key":"details"},
      {"id":"signatures","kind":"signatures","style":"strict","title":"الاعتمادات","roles":["مُعدّ النموذج","المراجع","صاحب الصلاحية"]}
    ]
  }$json$::jsonb,
  '[]'::jsonb,
  'نموذج حضور عمال مقاول — فارغ وفق دورة المسودة والمراجعة والاعتماد والأرشفة.',
  array['project','party','general']::text[],
  array['المشاريع والتشغيل','نموذج حضور عمال مقاول — فارغ','مرتبط بمشروع','مرتبط بطرف','إداري عام']::text[],
  'contractor_timesheet',911,'1.16','catalog',true,true
)
on conflict(code) do update set
  name_ar=excluded.name_ar,category=excluded.category,prefix=excluded.prefix,layout=excluded.layout,
  description_ar=excluded.description_ar,relation_scope=excluded.relation_scope,keywords=excluded.keywords,
  template_profile=excluded.template_profile,catalog_order=excluded.catalog_order,
  constitution_version=excluded.constitution_version,template_source='catalog',is_custom=true,is_active=true;
