alter table public.hr_external_payroll_batches
  add column if not exists finalized_by uuid null references auth.users(id),
  add column if not exists finalized_at timestamptz null;

alter table public.hr_external_payroll_lines
  add column if not exists calculated_divisor_days integer null,
  add column if not exists calculated_day_hours numeric(6,2) null,
  add column if not exists calculated_day_value numeric(14,4) null,
  add column if not exists calculated_hour_value numeric(14,4) null,
  add column if not exists calculated_absence_days integer not null default 0,
  add column if not exists calculated_missing_punch_days integer not null default 0,
  add column if not exists calculated_missing_in_count integer not null default 0,
  add column if not exists calculated_missing_out_count integer not null default 0,
  add column if not exists calculated_extra_minutes integer not null default 0,
  add column if not exists calculated_short_minutes integer not null default 0,
  add column if not exists calculated_net_minutes integer not null default 0,
  add column if not exists calculated_absence_amount numeric(14,2) not null default 0,
  add column if not exists calculated_missing_punch_amount numeric(14,2) not null default 0,
  add column if not exists calculated_time_amount numeric(14,2) not null default 0,
  add column if not exists calculated_total_additions numeric(14,2) not null default 0,
  add column if not exists calculated_total_deductions numeric(14,2) not null default 0,
  add column if not exists calculated_final_net_salary numeric(14,2) null,
  add column if not exists calculation_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists calculated_at timestamptz null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='hr_external_payroll_lines_calculated_divisor_days_check') then
    alter table public.hr_external_payroll_lines add constraint hr_external_payroll_lines_calculated_divisor_days_check check (calculated_divisor_days is null or calculated_divisor_days > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='hr_external_payroll_lines_calculated_day_hours_check') then
    alter table public.hr_external_payroll_lines add constraint hr_external_payroll_lines_calculated_day_hours_check check (calculated_day_hours is null or calculated_day_hours > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='hr_external_payroll_lines_calculated_counts_check') then
    alter table public.hr_external_payroll_lines add constraint hr_external_payroll_lines_calculated_counts_check check (
      calculated_absence_days >= 0 and calculated_missing_punch_days >= 0 and calculated_missing_in_count >= 0 and calculated_missing_out_count >= 0 and calculated_extra_minutes >= 0 and calculated_short_minutes >= 0
    );
  end if;
end $$;

create index if not exists idx_hr_external_payroll_lines_calculated
  on public.hr_external_payroll_lines(payroll_batch_id, calculated_at);
