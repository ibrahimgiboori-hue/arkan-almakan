alter table public.hr_client_external_employee_profiles
  add column if not exists nationality_category text,
  add column if not exists social_insurance_active boolean not null default false;

update public.hr_client_external_employee_profiles
set nationality_category = case
  when social_insurance_scheme in ('saudi_legacy','saudi_new') then 'saudi'
  when social_insurance_scheme = 'non_saudi' then 'non_saudi'
  when social_insurance_scheme = 'manual' then 'gcc'
  else nationality_category
end
where nationality_category is null;

update public.hr_client_external_employee_profiles
set social_insurance_active = true
where social_insurance_scheme is not null
  and social_insurance_active = false;

alter table public.hr_client_external_employee_profiles
  drop constraint if exists hr_client_external_employee_profiles_nationality_category_check;

alter table public.hr_client_external_employee_profiles
  add constraint hr_client_external_employee_profiles_nationality_category_check
  check (nationality_category is null or nationality_category in ('saudi','non_saudi','gcc'));
