-- ============================================================
--  الملف 03 : أصول الهوية (صورة الترويسة والختم) + الحساب البنكي
-- ============================================================

-- ------------------------------------------------------------
--  ١. حقول جديدة في إعدادات الشركة
-- ------------------------------------------------------------
alter table app_settings add column if not exists letterhead_image_path text;
alter table app_settings add column if not exists letterhead_page2_path text;
alter table app_settings add column if not exists stamp_image_path      text;
alter table app_settings add column if not exists signature_image_path  text;

alter table app_settings add column if not exists bank_name_full   text;
alter table app_settings add column if not exists bank_account_no  text;
alter table app_settings add column if not exists bank_iban        text;

alter table app_settings add column if not exists quote_terms_default text;
alter table app_settings add column if not exists show_stamp_by_default boolean not null default true;

update app_settings set
  bank_name_full  = coalesce(bank_name_full,  'مصرف الراجحي — مؤسسة أركان المكان للمقاولات'),
  bank_account_no = coalesce(bank_account_no, '344000001000608059 6653'),
  bank_iban       = coalesce(bank_iban,       'SA7180000344608010596653'),
  quote_terms_default = coalesce(quote_terms_default,
    'الأسعار تشمل جميع المواد والعمالة والمعدات وأدوات التنفيذ والنقل.
الأسعار لا تشمل أي أعمال إضافية خارج نطاق البنود المذكورة.
التنفيذ وفق المواصفات الفنية وتعليمات الجهة المشرفة.
مدة صلاحية العرض ٣٠ يوماً من تاريخ إصدار العرض.
مدة التنفيذ يتم تحديدها حسب البرنامج الزمني المتفق عليه.')
where id = 1;

-- ------------------------------------------------------------
--  ٢. مخزن أصول الهوية
--  القراءة عامة (لتظهر الصور في المستندات)، والرفع للمصرّح لهم فقط
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('brand', 'brand', true)
on conflict (id) do nothing;

drop policy if exists p_brand_read on storage.objects;
create policy p_brand_read on storage.objects for select
  using (bucket_id = 'brand');

drop policy if exists p_brand_insert on storage.objects;
create policy p_brand_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand');

drop policy if exists p_brand_update on storage.objects;
create policy p_brand_update on storage.objects for update to authenticated
  using (bucket_id = 'brand');

drop policy if exists p_brand_delete on storage.objects;
create policy p_brand_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand');

-- ------------------------------------------------------------
--  ٣. توحيد الترقيم : بادئة الشركة ARK لكل المستندات
--     ARK-LVE-2026-0001 بدل LVE-2026-0001
-- ------------------------------------------------------------
create or replace function next_document_number(p_doc_type text, p_prefix text default null)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::int;
  v_prefix text := coalesce(p_prefix, upper(left(p_doc_type, 3)));
  v_num integer;
begin
  insert into number_sequences (doc_type, year, prefix, last_number)
  values (p_doc_type, v_year, v_prefix, 1)
  on conflict (doc_type, year)
    do update set last_number = number_sequences.last_number + 1
  returning last_number, prefix into v_num, v_prefix;

  return 'ARK-' || v_prefix || '-' || v_year || '-' || lpad(v_num::text, 4, '0');
end $$;

-- ------------------------------------------------------------
--  ٤. التحقق
-- ------------------------------------------------------------
select bank_iban, quote_terms_default is not null as الشروط_مهيأة,
       (select count(*) from storage.buckets where id = 'brand') as مخزن_الهوية
from app_settings where id = 1;
