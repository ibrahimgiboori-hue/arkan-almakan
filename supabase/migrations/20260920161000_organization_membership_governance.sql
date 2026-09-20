begin;

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert
on public.organizations for insert
to authenticated
with check (private.is_platform_admin());

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete
on public.organizations for delete
to authenticated
using (private.is_platform_admin());

drop policy if exists organization_memberships_insert on public.organization_memberships;
create policy organization_memberships_insert
on public.organization_memberships for insert
to authenticated
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id)='owner'
  or (
    private.org_membership_role(organization_id)='admin'
    and membership_role in ('manager','member','auditor')
  )
);

drop policy if exists organization_memberships_update on public.organization_memberships;
create policy organization_memberships_update
on public.organization_memberships for update
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id)='owner'
  or (
    private.org_membership_role(organization_id)='admin'
    and membership_role in ('manager','member','auditor')
  )
)
with check (
  private.is_platform_admin()
  or private.org_membership_role(organization_id)='owner'
  or (
    private.org_membership_role(organization_id)='admin'
    and membership_role in ('manager','member','auditor')
  )
);

drop policy if exists organization_memberships_delete on public.organization_memberships;
create policy organization_memberships_delete
on public.organization_memberships for delete
to authenticated
using (
  private.is_platform_admin()
  or private.org_membership_role(organization_id)='owner'
  or (
    private.org_membership_role(organization_id)='admin'
    and membership_role in ('manager','member','auditor')
  )
);

create or replace function private.guard_last_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_active_owner_count integer;
begin
  if tg_op='DELETE' then
    if old.membership_role='owner' and old.status='active' then
      select count(*) into v_active_owner_count
      from public.organization_memberships m
      where m.organization_id=old.organization_id
        and m.membership_role='owner'
        and m.status='active'
        and m.id<>old.id;
      if v_active_owner_count=0 then
        raise exception 'organization must retain at least one active owner'
          using errcode='23514';
      end if;
    end if;
    return old;
  end if;

  if tg_op='UPDATE'
     and old.membership_role='owner'
     and old.status='active'
     and (new.membership_role<>'owner' or new.status<>'active') then
    select count(*) into v_active_owner_count
    from public.organization_memberships m
    where m.organization_id=old.organization_id
      and m.membership_role='owner'
      and m.status='active'
      and m.id<>old.id;
    if v_active_owner_count=0 then
      raise exception 'organization must retain at least one active owner'
        using errcode='23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_last_organization_owner() from public, anon, authenticated;

drop trigger if exists trg_guard_last_organization_owner
on public.organization_memberships;

create trigger trg_guard_last_organization_owner
before update or delete on public.organization_memberships
for each row execute function private.guard_last_organization_owner();

revoke all on table public.organizations from authenticated;
grant select, insert, update, delete on table public.organizations to authenticated;

revoke all on table public.organization_memberships from authenticated;
grant select, insert, update, delete on table public.organization_memberships to authenticated;

commit;
