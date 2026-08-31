-- Full portal grants may keep inheritance while explicitly denying selected current leaves.
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
  v_excluded text[];
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

  -- Validate the entire payload before changing existing access.
  for v_node in select value from jsonb_array_elements(coalesce(p_access_tree,'[]'::jsonb))
  loop
    v_portal := nullif(v_node->>'portalKey','');
    v_mode := coalesce(nullif(v_node->>'mode',''),'none');
    v_scope_type := coalesce(nullif(v_node->>'scopeType',''),'all');
    v_scope_keys := array(select jsonb_array_elements_text(coalesce(v_node->'scopeKeys','[]'::jsonb)));
    v_capabilities := array(select jsonb_array_elements_text(coalesce(v_node->'selectedCapabilities','[]'::jsonb)));
    v_excluded := array(select jsonb_array_elements_text(coalesce(v_node->'excludedCapabilities','[]'::jsonb)));

    if v_portal is null or v_portal not in ('projects','workforce','finance','documents','admin') then
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

    if cardinality(v_excluded)>0 and exists(
      select 1
      from unnest(v_excluded) requested(capability_key)
      where not exists(
        select 1
        from public.permission_portal_capabilities pc
        join public.permission_capabilities c on c.capability_key=pc.capability_key and c.is_active
        where pc.portal_key=v_portal and pc.capability_key=requested.capability_key
      )
    ) then
      raise exception 'EXCLUSION_OUTSIDE_PORTAL:%', v_portal;
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
    v_excluded := array(select distinct x from jsonb_array_elements_text(coalesce(v_node->'excludedCapabilities','[]'::jsonb)) as t(x));

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

      -- Explicit denies override the inherited full-portal grant but do not stop
      -- inheritance of future capabilities that are not in this exclusion list.
      foreach v_capability in array v_excluded
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
              p_user_id,v_capability,'deny',v_scope_type,v_scope_key,null,null,null,true,p_actor_id,now(),'إدارة الدخول: استثناء من كامل البوابة'
            );
          else
            update public.user_permission_overrides
            set effect='deny',amount_limit=null,valid_from=null,valid_until=null,is_active=true,
                granted_by=p_actor_id,granted_at=now(),note='إدارة الدخول: استثناء من كامل البوابة'
            where id=v_existing_id;
          end if;
          v_saved := v_saved+1;
        end loop;
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
