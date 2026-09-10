-- External client payroll: salary is built from contractual components.
-- The reference net salary is derived, never keyed manually.
-- Employee social-insurance deduction is calculated only on basic + housing.

alter table public.hr_client_external_employee_profiles
  add column if not exists social_insurance_scheme text null;

alter table public.hr_external_payroll_lines
  add column if not exists gosi_employee_rate_override numeric(6,3) null,
  add column if not exists calculated_gross_salary numeric(14,2) null,
  add column if not exists calculated_contributory_wage numeric(14,2) null,
  add column if not exists calculated_gosi_employee_rate numeric(6,3) null,
  add column if not exists calculated_gosi_employee_deduction numeric(14,2) null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hr_client_external_employee_profiles_social_insurance_scheme_check'
  ) then
    alter table public.hr_client_external_employee_profiles
      add constraint hr_client_external_employee_profiles_social_insurance_scheme_check
      check (
        social_insurance_scheme is null
        or social_insurance_scheme in ('saudi_legacy','saudi_new','non_saudi','manual')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hr_external_payroll_lines_gosi_employee_rate_override_check'
  ) then
    alter table public.hr_external_payroll_lines
      add constraint hr_external_payroll_lines_gosi_employee_rate_override_check
      check (
        gosi_employee_rate_override is null
        or (gosi_employee_rate_override >= 0 and gosi_employee_rate_override <= 100)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'hr_external_payroll_lines_gosi_calculated_values_check'
  ) then
    alter table public.hr_external_payroll_lines
      add constraint hr_external_payroll_lines_gosi_calculated_values_check
      check (
        (calculated_gross_salary is null or calculated_gross_salary >= 0)
        and (calculated_contributory_wage is null or calculated_contributory_wage >= 0)
        and (calculated_gosi_employee_rate is null or (calculated_gosi_employee_rate >= 0 and calculated_gosi_employee_rate <= 100))
        and (calculated_gosi_employee_deduction is null or calculated_gosi_employee_deduction >= 0)
      );
  end if;
end $$;

comment on column public.hr_external_payroll_lines.reference_net_salary is
  'Derived reference net salary: basic + housing + transport + other allowances - employee GOSI deduction. Not a manual input.';
comment on column public.hr_external_payroll_lines.calculated_contributory_wage is
  'GOSI contributory wage used by payroll: basic salary + housing allowance, capped according to the calculation engine.';
comment on column public.hr_external_payroll_lines.calculated_gosi_employee_deduction is
  'Employee-borne social-insurance deduction only; employer-borne occupational hazards are not deducted from employee pay.';
