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
    where ub.user_id=auth.uid() and ub.is_active
      and b.bundle_key='projects_full_access'
      and p_capability like 'projects.%'
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

update public.permission_bundles
set name_ar='كامل بوابة المشاريع',
    name_en='Full Projects Portal',
    description_ar='صلاحية وراثية لبوابة المشاريع: جميع وظائف projects.* الحالية والمستقبلية، بحسب نطاق all أو project.',
    updated_at=now()
where bundle_key='projects_full_access';

update public.app_users
set access_note='المستخدم الأساسي الثاني: صفحة اليوم + كامل بوابة المشاريع'
where id=(select id from auth.users where lower(email)=lower('jassas.co.sa@gmail.com') limit 1);
