begin;

-- Organization listing remains membership-aware so the client can build a safe switcher.
-- Mutations, configuration and administration are bound to the active organization
-- to prevent accidental cross-company writes by users who belong to multiple tenants.

drop policy if exists organizations_update on public.organizations;
create policy organizations_update
on public.organizations for update
to authenticated
using (
  private.is_platform_admin()
  or (
    id=public.current_organization_id()
    and private.org_membership_role(id) in ('owner','admin')
  )
)
with check (
  private.is_platform_admin()
  or (
    id=public.current_organization_id()
    and private.org_membership_role(id) in ('owner','admin')
  )
);

drop policy if exists organization_memberships_select on public.organization_memberships;
create policy organization_memberships_select
on public.organization_memberships for select
to authenticated
using (
  user_id=(select auth.uid())
  or private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_memberships_insert on public.organization_memberships;
create policy organization_memberships_insert
on public.organization_memberships for insert
to authenticated
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and (
      private.org_membership_role(organization_id)='owner'
      or (
        private.org_membership_role(organization_id)='admin'
        and membership_role in ('manager','member','auditor')
      )
    )
  )
);

drop policy if exists organization_memberships_update on public.organization_memberships;
create policy organization_memberships_update
on public.organization_memberships for update
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and (
      private.org_membership_role(organization_id)='owner'
      or (
        private.org_membership_role(organization_id)='admin'
        and membership_role in ('manager','member','auditor')
      )
    )
  )
)
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and (
      private.org_membership_role(organization_id)='owner'
      or (
        private.org_membership_role(organization_id)='admin'
        and membership_role in ('manager','member','auditor')
      )
    )
  )
);

drop policy if exists organization_memberships_delete on public.organization_memberships;
create policy organization_memberships_delete
on public.organization_memberships for delete
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and (
      private.org_membership_role(organization_id)='owner'
      or (
        private.org_membership_role(organization_id)='admin'
        and membership_role in ('manager','member','auditor')
      )
    )
  )
);

drop policy if exists organization_modules_select on public.organization_modules;
create policy organization_modules_select
on public.organization_modules for select
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.has_active_org_membership(organization_id)
  )
);

drop policy if exists organization_modules_insert on public.organization_modules;
create policy organization_modules_insert
on public.organization_modules for insert
to authenticated
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_modules_update on public.organization_modules;
create policy organization_modules_update
on public.organization_modules for update
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
)
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_modules_delete on public.organization_modules;
create policy organization_modules_delete
on public.organization_modules for delete
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select
on public.organization_settings for select
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.has_active_org_membership(organization_id)
  )
);

drop policy if exists organization_settings_insert on public.organization_settings;
create policy organization_settings_insert
on public.organization_settings for insert
to authenticated
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_settings_update on public.organization_settings;
create policy organization_settings_update
on public.organization_settings for update
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
)
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_settings_delete on public.organization_settings;
create policy organization_settings_delete
on public.organization_settings for delete
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_feature_flags_select on public.organization_feature_flags;
create policy organization_feature_flags_select
on public.organization_feature_flags for select
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.has_active_org_membership(organization_id)
  )
);

drop policy if exists organization_feature_flags_insert on public.organization_feature_flags;
create policy organization_feature_flags_insert
on public.organization_feature_flags for insert
to authenticated
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_feature_flags_update on public.organization_feature_flags;
create policy organization_feature_flags_update
on public.organization_feature_flags for update
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
)
with check (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

drop policy if exists organization_feature_flags_delete on public.organization_feature_flags;
create policy organization_feature_flags_delete
on public.organization_feature_flags for delete
to authenticated
using (
  private.is_platform_admin()
  or (
    organization_id=public.current_organization_id()
    and private.org_membership_role(organization_id) in ('owner','admin')
  )
);

commit;
