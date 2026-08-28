alter table public.quotations
  add column if not exists client_kind text not null default 'entity';

alter table public.quotations
  drop constraint if exists quotations_client_kind_check;

alter table public.quotations
  add constraint quotations_client_kind_check
  check (client_kind in ('entity','individual'));

comment on column public.quotations.client_kind is
  'Quotation client type: entity for companies/organizations, individual for natural persons.';
