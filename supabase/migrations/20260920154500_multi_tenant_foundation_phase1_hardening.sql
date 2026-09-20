begin;

create index if not exists idx_organizations_created_by
  on public.organizations(created_by)
  where created_by is not null;

create index if not exists idx_org_memberships_invited_by
  on public.organization_memberships(invited_by)
  where invited_by is not null;

create index if not exists idx_organization_modules_module_key
  on public.organization_modules(module_key);

drop policy if exists organization_memberships_select on public.organization_memberships;
create policy organization_memberships_select
on public.organization_memberships for select
to authenticated
using (
  user_id=(select auth.uid())
  or private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

drop policy if exists organization_modules_manage on public.organization_modules;
drop policy if exists organization_modules_insert on public.organization_modules;
drop policy if exists organization_modules_update on public.organization_modules;
drop policy if exists organization_modules_delete on public.organization_modules;

create policy organization_modules_insert
on public.organization_modules for insert
to authenticated
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

create policy organization_modules_update
on public.organization_modules for update
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

create policy organization_modules_delete
on public.organization_modules for delete
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

drop policy if exists organization_settings_manage on public.organization_settings;
drop policy if exists organization_settings_insert on public.organization_settings;
drop policy if exists organization_settings_update on public.organization_settings;
drop policy if exists organization_settings_delete on public.organization_settings;

create policy organization_settings_insert
on public.organization_settings for insert
to authenticated
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

create policy organization_settings_update
on public.organization_settings for update
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

create policy organization_settings_delete
on public.organization_settings for delete
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

drop policy if exists organization_feature_flags_manage on public.organization_feature_flags;
drop policy if exists organization_feature_flags_insert on public.organization_feature_flags;
drop policy if exists organization_feature_flags_update on public.organization_feature_flags;
drop policy if exists organization_feature_flags_delete on public.organization_feature_flags;

create policy organization_feature_flags_insert
on public.organization_feature_flags for insert
to authenticated
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

create policy organization_feature_flags_update
on public.organization_feature_flags for update
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

create policy organization_feature_flags_delete
on public.organization_feature_flags for delete
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id) in ('owner','admin')
);

commit;
