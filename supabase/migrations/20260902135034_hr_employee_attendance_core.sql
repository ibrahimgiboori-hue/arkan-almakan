create table if not exists public.hr_attendance_settings (
  id smallint primary key default 1 check (id = 1),
  timezone text not null default 'Asia/Riyadh',
  weekly_off_days smallint[] not null default array[5]::smallint[],
  missing_punch_deduction_days numeric(5,2) not null default 0.25 check (missing_punch_deduction_days >= 0),
  absence_deduction_days numeric(5,2) not null default 1.00 check (absence_deduction_days >= 0),
  analysis_version text not null default '1.0.0',
  updated_by uuid null references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.hr_attendance_settings(id)
values (1)
on conflict (id) do nothing;

create table if not exists public.hr_employee_work_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  name text not null default 'الدوام الأساسي',
  valid_from date not null,
  valid_to date null,
  timezone text not null default 'Asia/Riyadh',
  is_active boolean not null default true,
  notes text null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index if not exists idx_hr_work_schedules_employee_dates
  on public.hr_employee_work_schedules(employee_id, valid_from, valid_to);

create table if not exists public.hr_employee_work_schedule_days (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.hr_employee_work_schedules(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_workday boolean not null default true,
  start_time time null,
  end_time time null,
  notes text null,
  unique(schedule_id, weekday),
  check ((not is_workday) or (start_time is not null and end_time is not null))
);

create table if not exists public.hr_attendance_imports (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_file_size bigint null,
  source_file_hash text null,
  period_from date null,
  period_to date null,
  parser_version text not null default '1.0.0',
  status text not null default 'uploaded' check (status in ('uploaded','parsed','analyzed','failed','superseded')),
  rows_received integer not null default 0,
  matched_punches integer not null default 0,
  unmatched_punches integer not null default 0,
  notes text null,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  uploaded_at timestamptz not null default now(),
  analyzed_at timestamptz null
);

create index if not exists idx_hr_attendance_imports_period
  on public.hr_attendance_imports(period_from, period_to, uploaded_at desc);

create table if not exists public.hr_attendance_punches (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.hr_attendance_imports(id) on delete cascade,
  employee_id uuid null references public.employees(id) on delete set null,
  external_employee_no text null,
  external_employee_name text null,
  punch_local timestamp without time zone not null,
  punch_date date generated always as (punch_local::date) stored,
  source_sheet text null,
  source_row integer null,
  raw_payload jsonb not null default '{}'::jsonb,
  match_method text null check (match_method is null or match_method in ('employee_no','name','manual','unmatched')),
  created_at timestamptz not null default now(),
  unique(import_id, source_sheet, source_row, punch_local)
);

create index if not exists idx_hr_attendance_punches_employee_date
  on public.hr_attendance_punches(employee_id, punch_date, punch_local);
create index if not exists idx_hr_attendance_punches_import
  on public.hr_attendance_punches(import_id);

create table if not exists public.hr_attendance_days (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.hr_attendance_imports(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  schedule_id uuid null references public.hr_employee_work_schedules(id) on delete set null,
  scheduled_start timestamp without time zone null,
  scheduled_end timestamp without time zone null,
  check_in timestamp without time zone null,
  check_out timestamp without time zone null,
  worked_minutes integer null,
  arrival_delta_minutes integer null,
  departure_delta_minutes integer null,
  raw_punch_count integer not null default 0,
  day_status text not null check (day_status in ('complete','missing_in','missing_out','absent','day_off','no_schedule','needs_review')),
  preliminary_deduction_days numeric(5,2) not null default 0,
  analysis_note text null,
  analysis_version text not null default '1.0.0',
  analyzed_at timestamptz not null default now(),
  unique(import_id, employee_id, work_date)
);

create index if not exists idx_hr_attendance_days_employee_date
  on public.hr_attendance_days(employee_id, work_date);
create index if not exists idx_hr_attendance_days_status
  on public.hr_attendance_days(day_status, work_date);

create table if not exists public.hr_attendance_justifications (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null references public.hr_attendance_days(id) on delete cascade,
  issue_kind text not null check (issue_kind in ('missing_in','missing_out','absence','late_arrival','early_departure','other')),
  justification_text text not null,
  paper_reference text null,
  paper_approved_on date null,
  decision text not null default 'pending' check (decision in ('pending','accepted','rejected')),
  decision_note text null,
  submitted_by uuid null references auth.users(id),
  submitted_at timestamptz not null default now(),
  decided_by uuid null references auth.users(id),
  decided_at timestamptz null,
  unique(attendance_day_id, issue_kind)
);

create or replace view public.v_hr_attendance_days
with (security_invoker = true)
as
select
  d.*,
  e.employee_no,
  e.full_name_ar as employee_name,
  case when d.day_status = 'complete' and coalesce(d.arrival_delta_minutes,0) < 0 then abs(d.arrival_delta_minutes) else 0 end as early_arrival_minutes,
  case when d.day_status = 'complete' and coalesce(d.arrival_delta_minutes,0) > 0 then d.arrival_delta_minutes else 0 end as late_arrival_minutes,
  case when d.day_status = 'complete' and coalesce(d.departure_delta_minutes,0) < 0 then abs(d.departure_delta_minutes) else 0 end as early_departure_minutes,
  case when d.day_status = 'complete' and coalesce(d.departure_delta_minutes,0) > 0 then d.departure_delta_minutes else 0 end as late_departure_minutes,
  j.decision as justification_decision,
  j.justification_text,
  j.paper_reference,
  case when j.decision = 'accepted' then 0::numeric else d.preliminary_deduction_days end as final_deduction_days
from public.hr_attendance_days d
join public.employees e on e.id = d.employee_id
left join lateral (
  select x.decision, x.justification_text, x.paper_reference
  from public.hr_attendance_justifications x
  where x.attendance_day_id = d.id
    and x.issue_kind = case d.day_status
      when 'missing_in' then 'missing_in'
      when 'missing_out' then 'missing_out'
      when 'absent' then 'absence'
      else 'other'
    end
  order by x.submitted_at desc
  limit 1
) j on true;

insert into public.permission_capabilities(
  capability_key,module_key,module_label_ar,resource_key,resource_label_ar,action_key,description_ar,risk_level,is_active
) values
  ('hr.attendance.view','hr','الموارد البشرية','attendance','الحضور والانصراف','view','عرض سجل حضور وانصراف الموظفين',0,true),
  ('hr.attendance.import','hr','الموارد البشرية','attendance','الحضور والانصراف','create','رفع ملفات البصمة وتحليلها',1,true),
  ('hr.attendance.schedule','hr','الموارد البشرية','attendance','الحضور والانصراف','configure','إدارة روتين دوام الموظفين',2,true),
  ('hr.attendance.review','hr','الموارد البشرية','attendance','الحضور والانصراف','review','تسجيل ومراجعة تبريرات مخالفات الحضور',2,true)
on conflict (capability_key) do update set
  module_key=excluded.module_key,
  module_label_ar=excluded.module_label_ar,
  resource_key=excluded.resource_key,
  resource_label_ar=excluded.resource_label_ar,
  action_key=excluded.action_key,
  description_ar=excluded.description_ar,
  risk_level=excluded.risk_level,
  is_active=true;

insert into public.permission_bundle_capabilities(bundle_id, capability_key)
select b.id, c.capability_key
from public.permission_bundles b
cross join (values
  ('hr.attendance.view'),('hr.attendance.import'),('hr.attendance.schedule'),('hr.attendance.review')
) as c(capability_key)
where b.bundle_key in ('hr_full_access','hr_officer')
on conflict do nothing;

alter table public.hr_attendance_settings enable row level security;
alter table public.hr_employee_work_schedules enable row level security;
alter table public.hr_employee_work_schedule_days enable row level security;
alter table public.hr_attendance_imports enable row level security;
alter table public.hr_attendance_punches enable row level security;
alter table public.hr_attendance_days enable row level security;
alter table public.hr_attendance_justifications enable row level security;

grant select on public.hr_attendance_settings, public.hr_employee_work_schedules, public.hr_employee_work_schedule_days,
  public.hr_attendance_imports, public.hr_attendance_punches, public.hr_attendance_days, public.hr_attendance_justifications,
  public.v_hr_attendance_days to authenticated;
grant insert, update, delete on public.hr_employee_work_schedules, public.hr_employee_work_schedule_days to authenticated;
grant insert, update on public.hr_attendance_imports to authenticated;
grant insert, update, delete on public.hr_attendance_punches, public.hr_attendance_days to authenticated;
grant insert, update on public.hr_attendance_justifications to authenticated;

drop policy if exists hr_attendance_settings_select on public.hr_attendance_settings;
create policy hr_attendance_settings_select on public.hr_attendance_settings for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view'));
drop policy if exists hr_attendance_settings_update on public.hr_attendance_settings;
create policy hr_attendance_settings_update on public.hr_attendance_settings for update to authenticated
using (public.fn_is_primary_user()) with check (public.fn_is_primary_user());

drop policy if exists hr_work_schedules_select on public.hr_employee_work_schedules;
create policy hr_work_schedules_select on public.hr_employee_work_schedules for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view'));
drop policy if exists hr_work_schedules_write on public.hr_employee_work_schedules;
create policy hr_work_schedules_write on public.hr_employee_work_schedules for all to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.schedule'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.schedule'));

drop policy if exists hr_work_schedule_days_select on public.hr_employee_work_schedule_days;
create policy hr_work_schedule_days_select on public.hr_employee_work_schedule_days for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view'));
drop policy if exists hr_work_schedule_days_write on public.hr_employee_work_schedule_days;
create policy hr_work_schedule_days_write on public.hr_employee_work_schedule_days for all to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.schedule'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.schedule'));

