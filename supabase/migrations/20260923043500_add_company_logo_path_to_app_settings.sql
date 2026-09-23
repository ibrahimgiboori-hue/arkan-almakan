alter table public.app_settings
  add column if not exists company_logo_path text;
