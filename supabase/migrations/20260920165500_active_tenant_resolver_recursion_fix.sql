begin;
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

revoke all on function private.resolve_current_organization_id()
from public,anon,authenticated;
grant execute on function private.resolve_current_organization_id()
to authenticated,service_role;
revoke all on function public.current_organization_id()
from public,anon;
grant execute on function public.current_organization_id()
to authenticated,service_role;
commit;
