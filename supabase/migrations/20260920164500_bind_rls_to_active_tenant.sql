begin;

create or replace function private.has_tenant_data_access(
  p_organization_id uuid,
  p_module_key text default 'core'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select p_organization_id=public.current_organization_id()
    and private.has_active_org_membership(p_organization_id)
    and exists (
      select 1
      from public.organization_modules core
      where core.organization_id=p_organization_id
        and core.module_key='core'
        and core.status in ('active','trial')
    )
    and (
      p_module_key='core'
      or exists (
        select 1
        from public.organization_modules m
        where m.organization_id=p_organization_id
          and m.module_key=p_module_key
          and m.status in ('active','trial')
      )
    );
$$;

revoke all on function private.has_tenant_data_access(uuid,text)
from public,anon,authenticated;
grant execute on function private.has_tenant_data_access(uuid,text)
to authenticated,service_role;

commit;
