alter table public.quotations
  add column if not exists show_arkan_representative boolean not null default true;

comment on column public.quotations.show_arkan_representative is
  'Controls whether the Arkan Al Makan approval representative card appears in quotation preview, PDF, and print.';

notify pgrst, 'reload schema';
