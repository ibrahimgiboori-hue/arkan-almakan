begin;

alter table public.organization_settings
  add column if not exists letterhead_top_mm numeric not null default 46,
  add column if not exists letterhead_bottom_mm numeric not null default 38,
  add column if not exists letterhead_side_mm numeric not null default 20,
  add column if not exists bank_name_full text null,
  add column if not exists bank_account_no text null,
  add column if not exists bank_iban text null,
  add column if not exists quote_terms_default text null,
  add column if not exists show_stamp_by_default boolean not null default true,
  add column if not exists stamp_size_mm numeric not null default 30,
  add column if not exists signature_size_mm numeric not null default 20,
  add column if not exists doc_theme text not null default 'maroon',
  add column if not exists header_height_mm numeric not null default 40,
  add column if not exists footer_height_mm numeric not null default 32,
  add column if not exists hide_empty_stamp boolean not null default true,
  add column if not exists recruitment_public_intro text null,
  add column if not exists ui_theme_preset text not null default 'sand',
  add column if not exists operating_budget_baseline_date date null;

commit;
