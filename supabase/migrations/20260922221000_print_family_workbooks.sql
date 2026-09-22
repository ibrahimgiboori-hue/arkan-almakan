-- Excel-owned print family workbook storage.
-- The workbook itself is the design source of truth. Uploading a new version must not rewrite its design.

create table if not exists public.print_family_workbooks (
  family_id text primary key,
  storage_path text not null,
  original_name text,
  version integer not null default 1 check (version >= 1),
  model_sheets jsonb not null default '[]'::jsonb,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.print_family_workbooks enable row level security;

drop policy if exists print_family_workbooks_read on public.print_family_workbooks;
create policy print_family_workbooks_read
on public.print_family_workbooks
for select
to authenticated
using (fn_is_primary_user());

drop policy if exists print_family_workbooks_insert on public.print_family_workbooks;
create policy print_family_workbooks_insert
on public.print_family_workbooks
for insert
to authenticated
with check (fn_is_primary_user());

drop policy if exists print_family_workbooks_update on public.print_family_workbooks;
create policy print_family_workbooks_update
on public.print_family_workbooks
for update
to authenticated
using (fn_is_primary_user())
with check (fn_is_primary_user());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'print-families',
  'print-families',
  false,
  52428800,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists print_family_storage_read on storage.objects;
create policy print_family_storage_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'print-families'
  and fn_is_primary_user()
);

drop policy if exists print_family_storage_insert on storage.objects;
create policy print_family_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'print-families'
  and fn_is_primary_user()
);

drop policy if exists print_family_storage_update on storage.objects;
create policy print_family_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'print-families'
  and fn_is_primary_user()
)
with check (
  bucket_id = 'print-families'
  and fn_is_primary_user()
);

drop policy if exists print_family_storage_delete on storage.objects;
create policy print_family_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'print-families'
  and fn_is_primary_user()
);
