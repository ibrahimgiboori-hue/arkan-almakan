alter table public.quotations
  add column if not exists print_overlay_positions jsonb not null default '{}'::jsonb;
