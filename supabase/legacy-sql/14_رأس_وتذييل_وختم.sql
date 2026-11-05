-- ============================================================
--  الملف 14 : رأس وتذييل يتكرران على كل صفحة + ختم قابل للتحريك
-- ============================================================

-- ------------------------------------------------------------
--  ١. صور الرأس والتذييل والعلامة المائية
-- ------------------------------------------------------------
alter table app_settings add column if not exists header_image_path    text;
alter table app_settings add column if not exists footer_image_path    text;
alter table app_settings add column if not exists watermark_image_path text;
alter table app_settings add column if not exists header_height_mm numeric(5,1) not null default 40;
alter table app_settings add column if not exists footer_height_mm numeric(5,1) not null default 32;
alter table app_settings add column if not exists watermark_opacity numeric(3,2) not null default 0.35;

comment on column app_settings.header_image_path is
  'شريط الرأس وحده — يتكرر في thead على كل صفحة مطبوعة';

-- ------------------------------------------------------------
--  ٢. موضع الختم والتوقيع — يُحرَّك من المعاينة
--     الإحداثيات بالمليمتر من أعلى ويمين الورقة
-- ------------------------------------------------------------
alter table quotations add column if not exists stamp_x_mm numeric(6,1);
alter table quotations add column if not exists stamp_y_mm numeric(7,1);
alter table quotations add column if not exists sign_x_mm  numeric(6,1);
alter table quotations add column if not exists sign_y_mm  numeric(7,1);
alter table quotations add column if not exists sign_size_mm numeric(5,1);

alter table documents  add column if not exists stamp_x_mm numeric(6,1);
alter table documents  add column if not exists stamp_y_mm numeric(7,1);
alter table documents  add column if not exists sign_x_mm  numeric(6,1);
alter table documents  add column if not exists sign_y_mm  numeric(7,1);
alter table documents  add column if not exists sign_size_mm numeric(5,1);
alter table documents  add column if not exists show_signature boolean;

comment on column quotations.stamp_x_mm is
  'موضع الختم أفقياً بالمليمتر من حافة الورقة اليمنى — فارغ يعني الموضع الافتراضي';

-- ------------------------------------------------------------
--  ٣. مواضع جاهزة يختار منها المستخدم
-- ------------------------------------------------------------
create table if not exists stamp_presets (
  id         uuid primary key default gen_random_uuid(),
  name_ar    text not null,
  x_mm       numeric(6,1) not null,
  y_mm       numeric(7,1) not null,
  sort_order integer not null default 100
);

alter table stamp_presets enable row level security;

drop policy if exists p_stamp_presets_read on stamp_presets;
create policy p_stamp_presets_read on stamp_presets for select
  using (current_app_role() is not null);

insert into stamp_presets (name_ar, x_mm, y_mm, sort_order) values
  ('أسفل يمين الصفحة',  25, 240, 10),
  ('أسفل يسار الصفحة', 150, 240, 20),
  ('بجانب الإجماليات',  30, 195, 30),
  ('وسط أسفل الصفحة',   90, 240, 40)
on conflict do nothing;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
    where table_name='app_settings' and column_name='header_image_path') as "حقل الرأس",
  (select count(*) from information_schema.columns
    where table_name='quotations' and column_name='stamp_x_mm') as "موضع الختم",
  (select count(*) from stamp_presets) as "مواضع جاهزة";
