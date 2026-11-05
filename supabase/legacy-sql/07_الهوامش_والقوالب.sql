-- ============================================================
--  الملف 07 : الهوامش المركزية + التجاوز لمستند واحد + حجم الختم
-- ============================================================

-- ------------------------------------------------------------
--  ١. مركزي في إعدادات الشركة
-- ------------------------------------------------------------
alter table app_settings add column if not exists stamp_size_mm numeric(5,1) not null default 30;
alter table app_settings add column if not exists signature_size_mm numeric(5,1) not null default 20;
alter table app_settings add column if not exists doc_theme text not null default 'maroon';

-- ------------------------------------------------------------
--  ٢. التجاوز الاستثنائي: فارغ يعني "استخدم المركزي"
-- ------------------------------------------------------------
alter table quotations add column if not exists margin_top_mm    numeric(5,1);
alter table quotations add column if not exists margin_bottom_mm numeric(5,1);
alter table quotations add column if not exists margin_side_mm   numeric(5,1);
alter table quotations add column if not exists stamp_size_mm    numeric(5,1);

alter table documents  add column if not exists margin_top_mm    numeric(5,1);
alter table documents  add column if not exists margin_bottom_mm numeric(5,1);
alter table documents  add column if not exists margin_side_mm   numeric(5,1);
alter table documents  add column if not exists stamp_size_mm    numeric(5,1);
alter table documents  add column if not exists show_stamp       boolean;
alter table documents  add column if not exists show_bank        boolean;
alter table documents  add column if not exists show_letterhead  boolean;

-- ------------------------------------------------------------
--  ٣. القوالب المحفوظة لمفاتيح العروض
-- ------------------------------------------------------------
create table if not exists quote_presets (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null,
  description text,
  switches    jsonb not null,
  is_builtin  boolean not null default false,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);

alter table quote_presets enable row level security;

drop policy if exists p_presets_read on quote_presets;
create policy p_presets_read on quote_presets for select
  using (current_app_role() is not null);

drop policy if exists p_presets_write on quote_presets;
create policy p_presets_write on quote_presets for all
  using (current_app_role() in ('ceo','hr','accountant'))
  with check (current_app_role() in ('ceo','hr','accountant'));

insert into quote_presets (name_ar, description, switches, is_builtin, sort_order) values
  ('جدول كميات كامل',
   'كل الأعمدة والأقسام — للمناقصات والعطاءات',
   '{"show_unit":true,"show_qty":true,"show_unit_price":true,"show_line_total":true,
     "show_intro":true,"show_payments":true,"show_terms":true,"show_closing":true,
     "show_bank":true,"show_stamp":true}'::jsonb, true, 10),

  ('عرض مقطوعيات',
   'بلا كمية ولا إجمالي — سعر مقطوع لكل بند',
   '{"show_unit":false,"show_qty":false,"show_unit_price":true,"show_line_total":true,
     "show_intro":true,"show_payments":true,"show_terms":true,"show_closing":true,
     "show_bank":true,"show_stamp":true}'::jsonb, true, 20),

  ('قائمة فئات (أعمال مفتوحة)',
   'الوحدة والفئة فقط — الكمية تُحاسب على المنفَّذ',
   '{"show_unit":true,"show_qty":false,"show_unit_price":true,"show_line_total":false,
     "show_intro":true,"show_payments":false,"show_terms":true,"show_closing":true,
     "show_bank":true,"show_stamp":true}'::jsonb, true, 30),

  ('نسخة مختصرة',
   'العميل والجدول والاعتماد فقط',
   '{"show_unit":true,"show_qty":true,"show_unit_price":true,"show_line_total":true,
     "show_intro":false,"show_payments":false,"show_terms":false,"show_closing":false,
     "show_bank":true,"show_stamp":true}'::jsonb, true, 40),

  ('نسخة داخلية',
   'بلا ختم ولا حساب بنكي — للمراجعة الداخلية',
   '{"show_unit":true,"show_qty":true,"show_unit_price":true,"show_line_total":true,
     "show_intro":false,"show_payments":true,"show_terms":false,"show_closing":false,
     "show_bank":false,"show_stamp":false}'::jsonb, true, 50)
on conflict do nothing;

notify pgrst, 'reload schema';

select name_ar, description from quote_presets order by sort_order;