drop policy if exists hr_attendance_imports_select on public.hr_attendance_imports;
create policy hr_attendance_imports_select on public.hr_attendance_imports for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view'));
drop policy if exists hr_attendance_imports_insert on public.hr_attendance_imports;
create policy hr_attendance_imports_insert on public.hr_attendance_imports for insert to authenticated
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.import'));
drop policy if exists hr_attendance_imports_update on public.hr_attendance_imports;
create policy hr_attendance_imports_update on public.hr_attendance_imports for update to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.import'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.import'));

drop policy if exists hr_attendance_punches_select on public.hr_attendance_punches;
create policy hr_attendance_punches_select on public.hr_attendance_punches for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view'));
drop policy if exists hr_attendance_punches_write on public.hr_attendance_punches;
create policy hr_attendance_punches_write on public.hr_attendance_punches for all to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.import'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.import'));

drop policy if exists hr_attendance_days_select on public.hr_attendance_days;
create policy hr_attendance_days_select on public.hr_attendance_days for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view'));
drop policy if exists hr_attendance_days_write on public.hr_attendance_days;
create policy hr_attendance_days_write on public.hr_attendance_days for all to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.import'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.import'));

drop policy if exists hr_attendance_justifications_select on public.hr_attendance_justifications;
create policy hr_attendance_justifications_select on public.hr_attendance_justifications for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view'));
drop policy if exists hr_attendance_justifications_insert on public.hr_attendance_justifications;
create policy hr_attendance_justifications_insert on public.hr_attendance_justifications for insert to authenticated
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.review'));
drop policy if exists hr_attendance_justifications_update on public.hr_attendance_justifications;
create policy hr_attendance_justifications_update on public.hr_attendance_justifications for update to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.review'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.review'));
