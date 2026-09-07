-- تايم شيت شهري لمقاول خارجي غير مرتبط بمشروع داخلي.
-- يحفظ الشهر والعمال والتوزيع اليومي مستقلًا عن دفاتر المشاريع، مع إمكانية التسعير لاحقًا.

create table if not exists public.contractor_external_timesheets (
  id uuid primary key default gen_random_uuid(),
  sheet_no bigint generated always as identity unique,
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  external_project_name text not null,
  site_location text,
  period_year integer not null,
  period_month integer not null,
  default_daily_rate numeric(14,2),
  currency text not null default 'SAR',
  status text not null default 'draft',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_external_timesheets_project_check check (char_length(btrim(external_project_name)) >= 2),
  constraint contractor_external_timesheets_year_check check (period_year between 2000 and 2200),
  constraint contractor_external_timesheets_month_check check (period_month between 1 and 12),
  constraint contractor_external_timesheets_rate_check check (default_daily_rate is null or default_daily_rate >= 0),
  constraint contractor_external_timesheets_status_check check (status in ('draft','reviewed','approved','closed'))
);

create index if not exists contractor_external_timesheets_contractor_period_idx
  on public.contractor_external_timesheets (contractor_id, period_year desc, period_month desc, created_at desc);

create table if not exists public.contractor_external_timesheet_workers (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.contractor_external_timesheets(id) on delete cascade,
  row_no integer not null default 1,
  worker_name text not null,
  iqama_no text,
  reported_days numeric(5,1) not null default 0,
  attendance jsonb not null default '{}'::jsonb,
  daily_rate numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_external_timesheet_workers_name_check check (char_length(btrim(worker_name)) >= 2),
  constraint contractor_external_timesheet_workers_days_check check (reported_days between 0 and 31),
  constraint contractor_external_timesheet_workers_rate_check check (daily_rate is null or daily_rate >= 0),
  constraint contractor_external_timesheet_workers_attendance_check check (jsonb_typeof(attendance) = 'object')
);

create index if not exists contractor_external_timesheet_workers_sheet_idx
  on public.contractor_external_timesheet_workers (timesheet_id, row_no, created_at);

alter table public.contractor_external_timesheets enable row level security;
alter table public.contractor_external_timesheet_workers enable row level security;

drop policy if exists contractor_external_timesheets_app_read on public.contractor_external_timesheets;
create policy contractor_external_timesheets_app_read on public.contractor_external_timesheets
  for select to authenticated
  using ((select public.current_app_role()) is not null);

drop policy if exists contractor_external_timesheets_app_insert on public.contractor_external_timesheets;
create policy contractor_external_timesheets_app_insert on public.contractor_external_timesheets
  for insert to authenticated
  with check ((select public.current_app_role()) is not null);

drop policy if exists contractor_external_timesheets_app_update on public.contractor_external_timesheets;
create policy contractor_external_timesheets_app_update on public.contractor_external_timesheets
  for update to authenticated
  using ((select public.current_app_role()) is not null)
  with check ((select public.current_app_role()) is not null);

drop policy if exists contractor_external_timesheets_app_delete on public.contractor_external_timesheets;
create policy contractor_external_timesheets_app_delete on public.contractor_external_timesheets
  for delete to authenticated
  using ((select public.current_app_role()) in ('ceo'::public.user_role,'hr'::public.user_role));

drop policy if exists contractor_external_timesheet_workers_app_read on public.contractor_external_timesheet_workers;
create policy contractor_external_timesheet_workers_app_read on public.contractor_external_timesheet_workers
  for select to authenticated
  using ((select public.current_app_role()) is not null);

drop policy if exists contractor_external_timesheet_workers_app_insert on public.contractor_external_timesheet_workers;
create policy contractor_external_timesheet_workers_app_insert on public.contractor_external_timesheet_workers
  for insert to authenticated
  with check ((select public.current_app_role()) is not null);

drop policy if exists contractor_external_timesheet_workers_app_update on public.contractor_external_timesheet_workers;
create policy contractor_external_timesheet_workers_app_update on public.contractor_external_timesheet_workers
  for update to authenticated
  using ((select public.current_app_role()) is not null)
  with check ((select public.current_app_role()) is not null);

drop policy if exists contractor_external_timesheet_workers_app_delete on public.contractor_external_timesheet_workers;
create policy contractor_external_timesheet_workers_app_delete on public.contractor_external_timesheet_workers
  for delete to authenticated
  using ((select public.current_app_role()) is not null);

revoke all on public.contractor_external_timesheets from anon;
revoke all on public.contractor_external_timesheet_workers from anon;
grant select,insert,update,delete on public.contractor_external_timesheets to authenticated;
grant select,insert,update,delete on public.contractor_external_timesheet_workers to authenticated;
grant all on public.contractor_external_timesheets to service_role;
grant all on public.contractor_external_timesheet_workers to service_role;

comment on table public.contractor_external_timesheets is 'تايم شيت شهري لخدمة مقاول خارجي؛ مستقل عن المشاريع الداخلية لأركان المكان.';
comment on column public.contractor_external_timesheet_workers.attendance is 'خريطة اليوم إلى القيمة: 1 يوم كامل، 0.5 نصف يوم، 0 غياب/غير محتسب.';
