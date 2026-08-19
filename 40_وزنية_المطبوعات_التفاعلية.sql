-- ============================================================
--  الملف 40 : حفظ الوزنية التفاعلية للمطبوعات
--  Global defaults live in code; overrides are Family / Document.
-- ============================================================

create table if not exists print_layout_overrides (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('family','document')),
  scope_key text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid,
  updated_at timestamptz not null default now(),
  unique (scope, scope_key)
);

alter table print_layout_overrides enable row level security;

drop policy if exists p_print_layout_read on print_layout_overrides;
create policy p_print_layout_read on print_layout_overrides for select
  using (current_app_role() is not null);

drop policy if exists p_print_layout_write on print_layout_overrides;
create policy p_print_layout_write on print_layout_overrides for all
  using (current_app_role() in ('ceo','hr','accountant'))
  with check (current_app_role() in ('ceo','hr','accountant'));

create index if not exists ix_print_layout_overrides_scope
  on print_layout_overrides(scope, scope_key);

notify pgrst, 'reload schema';
