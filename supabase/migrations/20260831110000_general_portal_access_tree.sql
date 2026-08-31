-- General portal access tree.
-- One canonical permission engine: portal -> group -> resource -> action -> scope.

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

-- Canonical membership uses permission_capabilities.module_key, not route names or UI guesses.
insert into public.permission_portal_capabilities(portal_key,capability_key)
select case module_key
  when 'projects' then 'projects'
  when 'hr' then 'workforce'
  when 'finance' then 'finance'
  when 'documents' then 'documents'
  when 'system' then 'admin'
end, capability_key
from public.permission_capabilities
where module_key in ('projects','hr','finance','documents','system')
on conflict do nothing;

-- Shared capabilities may deliberately belong to more than one portal.
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

-- Future conventional capabilities automatically join their canonical portal.
-- Shared memberships remain explicit additional rows.
create or replace function public.register_default_capability_portal()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_portal text;
begin
  v_portal := case new.module_key
    when 'projects' then 'projects'
    when 'hr' then 'workforce'
    when 'finance' then 'finance'
    when 'documents' then 'documents'
    when 'system' then 'admin'
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
after insert on public.permission_capabilities
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

-- The access editor replaces a user's complete permission projection atomically.
-- It is intentionally service-role only; the Edge Function authenticates the access manager.
create or replace function public.admin_replace_user_access_tree(
  p_actor_id uuid,
  p_user_id uuid,
  p_access_tree jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_node jsonb;
  v_portal text;
  v_mode text;
  v_scope_type text;
  v_scope_key text;
  v_scope_keys text[];
  v_capability text;
  v_capabilities text[];
  v_bundle_id uuid;
  v_saved integer := 0;
  v_project_count integer;
  v_existing_id uuid;
begin
  if p_actor_id is null or p_user_id is null then
    raise exception 'ACTOR_AND_USER_REQUIRED';
  end if;
  if not exists(select 1 from public.app_users where id=p_user_id and archived_at is null) then
    raise exception 'TARGET_USER_NOT_FOUND';
  end if;
  if jsonb_typeof(coalesce(p_access_tree,'[]'::jsonb)) <> 'array' then
    raise exception 'ACCESS_TREE_MUST_BE_ARRAY';
  end if;

  -- Validate the whole payload before revoking anything.
  for v_node in select value from jsonb_array_elements(coalesce(p_access_tree,'[]'::jsonb))
  loop
    v_portal := nullif(v_node->>'portalKey','');
    v_mode := coalesce(nullif(v_node->>'mode',''),'none');
    v_scope_type := coalesce(nullif(v_node->>'scopeType',''),'all');
    v_scope_keys := array(select jsonb_array_elements_text(coalesce(v_node->'scopeKeys','[]'::jsonb)));
    v_capabilities := array(select jsonb_array_elements_text(coalesce(v_node->'selectedCapabilities','[]'::jsonb)));

    if v_portal not in ('projects','workforce','finance','documents','admin') then
      raise exception 'INVALID_PORTAL:%', coalesce(v_portal,'');
    end if;
    if v_mode not in ('none','partial','full') then
      raise exception 'INVALID_MODE:%', v_mode;
    end if;
    if v_scope_type not in ('all','project') then
      raise exception 'INVALID_SCOPE:%', v_scope_type;
    end if;
    if v_scope_type='project' and v_portal<>'projects' then
      raise exception 'PROJECT_SCOPE_ONLY_FOR_PROJECTS';
    end if;
    if v_scope_type='project' and cardinality(v_scope_keys)=0 and v_mode<>'none' then
      raise exception 'PROJECT_SCOPE_KEYS_REQUIRED';
    end if;

    if v_scope_type='project' and cardinality(v_scope_keys)>0 then
      select count(*) into v_project_count
      from public.projects p
      where p.id::text=any(v_scope_keys);
      if v_project_count<>cardinality(v_scope_keys) then
        raise exception 'INVALID_PROJECT_SCOPE';
      end if;
    end if;

    if cardinality(v_capabilities)>0 and exists(
      select 1
      from unnest(v_capabilities) requested(capability_key)
      where not exists(
        select 1
        from public.permission_portal_capabilities pc
        join public.permission_capabilities c on c.capability_key=pc.capability_key and c.is_active
        where pc.portal_key=v_portal and pc.capability_key=requested.capability_key
      )
    ) then
      raise exception 'CAPABILITY_OUTSIDE_PORTAL:%', v_portal;
    end if;
  end loop;

  update public.user_permission_bundles
  set is_active=false,
      note='إدارة الدخول: استبدلتها شجرة الصلاحيات العامة'
  where user_id=p_user_id and is_active;

  update public.user_permission_overrides
  set is_active=false,
      note='إدارة الدخول: استبدلتها شجرة الصلاحيات العامة'
  where user_id=p_user_id and is_active;

  for v_node in select value from jsonb_array_elements(coalesce(p_access_tree,'[]'::jsonb))
  loop
    v_portal := v_node->>'portalKey';
    v_mode := coalesce(nullif(v_node->>'mode',''),'none');
    v_scope_type := coalesce(nullif(v_node->>'scopeType',''),'all');
    v_scope_keys := array(select jsonb_array_elements_text(coalesce(v_node->'scopeKeys','[]'::jsonb)));
    v_capabilities := array(select distinct x from jsonb_array_elements_text(coalesce(v_node->'selectedCapabilities','[]'::jsonb)) as t(x));

    if v_mode='none' then
      continue;
    end if;
    if v_scope_type='all' then
      v_scope_keys := array[null::text];
    end if;

    if v_mode='full' then
      select bundle_id into v_bundle_id
      from public.permission_portal_full_bundles
      where portal_key=v_portal;
      if v_bundle_id is null then
        raise exception 'FULL_PORTAL_BUNDLE_NOT_FOUND:%', v_portal;
      end if;

      foreach v_scope_key in array v_scope_keys
      loop
        select id into v_existing_id
        from public.user_permission_bundles
        where user_id=p_user_id
          and bundle_id=v_bundle_id
          and scope_type=v_scope_type
          and scope_key is not distinct from v_scope_key
        order by granted_at desc
        limit 1;

        if v_existing_id is null then
          insert into public.user_permission_bundles(
            user_id,bundle_id,scope_type,scope_key,is_active,valid_from,valid_until,granted_by,granted_at,note
          ) values (
            p_user_id,v_bundle_id,v_scope_type,v_scope_key,true,null,null,p_actor_id,now(),'إدارة الدخول: كامل البوابة بوراثة تلقائية'
          );
        else
          update public.user_permission_bundles
          set is_active=true,valid_from=null,valid_until=null,granted_by=p_actor_id,granted_at=now(),
              note='إدارة الدخول: كامل البوابة بوراثة تلقائية'
          where id=v_existing_id;
        end if;
        v_saved := v_saved+1;
      end loop;
    else
      foreach v_capability in array v_capabilities
      loop
        foreach v_scope_key in array v_scope_keys
        loop
          select id into v_existing_id
          from public.user_permission_overrides
          where user_id=p_user_id
            and capability_key=v_capability
            and scope_type=v_scope_type
            and scope_key is not distinct from v_scope_key
          order by granted_at desc
          limit 1;

          if v_existing_id is null then
            insert into public.user_permission_overrides(
              user_id,capability_key,effect,scope_type,scope_key,amount_limit,valid_from,valid_until,is_active,granted_by,granted_at,note
            ) values (
              p_user_id,v_capability,'allow',v_scope_type,v_scope_key,null,null,null,true,p_actor_id,now(),'إدارة الدخول: صلاحية مخصصة من الشجرة العامة'
            );
          else
            update public.user_permission_overrides
            set effect='allow',amount_limit=null,valid_from=null,valid_until=null,is_active=true,
                granted_by=p_actor_id,granted_at=now(),note='إدارة الدخول: صلاحية مخصصة من الشجرة العامة'
            where id=v_existing_id;
          end if;
          v_saved := v_saved+1;
        end loop;
      end loop;
    end if;
  end loop;

  update public.app_users
  set access_note='تدار الصلاحيات من الشجرة العامة الموحدة'
  where id=p_user_id;

  return jsonb_build_object('ok',true,'saved',v_saved);
end;
$$;

revoke all on function public.admin_replace_user_access_tree(uuid,uuid,jsonb) from public;
revoke all on function public.admin_replace_user_access_tree(uuid,uuid,jsonb) from anon;
revoke all on function public.admin_replace_user_access_tree(uuid,uuid,jsonb) from authenticated;
grant execute on function public.admin_replace_user_access_tree(uuid,uuid,jsonb) to service_role;

-- Runtime capability checks need read-only access to the registration tables.
alter table public.permission_portal_capabilities enable row level security;
alter table public.permission_portal_full_bundles enable row level security;

drop policy if exists permission_portal_capabilities_read on public.permission_portal_capabilities;
create policy permission_portal_capabilities_read
on public.permission_portal_capabilities for select to authenticated using (true);

drop policy if exists permission_portal_full_bundles_read on public.permission_portal_full_bundles;
create policy permission_portal_full_bundles_read
on public.permission_portal_full_bundles for select to authenticated using (true);

grant select on public.permission_portal_capabilities to authenticated;
grant select on public.permission_portal_full_bundles to authenticated;
