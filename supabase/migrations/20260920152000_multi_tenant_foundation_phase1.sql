begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text null,
  legal_name_ar text null,
  legal_name_en text null,
  country_code text not null default 'SA' check (char_length(country_code)=2),
  base_currency text not null default 'SAR' check (char_length(base_currency)=3),
  timezone text not null default 'Asia/Riyadh',
  default_locale text not null default 'ar-SA',
  status text not null default 'active'
    check (status in ('active','suspended','offboarding','archived')),
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null default 'member'
    check (membership_role in ('owner','admin','manager','member','auditor')),
  status text not null default 'active'
    check (status in ('invited','active','suspended','revoked')),
  is_default boolean not null default false,
  invited_by uuid null references auth.users(id),
  joined_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_org_memberships_user_active
  on public.organization_memberships(user_id, organization_id)
  where status='active';

create unique index if not exists ux_org_memberships_one_default
  on public.organization_memberships(user_id)
  where is_default and status='active';

create table if not exists public.platform_modules (
  module_key text primary key,
  name_ar text not null,
  name_en text not null,
  category text not null default 'module'
    check (category in ('core','module','optional','industry','ai')),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_modules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_key text not null references public.platform_modules(module_key) on delete restrict,
  status text not null default 'active'
    check (status in ('active','trial','disabled')),
  enabled_at timestamptz not null default now(),
  disabled_at timestamptz null,
  settings jsonb not null default '{}'::jsonb,
  primary key (organization_id, module_key)
);

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name_ar text null,
  company_name_en text null,
  cr_number text null,
  vat_number text null,
  national_address text null,
  city text null,
  phone_1 text null,
  phone_2 text null,
  email text null,
  website text null,
  color_primary text not null default '#8B3332',
  color_primary_dark text not null default '#7C2B28',
  color_primary_light text not null default '#B98C8E',
  color_text text not null default '#58595B',
  logo_path text null,
  letterhead_image_path text null,
  letterhead_page2_path text null,
  stamp_image_path text null,
  signature_image_path text null,
  header_image_path text null,
  footer_image_path text null,
  watermark_image_path text null,
  vat_rate numeric not null default 0.15 check (vat_rate >= 0 and vat_rate <= 1),
  timezone text not null default 'Asia/Riyadh',
  currency text not null default 'SAR' check (char_length(currency)=3),
  locale text not null default 'ar-SA',
  document_defaults jsonb not null default '{}'::jsonb,
  policy_defaults jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_feature_flags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_key)
);

create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  note text null,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from private.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active
  );
$$;

create or replace function private.has_active_org_membership(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.organization_memberships m
      join public.organizations o on o.id=m.organization_id
      where m.organization_id=p_organization_id
        and m.user_id=auth.uid()
        and m.status='active'
        and o.status='active'
    );
$$;

create or replace function private.org_membership_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select m.membership_role
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.organization_id=p_organization_id
    and m.user_id=auth.uid()
    and m.status='active'
    and o.status='active'
  limit 1;
$$;

create or replace function private.resolve_current_organization_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_requested_text text;
  v_requested uuid;
  v_result uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then return null; end if;
  begin
    v_requested_text := nullif(current_setting('request.headers', true)::jsonb ->> 'x-organization-id','');
    if v_requested_text is not null then v_requested := v_requested_text::uuid; end if;
  exception when others then
    v_requested := null;
    v_requested_text := null;
  end;

  if v_requested_text is not null then
    select m.organization_id into v_result
    from public.organization_memberships m
    join public.organizations o on o.id=m.organization_id
    where m.user_id=v_user
      and m.organization_id=v_requested
      and m.status='active'
      and o.status='active'
    limit 1;
    return v_result;
  end if;

  select m.organization_id into v_result
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=v_user
    and m.status='active'
    and o.status='active'
  order by m.is_default desc,m.created_at asc
  limit 1;
  return v_result;
end;
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.resolve_current_organization_id();
$$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;
revoke all on function private.has_active_org_membership(uuid) from public, anon, authenticated;
revoke all on function private.org_membership_role(uuid) from public, anon, authenticated;\nrevoke all on function private.resolve_current_organization_id() from public, anon, authenticated;
grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.has_active_org_membership(uuid) to authenticated, service_role;
grant execute on function private.org_membership_role(uuid) to authenticated, service_role;\ngrant execute on function private.resolve_current_organization_id() to authenticated, service_role;

