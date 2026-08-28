alter table public.quotations
  add column if not exists client_representative_name text,
  add column if not exists client_representative_title text,
  add column if not exists arkan_signatory_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists arkan_signatory_name text,
  add column if not exists arkan_signatory_title text;

comment on column public.quotations.client_representative_name is 'Representative name used when quotation client_kind is entity.';
comment on column public.quotations.client_representative_title is 'Representative position/capacity used in paper approval.';
comment on column public.quotations.arkan_signatory_employee_id is 'Optional employee selected as Arkan signatory; printed name/title remain snapshot fields on the quotation.';
comment on column public.quotations.arkan_signatory_name is 'Arkan signatory display name snapshot or manually entered name.';
comment on column public.quotations.arkan_signatory_title is 'Arkan signatory position/capacity snapshot or manually entered title.';
