alter table public.app_settings
  add column if not exists ui_theme_preset text not null default 'sand';

alter table public.app_settings
  drop constraint if exists app_settings_ui_theme_preset_check;

alter table public.app_settings
  add constraint app_settings_ui_theme_preset_check
  check (ui_theme_preset in ('sand','stone','olive','mist'));
