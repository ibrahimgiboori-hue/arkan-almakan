-- ============================================================
--  الملف 08 : محرّر النماذج — النموذج بياناتٌ لا كود
--  التخطيط على شبكة 12 عموداً، والمعادلات مسجّلة كبيانات
-- ============================================================

alter table document_templates add column if not exists logic       jsonb not null default '[]'::jsonb;
alter table document_templates add column if not exists is_custom   boolean not null default false;
alter table document_templates add column if not exists background_path text;
alter table document_templates add column if not exists title_en    text;
alter table document_templates add column if not exists intro_text  text;
alter table document_templates add column if not exists closing_text text;
alter table document_templates add column if not exists margin_top_mm    numeric(5,1);
alter table document_templates add column if not exists margin_bottom_mm numeric(5,1);
alter table document_templates add column if not exists margin_side_mm   numeric(5,1);
alter table document_templates add column if not exists show_stamp  boolean not null default true;
alter table document_templates add column if not exists show_bank   boolean not null default false;
alter table document_templates add column if not exists updated_at  timestamptz not null default now();

-- ------------------------------------------------------------
--  شكل التخطيط المتوقع في layout :
--  {
--    "sections": [
--      { "id":"s1", "kind":"cards", "style":"info", "title":"بيانات الموظف",
--        "fields":[ {"key":"employee_name","label":"اسم الموظف","labelEn":"Employee",
--                    "type":"text","span":6,"required":true} ] },
--      { "id":"s2", "kind":"table", "style":"strict", "title":"البنود",
--        "columns":[ {"key":"desc","label":"البيان","span":6,"type":"text"},
--                    {"key":"qty","label":"العدد","span":2,"type":"number"},
--                    {"key":"price","label":"الفئة","span":2,"type":"money"},
--                    {"key":"total","label":"الإجمالي","span":2,"type":"money",
--                     "computed":true} ] },
--      { "id":"s3", "kind":"text",  "style":"info",   "title":"ملاحظات","key":"notes" },
--      { "id":"s4", "kind":"totals","style":"strict", "fields":[...] },
--      { "id":"s5", "kind":"signatures","roles":["الموظف","الموارد البشرية"] }
--    ]
--  }
--
--  وشكل المعادلات في logic :
--  [ {"id":"l1","target":"total","op":"multiply","a":"qty","b":"price"},
--    {"id":"l2","target":"net","op":"subtract","a":"gross","b":"deduction"},
--    {"id":"l3","target":"due","op":"condition","a":"output","b":"target",
--     "cmp":"lt","then":"penalty"} ]
--
--  المعاملات: multiply | add | subtract | divide | percent | copy | sum_column | condition
-- ------------------------------------------------------------

-- تعليم النماذج التسعة عشر بأنها مدمجة (تُرسم من سجل الكود)
update document_templates set is_custom = false where layout = '{}'::jsonb;

-- ------------------------------------------------------------
--  مخزن خلفيات النماذج المخصصة
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('forms', 'forms', true)
on conflict (id) do nothing;

drop policy if exists p_forms_read on storage.objects;
create policy p_forms_read on storage.objects for select
  using (bucket_id = 'forms');

drop policy if exists p_forms_write on storage.objects;
create policy p_forms_write on storage.objects for all to authenticated
  using (bucket_id = 'forms') with check (bucket_id = 'forms');

-- ------------------------------------------------------------
--  صلاحية إنشاء النماذج: المدير التنفيذي والموارد البشرية
-- ------------------------------------------------------------
drop policy if exists p_templates_write on document_templates;
create policy p_templates_write on document_templates for all
  using (current_app_role() in ('ceo','hr'))
  with check (current_app_role() in ('ceo','hr'));

drop trigger if exists trg_touch_templates on document_templates;
create trigger trg_touch_templates before update on document_templates
  for each row execute function fn_touch_updated_at();

drop trigger if exists trg_audit_document_templates on document_templates;
create trigger trg_audit_document_templates
  after insert or update or delete on document_templates
  for each row execute function fn_audit();

-- ------------------------------------------------------------
--  نموذج مخصص جاهز كمثال يُحتذى: مستخلص أعمال مقاول
-- ------------------------------------------------------------
insert into document_templates
  (code, name_ar, name_en, title_en, category, prefix, is_custom, show_bank, layout, logic)
values (
  'CONTRACTOR_CLAIM', 'مستخلص أعمال مقاول', 'Contractor Progress Claim',
  'CONTRACTOR PROGRESS CLAIM', 'projects', 'CLM', true, true,
  '{
    "sections": [
      { "id":"s1", "kind":"cards", "style":"info", "title":"بيانات المستخلص",
        "fields":[
          {"key":"contractor","label":"المقاول","labelEn":"Contractor","type":"text","span":6,"required":true},
          {"key":"project","label":"المشروع","labelEn":"Project","type":"text","span":6,"required":true},
          {"key":"claim_no","label":"رقم المستخلص","labelEn":"Claim No.","type":"number","span":3},
          {"key":"period_from","label":"من تاريخ","labelEn":"From","type":"date","span":3},
          {"key":"period_to","label":"إلى تاريخ","labelEn":"To","type":"date","span":3},
          {"key":"progress_pct","label":"نسبة الإنجاز %","labelEn":"Progress %","type":"number","span":3}
        ]},
      { "id":"s2", "kind":"table", "style":"strict", "title":"الأعمال المنفَّذة",
        "columns":[
          {"key":"desc","label":"بيان الأعمال","span":5,"type":"text"},
          {"key":"unit","label":"الوحدة","span":1,"type":"text"},
          {"key":"qty","label":"الكمية","span":2,"type":"number"},
          {"key":"price","label":"الفئة","span":2,"type":"money"},
          {"key":"total","label":"الإجمالي","span":2,"type":"money","computed":true}
        ]},
      { "id":"s3", "kind":"totals", "style":"strict", "title":"الحساب",
        "fields":[
          {"key":"works_total","label":"إجمالي الأعمال","type":"money","computed":true},
          {"key":"expenses","label":"مصروفات تشغيلية تحمّلها المقاول","type":"money"},
          {"key":"paid","label":"المدفوع سابقاً وعهد المشرف","type":"money"},
          {"key":"deductions","label":"خصومات وسلف","type":"money"},
          {"key":"net_due","label":"الرصيد المستحق","type":"money","computed":true,"emphasis":true}
        ]},
      { "id":"s4", "kind":"text", "style":"info", "title":"ملاحظات", "key":"notes" },
      { "id":"s5", "kind":"signatures",
        "roles":["مشرف المشروع","الموارد البشرية","المحاسب","المدير التنفيذي"] }
    ]
  }'::jsonb,
  '[
    {"id":"l1","target":"total","op":"multiply","a":"qty","b":"price","scope":"row"},
    {"id":"l2","target":"works_total","op":"sum_column","a":"total"},
    {"id":"l3","target":"gross_due","op":"add","a":"works_total","b":"expenses"},
    {"id":"l4","target":"after_paid","op":"subtract","a":"gross_due","b":"paid"},
    {"id":"l5","target":"net_due","op":"subtract","a":"after_paid","b":"deductions"}
  ]'::jsonb
)
on conflict (code) do nothing;

notify pgrst, 'reload schema';

select code, name_ar,
       case when is_custom then 'مخصص' else 'مدمج' end as النوع,
       jsonb_array_length(coalesce(layout->'sections','[]'::jsonb)) as عدد_الأقسام,
       jsonb_array_length(logic) as عدد_المعادلات
from document_templates order by is_custom desc, code;
