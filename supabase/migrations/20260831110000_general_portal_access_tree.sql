-- General portal access tree.
-- The runtime never guesses portal membership from route names. Capability-to-portal
-- membership is registered once here and consumed by the central capability engine.

create table if not exists public.permission_portal_capabilities (
  portal_key text not null,
  capability_key text not null references public.permission_capabilities(capability_key) on delete cascade,
  group_key text null,
  feature_key text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (portal_key, capability_key),
  constraint permission_portal_capabilities_portal_ck
    check (portal_key in ('projects','workforce','finance','documents','admin'))
);

create index if not exists idx_permission_portal_capabilities_capability
  on public.permission_portal_capabilities(capability_key);

create table if not exists public.permission_portal_full_bundles (
  portal_key text primary key,
  bundle_id uuid not null unique references public.permission_bundles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint permission_portal_full_bundles_portal_ck
    check (portal_key in ('projects','workforce','finance','documents','admin'))
);

-- Full-portal bundles. Projects keeps its existing canonical bundle for backward compatibility.
insert into public.permission_bundles(
  id,bundle_key,name_ar,name_en,description_ar,is_system,is_active
)
values
  (gen_random_uuid(),'workforce_full_access','كامل بوابة الموارد البشرية','Full Workforce Portal','صلاحية وراثية لجميع وظائف بوابة الموارد البشرية الحالية والمستقبلية.',true,true),
  (gen_random_uuid(),'finance_full_access','كامل بوابة المالية','Full Finance Portal','صلاحية وراثية لجميع وظائف بوابة المالية الحالية والمستقبلية.',true,true),
  (gen_random_uuid(),'documents_full_access','كامل بوابة المستندات','Full Documents Portal','صلاحية وراثية لجميع وظائف بوابة المستندات الحالية والمستقبلية.',true,true),
  (gen_random_uuid(),'admin_full_access','كامل بوابة الإدارة','Full Admin Portal','صلاحية وراثية لجميع وظائف بوابة الإدارة الحالية والمستقبلية.',true,true)
on conflict (bundle_key) do update set
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  description_ar=excluded.description_ar,
  is_active=true,
  updated_at=now();

insert into public.permission_portal_full_bundles(portal_key,bundle_id)
select 'projects',id from public.permission_bundles where bundle_key='projects_full_access'
on conflict (portal_key) do update set bundle_id=excluded.bundle_id;

insert into public.permission_portal_full_bundles(portal_key,bundle_id)
select 'workforce',id from public.permission_bundles where bundle_key='workforce_full_access'
on conflict (portal_key) do update set bundle_id=excluded.bundle_id;

insert into public.permission_portal_full_bundles(portal_key,bundle_id)
select 'finance',id from public.permission_bundles where bundle_key='finance_full_access'
on conflict (portal_key) do update set bundle_id=excluded.bundle_id;

insert into public.permission_portal_full_bundles(portal_key,bundle_id)
select 'documents',id from public.permission_bundles where bundle_key='documents_full_access'
on conflict (portal_key) do update set bundle_id=excluded.bundle_id;

insert into public.permission_portal_full_bundles(portal_key,bundle_id)
select 'admin',id from public.permission_bundles where bundle_key='admin_full_access'
on conflict (portal_key) do update set bundle_id=excluded.bundle_id;

-- One-time canonical backfill. Prefix matching is deliberately confined to registration;
-- has_capability() below consumes the relation and never infers portal membership itself.
insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'projects',capability_key from public.permission_capabilities
where capability_key like 'projects.%'
on conflict do nothing;

insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'workforce',capability_key from public.permission_capabilities
where capability_key like 'hr.%'
on conflict do nothing;

insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'finance',capability_key from public.permission_capabilities
where capability_key like 'finance.%'
on conflict do nothing;

insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'documents',capability_key from public.permission_capabilities
where capability_key like 'documents.%'
on conflict do nothing;

insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'admin',capability_key from public.permission_capabilities
where capability_key like 'system.%'
on conflict do nothing;

-- Shared capabilities may appear in more than one portal.
insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'documents',capability_key from public.permission_capabilities
where capability_key in ('system.approvals.view')
on conflict do nothing;

insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'finance',capability_key from public.permission_capabilities
where capability_key in ('system.approvals.view')
on conflict do nothing;

insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'admin',capability_key from public.permission_capabilities
where capability_key in ('hr.organization.view')
on conflict do nothing;

-- New conventional capabilities register themselves automatically. Shared/non-conventional
-- membership remains an explicit additional row, so one capability can safely belong to
-- several portals without changing its key.
create or replace function public.register_default_capability_portal()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_portal text;
begin
  v_portal := case
    when new.capability_key like 'projects.%' then 'projects'
    when new.capability_key like 'hr.%' then 'workforce'
    when new.capability_key like 'finance.%' then 'finance'
    when new.capability_key like 'documents.%' then 'documents'
    when new.capability_key like 'system.%' then 'admin'
    else null
  end;

  if v_portal is not null then
    insert into public.permission_portal_capabilities(portal_key,capability_key)
    values(v_portal,new.capability_key)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_register_default_capability_portal on public.permission_capabilities;
create trigger trg_register_default_capability_portal
after insert or update of capability_key on public.permission_capabilities
for each row execute function public.register_default_capability_portal();

-- Generic full-portal inheritance replaces the projects-only wildcard special case.
create or replace function public.has_capability(
  p_capability text,
  p_scope_type text default 'all'::text,
  p_scope_key text default null::text,
  p_amount numeric default null::numeric
)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  with me as (
    select id,is_system_admin from public.app_users where id=auth.uid() and is_active
  ), applicable_override as (
    select o.effect,o.amount_limit
    from public.user_permission_overrides o
    where o.user_id=auth.uid() and o.capability_key=p_capability and o.is_active
      and (o.valid_from is null or o.valid_from<=now())
      and (o.valid_until is null or o.valid_until>=now())
      and (o.scope_type='all' or (o.scope_type=p_scope_type and (o.scope_key is null or o.scope_key=p_scope_key)))
    order by case when o.scope_type='all' then 1 else 0 end asc, o.granted_at desc
    limit 1
  ), bundle_grants as (
    select bc.amount_limit
    from public.user_permission_bundles ub
    join public.permission_bundle_capabilities bc on bc.bundle_id=ub.bundle_id
    join public.permission_bundles b on b.id=ub.bundle_id and b.is_active
    join public.permission_capabilities c on c.capability_key=bc.capability_key and c.is_active
    where ub.user_id=auth.uid() and ub.is_active and bc.capability_key=p_capability
      and (ub.valid_from is null or ub.valid_from<=now())
      and (ub.valid_until is null or ub.valid_until>=now())
      and (ub.scope_type='all' or (ub.scope_type=p_scope_type and (ub.scope_key is null or ub.scope_key=p_scope_key)))
  ), portal_grant as (
    select 1
    from public.user_permission_bundles ub
    join public.permission_bundles b on b.id=ub.bundle_id and b.is_active
    join public.permission_portal_full_bundles pb on pb.bundle_id=ub.bundle_id
    join public.permission_portal_capabilities pc
      on pc.portal_key=pb.portal_key and pc.capability_key=p_capability
    where ub.user_id=auth.uid() and ub.is_active
      and (ub.valid_from is null or ub.valid_from<=now())
      and (ub.valid_until is null or ub.valid_until>=now())
      and (ub.scope_type='all' or (ub.scope_type=p_scope_type and (ub.scope_key is null or ub.scope_key=p_scope_key)))
    limit 1
  )
  select public.fn_is_primary_user()
    or coalesce((select is_system_admin from me),false)
    or case
      when (select effect from applicable_override)='deny' then false
      when (select effect from applicable_override)='allow' then ((select amount_limit from applicable_override) is null or p_amount is null or p_amount <= (select amount_limit from applicable_override))
      when exists(select 1 from portal_grant) then true
      else exists(select 1 from bundle_grants where amount_limit is null or p_amount is null or p_amount<=amount_limit)
    end;
$$;

grant select on public.permission_portal_capabilities to authenticated;
grant select on public.permission_portal_full_bundles to authenticated;
