alter table public.print_family_workbooks
  add column if not exists ui_schema jsonb not null default '{}'::jsonb,
  add column if not exists schema_version integer not null default 1;

alter table public.quotations
  add column if not exists print_model_sheet text;

drop policy if exists print_family_workbooks_read on public.print_family_workbooks;
create policy print_family_workbooks_read
on public.print_family_workbooks
for select
to authenticated
using (fn_is_primary_user() or current_app_role() is not null);

drop policy if exists print_family_storage_read on storage.objects;
create policy print_family_storage_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'print-families'
  and (fn_is_primary_user() or current_app_role() is not null)
);
