create or replace function public.fn_approval_route_destinations()
returns table(destination_key text,label_ar text,portal_key text)
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not (public.fn_is_primary_user() or public.has_capability('system.approvals.route','all',null,null)) then
    raise exception 'لا تملك صلاحية إحالة الاعتمادات';
  end if;

  return query
  select d.destination_key,d.label_ar,d.portal_key
  from public.procedure_destinations d
  where d.is_active
    and d.portal_key is not null
    and d.destination_key=d.portal_key
  order by d.sort_order nulls last,d.label_ar;
end;
$function$;

create or replace function public.fn_admin_procedure_target_users(p_destination_key text)
returns table(user_id uuid,employee_id uuid,full_name_ar text,is_system_admin boolean)
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_portal text;
  v_module text;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not (public.fn_is_primary_user() or public.has_capability('system.approvals.route','all',null,null)) then
    raise exception 'لا تملك صلاحية إدارة دستور حركة المعاملات';
  end if;

  select portal_key into v_portal
  from public.procedure_destinations
  where destination_key=p_destination_key
    and is_active
    and portal_key is not null
    and destination_key=portal_key;
  if not found then raise exception 'البوابة المحددة غير فعالة'; end if;

  v_module:=case v_portal
    when 'workforce' then 'hr'
    when 'projects' then 'projects'
    when 'finance' then 'finance'
    when 'admin' then 'admin'
    when 'documents' then 'documents'
    else null end;

  return query
  select au.id,au.employee_id,coalesce(e.full_name_ar,'مستخدم النظام')::text,coalesce(au.is_system_admin,false)
  from public.app_users au
  left join public.employees e on e.id=au.employee_id
  where au.is_active
    and au.archived_at is null
    and au.access_profile='operational'
    and (
      au.is_system_admin
      or v_module is null
      or exists(
        select 1
        from public.permission_capabilities c
        where c.is_active
          and c.module_key=v_module
          and private.fn_user_has_assigned_capability(au.id,c.capability_key,'all',null,null)
      )
    )
  order by coalesce(e.full_name_ar,'مستخدم النظام');
end;
$function$;

create or replace function public.fn_approval_route_people()
returns table(user_id uuid,employee_id uuid,full_name_ar text,is_system_admin boolean,access_profile text)
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not (public.fn_is_primary_user() or public.has_capability('system.approvals.route','all',null,null)) then
    raise exception 'لا تملك صلاحية إحالة الاعتمادات';
  end if;

  return query
  select au.id,au.employee_id,coalesce(e.full_name_ar,'مستخدم النظام')::text,coalesce(au.is_system_admin,false),au.access_profile
  from public.app_users au
  left join public.employees e on e.id=au.employee_id
  where au.is_active
    and au.archived_at is null
    and au.id<>auth.uid()
  order by coalesce(e.full_name_ar,'مستخدم النظام');
end;
$function$;

grant execute on function public.fn_approval_route_destinations() to authenticated;
grant execute on function public.fn_admin_procedure_target_users(text) to authenticated;
grant execute on function public.fn_approval_route_people() to authenticated;
