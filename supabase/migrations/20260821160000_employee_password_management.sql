alter table public.app_users
  add column if not exists must_change_password boolean not null default false,
  add column if not exists temporary_password_set_at timestamptz,
  add column if not exists password_changed_at timestamptz;

comment on column public.app_users.must_change_password is
  'Forces the user to replace an administrator-issued temporary password before using the dashboard.';
comment on column public.app_users.temporary_password_set_at is
  'Timestamp when the primary user last issued a temporary password. The password itself is never stored here.';
comment on column public.app_users.password_changed_at is
  'Timestamp of the latest user-chosen password change through the governed access flow.';
