-- ============================================================
--  الملف 16 : نموذج المخاطبات العامة
--  عنوان يُكتب يدوياً · الجهة · النص · بيانات المُقدِّم · الختم
-- ============================================================

insert into document_templates
  (code, name_ar, name_en, title_en, category, prefix, is_custom,
   show_stamp, show_bank, layout, logic)
values (
  'GENERAL_LETTER', 'خطاب عام', 'General Letter', 'OFFICIAL CORRESPONDENCE',
  'correspondence', 'LTR', true, true, false,
  '{
    "sections": [
      { "id":"s_head", "kind":"cards", "style":"info", "title":"بيانات الخطاب",
        "fields":[
          {"key":"letter_title","label":"عنوان الخطاب","labelEn":"Subject",
           "type":"text","span":12,"required":true},
          {"key":"addressee","label":"الجهة الموجَّه إليها","labelEn":"To",
           "type":"text","span":8,"required":true},
          {"key":"addressee_title","label":"صفة المخاطَب","labelEn":"Attention",
           "type":"text","span":4},
          {"key":"our_ref","label":"إشارتنا","labelEn":"Our Ref","type":"text","span":6},
          {"key":"your_ref","label":"إشارتكم","labelEn":"Your Ref","type":"text","span":6}
        ]},

      { "id":"s_body", "kind":"text", "style":"plain",
        "title":"نص الخطاب", "key":"letter_body" },

      { "id":"s_sender", "kind":"cards", "style":"strict", "title":"مُقدِّم الخطاب",
        "align":"left",
        "fields":[
          {"key":"sender_name","label":"الاسم","labelEn":"Name","type":"text","span":12},
          {"key":"sender_title","label":"الصفة","labelEn":"Title","type":"text","span":12},
          {"key":"sender_id","label":"رقم الهوية","labelEn":"ID No.","type":"text","span":12},
          {"key":"sender_mobile","label":"رقم الجوال","labelEn":"Mobile","type":"text","span":12}
        ]},

      { "id":"s_stamp", "kind":"stampbox", "style":"strict", "align":"center" }
    ]
  }'::jsonb,
  '[]'::jsonb
)
on conflict (code) do update set
  layout = excluded.layout,
  name_ar = excluded.name_ar,
  title_en = excluded.title_en,
  category = excluded.category;

-- ------------------------------------------------------------
--  إخفاء أماكن الختم والتوقيع حين لا تُرفع صورها
-- ------------------------------------------------------------
alter table app_settings add column if not exists hide_empty_stamp boolean not null default true;

comment on column app_settings.hide_empty_stamp is
  'حين لا تُرفع صورة ختم أو توقيع، يُخفى مكانها كلياً بدل عرض نص فارغ';

notify pgrst, 'reload schema';

select code, name_ar,
       jsonb_array_length(layout->'sections') as الأقسام
from document_templates where code = 'GENERAL_LETTER';
