-- العرض الدلالي للتقرير مستقل عن هندسة الورقة.
-- البيانات تملك الحقيقة، تعريف التقرير يملك الاسم الافتراضي، وهذا الجدول يحفظ تعديلات العرض فقط.
create table if not exists public.print_presentation_overrides (
  id uuid primary key default gen_random_uuid(),
  document_key text not null unique,
  settings jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.print_presentation_overrides enable row level security;

revoke all on public.print_presentation_overrides from anon;
grant select, insert, update, delete on public.print_presentation_overrides to authenticated;
grant all on public.print_presentation_overrides to service_role;

drop policy if exists p_print_presentation_read on public.print_presentation_overrides;
create policy p_print_presentation_read
on public.print_presentation_overrides
for select
to authenticated
using (public.current_app_role() is not null);

drop policy if exists p_print_presentation_write on public.print_presentation_overrides;
create policy p_print_presentation_write
on public.print_presentation_overrides
for all
to authenticated
using (public.current_app_role() = any (array['ceo'::public.user_role, 'hr'::public.user_role, 'accountant'::public.user_role]))
with check (public.current_app_role() = any (array['ceo'::public.user_role, 'hr'::public.user_role, 'accountant'::public.user_role]));

create index if not exists ix_print_presentation_overrides_document
  on public.print_presentation_overrides(document_key);