revoke all on function public.current_organization_id() from public, anon;
grant execute on function public.current_organization_id() to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.platform_modules enable row level security;
alter table public.organization_modules enable row level security;
alter table public.organization_settings enable row level security;
alter table public.organization_feature_flags enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select
on public.organizations for select
to authenticated
using (private.has_active_org_membership(id) or private.is_platform_admin());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update
on public.organizations for update
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(id) in ('owner','admin')
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(id) in ('owner','admin')
);

drop policy if exists organization_memberships_select on public.organization_memberships;
create policy organization_memberships_select
on public.organization_memberships for select
to authenticated
using (
  user_id=auth.uid()
  or private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

drop policy if exists platform_modules_select on public.platform_modules;
create policy platform_modules_select
on public.platform_modules for select
to authenticated
using (is_active);

drop policy if exists organization_modules_select on public.organization_modules;
create policy organization_modules_select
on public.organization_modules for select
to authenticated
using (
  private.has_active_org_membership(organization_id)
  or private.is_platform_admin()
);

drop policy if exists organization_modules_manage on public.organization_modules;
create policy organization_modules_manage
on public.organization_modules for all
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select
on public.organization_settings for select
to authenticated
using (
  private.has_active_org_membership(organization_id)
  or private.is_platform_admin()
);

drop policy if exists organization_settings_manage on public.organization_settings;
create policy organization_settings_manage
on public.organization_settings for all
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

drop policy if exists organization_feature_flags_select on public.organization_feature_flags;
create policy organization_feature_flags_select
on public.organization_feature_flags for select
to authenticated
using (
  private.has_active_org_membership(organization_id)
  or private.is_platform_admin()
);

drop policy if exists organization_feature_flags_manage on public.organization_feature_flags;
create policy organization_feature_flags_manage
on public.organization_feature_flags for all
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_memberships from anon, authenticated;
revoke all on table public.platform_modules from anon, authenticated;
revoke all on table public.organization_modules from anon, authenticated;
revoke all on table public.organization_settings from anon, authenticated;
revoke all on table public.organization_feature_flags from anon, authenticated;

grant select, update on table public.organizations to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select on table public.platform_modules to authenticated;
grant select, insert, update, delete on table public.organization_modules to authenticated;
grant select, insert, update, delete on table public.organization_settings to authenticated;
grant select, insert, update, delete on table public.organization_feature_flags to authenticated;

grant all on table public.organizations to service_role;
grant all on table public.organization_memberships to service_role;
grant all on table public.platform_modules to service_role;
grant all on table public.organization_modules to service_role;
grant all on table public.organization_settings to service_role;
grant all on table public.organization_feature_flags to service_role;

insert into public.platform_modules(module_key,name_ar,name_en,category,sort_order)
values
  ('core','النواة','Core','core',10),
  ('hr','الموارد البشرية','HR','module',20),
  ('projects','المشاريع','Projects','module',30),
  ('finance_ops','العمليات المالية','Financial Operations','module',40),
  ('procurement','المشتريات','Procurement','module',50),
  ('inventory','المخزون والعهد','Inventory & Custody','module',60),
  ('documents','المستندات وسير العمل','Documents & Workflow','module',70),
  ('captain_ai','القبطان','Captain AI','ai',80)
on conflict (module_key) do update set
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  category=excluded.category,
  sort_order=excluded.sort_order,
  is_active=true;

insert into public.organizations(
  slug,name_ar,name_en,legal_name_ar,legal_name_en,country_code,base_currency,timezone,default_locale,status
)
values (
  'arkan-al-makan',
  'أركان المكان',
  'Arkan Al-Makan',
  'شركة أركان المكان للمقاولات',
  'Arkan Al Makan Contracting Company',
  'SA','SAR','Asia/Riyadh','ar-SA','active'
)
on conflict (slug) do nothing;

insert into public.organization_settings(
  organization_id,company_name_ar,company_name_en,city,timezone,currency,locale
)
select id,'شركة أركان المكان للمقاولات','Arkan Al Makan Contracting Company','الرياض','Asia/Riyadh','SAR','ar-SA'
from public.organizations
where slug='arkan-al-makan'
on conflict (organization_id) do nothing;

insert into public.organization_modules(organization_id,module_key,status)
select o.id,m.module_key,'active'
from public.organizations o
cross join public.platform_modules m
where o.slug='arkan-al-makan'
on conflict (organization_id,module_key) do nothing;

commit;
