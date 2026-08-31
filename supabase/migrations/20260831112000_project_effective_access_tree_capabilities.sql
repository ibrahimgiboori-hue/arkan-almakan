-- v_my_capabilities is the projection consumed by the shell and project navigation.
-- Include explicit bundles, inherited full-portal grants and per-capability overrides so
-- the UI and the database authorization engine read the same permission truth.
create or replace view public.v_my_capabilities
with (security_invoker=true)
as
with candidates as (
  select
    c.capability_key,
    c.module_key,
    c.module_label_ar,
    c.resource_key,
    c.resource_label_ar,
    c.action_key,
    a.label_ar as action_label_ar,
    ub.scope_type,
    ub.scope_key,
    bc.amount_limit,
    ub.valid_from,
    ub.valid_until,
    'bundle'::text as source_type,
    b.bundle_key as source_key
  from public.user_permission_bundles ub
  join public.permission_bundles b on b.id=ub.bundle_id and b.is_active
  join public.permission_bundle_capabilities bc on bc.bundle_id=b.id
  join public.permission_capabilities c on c.capability_key=bc.capability_key and c.is_active
  join public.permission_actions a on a.action_key=c.action_key and a.is_active
  where ub.user_id=auth.uid()
    and ub.is_active
    and (ub.valid_from is null or ub.valid_from<=now())
    and (ub.valid_until is null or ub.valid_until>=now())

  union all

  select
    c.capability_key,
    c.module_key,
    c.module_label_ar,
    c.resource_key,
    c.resource_label_ar,
    c.action_key,
    a.label_ar as action_label_ar,
    ub.scope_type,
    ub.scope_key,
    null::numeric as amount_limit,
    ub.valid_from,
    ub.valid_until,
    'portal'::text as source_type,
    b.bundle_key as source_key
  from public.user_permission_bundles ub
  join public.permission_bundles b on b.id=ub.bundle_id and b.is_active
  join public.permission_portal_full_bundles pb on pb.bundle_id=ub.bundle_id
  join public.permission_portal_capabilities pc on pc.portal_key=pb.portal_key
  join public.permission_capabilities c on c.capability_key=pc.capability_key and c.is_active
  join public.permission_actions a on a.action_key=c.action_key and a.is_active
  where ub.user_id=auth.uid()
    and ub.is_active
    and (ub.valid_from is null or ub.valid_from<=now())
    and (ub.valid_until is null or ub.valid_until>=now())

  union all

  select
    c.capability_key,
    c.module_key,
    c.module_label_ar,
    c.resource_key,
    c.resource_label_ar,
    c.action_key,
    a.label_ar as action_label_ar,
    o.scope_type,
    o.scope_key,
    o.amount_limit,
    o.valid_from,
    o.valid_until,
    'override'::text as source_type,
    'allow'::text as source_key
  from public.user_permission_overrides o
  join public.permission_capabilities c on c.capability_key=o.capability_key and c.is_active
  join public.permission_actions a on a.action_key=c.action_key and a.is_active
  where o.user_id=auth.uid()
    and o.is_active
    and o.effect='allow'
    and (o.valid_from is null or o.valid_from<=now())
    and (o.valid_until is null or o.valid_until>=now())
), effective as (
  select c.*
  from candidates c
  where coalesce((
    select o.effect
    from public.user_permission_overrides o
    where o.user_id=auth.uid()
      and o.capability_key=c.capability_key
      and o.is_active
      and (o.valid_from is null or o.valid_from<=now())
      and (o.valid_until is null or o.valid_until>=now())
      and (
        o.scope_type='all'
        or (o.scope_type=c.scope_type and (o.scope_key is null or o.scope_key=c.scope_key))
      )
    order by case when o.scope_type='all' then 1 else 0 end asc, o.granted_at desc
    limit 1
  ),'allow') <> 'deny'
)
select distinct
  capability_key,module_key,module_label_ar,resource_key,resource_label_ar,action_key,
  action_label_ar,scope_type,scope_key,amount_limit,valid_from,valid_until,source_type,source_key
from effective;

revoke all on public.v_my_capabilities from anon;
revoke all on public.v_my_capabilities from authenticated;
grant select on public.v_my_capabilities to authenticated;
grant select on public.v_my_capabilities to service_role;
