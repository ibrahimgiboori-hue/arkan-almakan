-- STATUS: APPLIED to the live database on 2026-11-05 as version 20261105102435 (owner approved).
--
-- Central A4 safe area: four independent edges set once by the owner.
--
-- Backfilled with what prints today for a portrait letterhead page
-- (measured artwork + Word clearance on top/bottom, Word body margin on sides),
-- so no printed document moves until the owner changes them in Settings.
-- The old letterhead_top_mm / letterhead_bottom_mm / letterhead_side_mm columns
-- are not read by any code and are left untouched.

alter table public.app_settings
  add column if not exists page_safe_top_mm    numeric(4,1),
  add column if not exists page_safe_bottom_mm numeric(4,1),
  add column if not exists page_safe_right_mm  numeric(4,1),
  add column if not exists page_safe_left_mm   numeric(4,1);

update public.app_settings
   set page_safe_top_mm    = coalesce(page_safe_top_mm, 46.9),
       page_safe_bottom_mm = coalesce(page_safe_bottom_mm, 31.8),
       page_safe_right_mm  = coalesce(page_safe_right_mm, 25.4),
       page_safe_left_mm   = coalesce(page_safe_left_mm, 25.4);

alter table public.app_settings
  drop constraint if exists app_settings_page_safe_area_range;
alter table public.app_settings
  add constraint app_settings_page_safe_area_range check (
        page_safe_top_mm    between 0 and 90
    and page_safe_bottom_mm between 0 and 90
    and page_safe_right_mm  between 0 and 90
    and page_safe_left_mm   between 0 and 90
    and 210 - page_safe_right_mm - page_safe_left_mm >= 60
    and 297 - page_safe_top_mm - page_safe_bottom_mm >= 60
  );

comment on column public.app_settings.page_safe_top_mm    is 'Central A4 safe area (portrait letterhead sheet): distance of content from the top edge, mm';
comment on column public.app_settings.page_safe_bottom_mm is 'Central A4 safe area: distance of content from the bottom edge, mm';
comment on column public.app_settings.page_safe_right_mm  is 'Central A4 safe area: distance of content from the right edge, mm';
comment on column public.app_settings.page_safe_left_mm   is 'Central A4 safe area: distance of content from the left edge, mm';
