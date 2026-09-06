-- Reusable paper rental agreement for worker housing, pending official Ejar documentation.
-- Individual agreements remain ordinary document records; this migration only creates the reusable template and access mapping.

insert into public.document_templates (
  code, name_ar, name_en, category, prefix, layout, logic,
  is_custom, is_active, intro_text, closing_text,
  show_stamp, show_bank, parties_layout,
  template_source, description_ar, relation_scope, keywords,
  template_profile, catalog_order, constitution_version
)
values (
  'WORKER_HOUSING_RENTAL_AGREEMENT',
  'عقد إيجار سكن عمال — ورقي مؤقت',
  'Worker Housing Rental Agreement — Temporary Paper Record',
  'correspondence_governance',
  'RNT',
  $layout$
  {
    "schemaVersion": 3,
    "constitutionVersion": "1.16",
    "gridColumns": 48,
    "profile": "worker_housing_rental_agreement",
    "sections": [
      {"id":"parties","kind":"parties","style":"strict","title":"أطراف العقد"},
      {
        "id":"agreement_data","kind":"cards","style":"strict","title":"بيانات الاتفاق",
        "fields":[
          {"key":"agreement_date","label":"تاريخ الاتفاق","type":"date","span":12,"required":true},
          {"key":"city","label":"المدينة","type":"text","span":12,"required":true},
          {"key":"start_date","label":"بداية المدة","type":"date","span":12,"required":true},
          {"key":"end_date","label":"نهاية المدة","type":"date","span":12,"required":true},
          {"key":"duration_text","label":"مدة العقد","type":"text","span":12,"required":true},
          {"key":"annual_rent","label":"القيمة الإيجارية السنوية","type":"money","span":12,"required":true}
        ]
      },
      {
        "id":"premises","kind":"cards","style":"strict","title":"العين المؤجرة والغرض",
        "fields":[
          {"key":"premises_description","label":"وصف العين المؤجرة","type":"textarea","rows":2,"span":24,"required":true},
          {"key":"premises_location","label":"الموقع","type":"text","span":12,"required":true},
          {"key":"use_purpose","label":"غرض الاستخدام","type":"text","span":12,"required":true}
        ]
      },
      {
        "id":"occupants","kind":"table","style":"strict","title":"شاغلو السكن",
        "columns":[
          {"key":"occupant_name","label":"الاسم","type":"text","span":24},
          {"key":"nationality","label":"الجنسية","type":"text","span":10},
          {"key":"id_number","label":"رقم الإقامة / الهوية","type":"text","span":14}
        ]
      },
      {"id":"preamble","kind":"text","style":"strict","title":"التمهيد","key":"preamble"},
      {"id":"clause_1","kind":"text","style":"strict","title":"البند الأول — محل العقد","key":"clause_1"},
      {"id":"clause_2","kind":"text","style":"strict","title":"البند الثاني — مدة العقد","key":"clause_2"},
      {"id":"clause_3","kind":"text","style":"strict","title":"البند الثالث — القيمة الإيجارية وطريقة الدفع","key":"clause_3"},
      {"id":"clause_4","kind":"text","style":"strict","title":"البند الرابع — التوثيق عبر منصة إيجار","key":"clause_4"},
      {"id":"clause_5","kind":"text","style":"strict","title":"البند الخامس — نسخ العقد والسريان","key":"clause_5"},
      {
        "id":"signatures","kind":"signatures","style":"strict","title":"التوقيعات والإقرار",
        "roles":["الطرف الأول — المؤجر","الطرف الثاني — المستأجر"]
      }
    ]
  }
  $layout$::jsonb,
  '[]'::jsonb,
  true,
  true,
  'مؤقت لحين التوثيق الرسمي عبر منصة إيجار.',
  null,
  true,
  false,
  'double',
  'catalog',
  'عقد ورقي لإثبات واقعة إيجار سكن عمال بصورة مؤقتة إلى حين استكمال التوثيق الإلكتروني عبر منصة إيجار.',
  array['general']::text[],
  array['إيجار','عقد إيجار','سكن عمال','غرفة حارس','إيجار ورقي','منصة إيجار']::text[],
  'worker_housing_rental_agreement',
  1211,
  '1.16'
)
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  category = excluded.category,
  prefix = excluded.prefix,
  layout = excluded.layout,
  logic = excluded.logic,
  is_custom = excluded.is_custom,
  is_active = excluded.is_active,
  intro_text = excluded.intro_text,
  closing_text = excluded.closing_text,
  show_stamp = excluded.show_stamp,
  show_bank = excluded.show_bank,
  parties_layout = excluded.parties_layout,
  template_source = excluded.template_source,
  description_ar = excluded.description_ar,
  relation_scope = excluded.relation_scope,
  keywords = excluded.keywords,
  template_profile = excluded.template_profile,
  catalog_order = excluded.catalog_order,
  constitution_version = excluded.constitution_version,
  updated_at = now();

insert into public.document_access_pack_templates (
  pack_id, template_code, can_view, can_create, can_edit, can_approve, sort_order
)
select
  p.id,
  'WORKER_HOUSING_RENTAL_AGREEMENT',
  true, true, true, false, 1211
from public.document_access_packs p
where p.pack_key = 'governance_admin'
on conflict (pack_id, template_code) do update set
  can_view = excluded.can_view,
  can_create = excluded.can_create,
  can_edit = excluded.can_edit,
  can_approve = excluded.can_approve,
  sort_order = excluded.sort_order;
