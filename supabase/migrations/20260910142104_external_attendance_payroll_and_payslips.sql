create table if not exists public.hr_external_payroll_batches (
  id uuid primary key default gen_random_uuid(),
  attendance_import_id uuid not null unique references public.hr_attendance_imports(id) on delete cascade,
  client_key text not null,
  divisor_policy text not null default 'thirty' check (divisor_policy in ('thirty','calendar_days')),
  positive_time_policy text not null default 'pay_net' check (positive_time_policy in ('pay_net','offset_only')),
  missing_punch_deduction_days numeric(6,3) not null default 0 check (missing_punch_deduction_days >= 0),
  default_payment_method text null check (default_payment_method is null or default_payment_method in ('mudad_wps','bank_transfer','cash')),
  client_letterhead_path text null,
  status text not null default 'draft' check (status in ('draft','calculated','final')),
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_external_payroll_batches_client
  on public.hr_external_payroll_batches(client_key, created_at desc);

create table if not exists public.hr_client_external_employee_profiles (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  source_employee_key text not null,
  source_employee_no text null,
  source_employee_name text null,
  display_employee_no text null,
  display_name text not null,
  job_title text null,
  identity_no text null,
  default_payment_method text null check (default_payment_method is null or default_payment_method in ('mudad_wps','bank_transfer','cash')),
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_key, source_employee_key)
);

create index if not exists idx_hr_client_external_employee_profiles_client
  on public.hr_client_external_employee_profiles(client_key, display_name);

create table if not exists public.hr_external_payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_batch_id uuid not null references public.hr_external_payroll_batches(id) on delete cascade,
  external_person_id uuid null references public.hr_attendance_external_people(id) on delete set null,
  source_employee_key text not null,
  reference_net_salary numeric(14,2) null check (reference_net_salary is null or reference_net_salary >= 0),
  basic_salary numeric(14,2) null check (basic_salary is null or basic_salary >= 0),
  housing_allowance numeric(14,2) null check (housing_allowance is null or housing_allowance >= 0),
  transport_allowance numeric(14,2) null check (transport_allowance is null or transport_allowance >= 0),
  other_allowances numeric(14,2) null check (other_allowances is null or other_allowances >= 0),
  manual_additions numeric(14,2) not null default 0 check (manual_additions >= 0),
  manual_additions_reason text null,
  manual_deductions numeric(14,2) not null default 0 check (manual_deductions >= 0),
  manual_deductions_reason text null,
  payment_method text null check (payment_method is null or payment_method in ('mudad_wps','bank_transfer','cash')),
  day_hours_override numeric(6,2) null check (day_hours_override is null or day_hours_override > 0),
  show_job_title boolean not null default false,
  show_identity boolean not null default false,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_batch_id, source_employee_key)
);

create index if not exists idx_hr_external_payroll_lines_batch
  on public.hr_external_payroll_lines(payroll_batch_id);

insert into public.permission_capabilities(
  capability_key,module_key,module_label_ar,resource_key,resource_label_ar,action_key,description_ar,risk_level,is_active
) values
  ('hr.attendance.payroll','hr','الموارد البشرية','attendance_payroll','معالجة رواتب عميل الحضور','edit','معالجة الأثر المالي للحضور وإصدار مسيرات الرواتب الفردية',2,true)
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
select b.id, 'hr.attendance.payroll'
from public.permission_bundles b
where b.bundle_key in ('hr_full_access','hr_officer')
on conflict do nothing;

alter table public.hr_external_payroll_batches enable row level security;
alter table public.hr_client_external_employee_profiles enable row level security;
alter table public.hr_external_payroll_lines enable row level security;

grant select, insert, update, delete on public.hr_external_payroll_batches to authenticated;
grant select, insert, update, delete on public.hr_client_external_employee_profiles to authenticated;
grant select, insert, update, delete on public.hr_external_payroll_lines to authenticated;

drop policy if exists hr_external_payroll_batches_select on public.hr_external_payroll_batches;
create policy hr_external_payroll_batches_select on public.hr_external_payroll_batches for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view') or public.has_any_capability('hr.attendance.payroll'));

drop policy if exists hr_external_payroll_batches_write on public.hr_external_payroll_batches;
create policy hr_external_payroll_batches_write on public.hr_external_payroll_batches for all to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'));

drop policy if exists hr_client_external_employee_profiles_select on public.hr_client_external_employee_profiles;
create policy hr_client_external_employee_profiles_select on public.hr_client_external_employee_profiles for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view') or public.has_any_capability('hr.attendance.payroll'));

drop policy if exists hr_client_external_employee_profiles_write on public.hr_client_external_employee_profiles;
create policy hr_client_external_employee_profiles_write on public.hr_client_external_employee_profiles for all to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'));

drop policy if exists hr_external_payroll_lines_select on public.hr_external_payroll_lines;
create policy hr_external_payroll_lines_select on public.hr_external_payroll_lines for select to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.view') or public.has_any_capability('hr.attendance.payroll'));

drop policy if exists hr_external_payroll_lines_write on public.hr_external_payroll_lines;
create policy hr_external_payroll_lines_write on public.hr_external_payroll_lines for all to authenticated
using (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'))
with check (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'));
