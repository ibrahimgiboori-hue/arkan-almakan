-- Canonical approvals: shadow organizational resolver.
-- No live workflow calls this function yet.

create or replace function public.fn_resolve_step_target(
  p_user_id uuid,
  p_module_key text,
  p_resource_key text,
  p_scope_type text default 'all',
  p_scope_key text default null,
  p_amount numeric default null
)
returns table(
  resolution_source text,
  manager_depth int,
  resolved_employee_id uuid,
  target_user_id uuid,
  capability_key text,
  action_key text,
  action_label_ar text,
  reason text
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_subject uuid := coalesce(p_user_id, auth.uid());
  v_emp_id uuid;
  v_cur_emp uuid;
  v_cur_rank smallint;
  v_depth int := 0;
  v_manager_emp uuid;
  v_manager_user uuid;
  v_cap record;
  v_seen uuid[] := array[]::uuid[];
begin
  if v_caller is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if v_subject is null then
    raise exception 'المستخدم مطلوب';
  end if;

  if v_subject <> v_caller
     and not (public.fn_is_primary_user() or public.has_capability('system.approvals.view','all',null,null)) then
    raise exception 'لا تملك صلاحية الاستعلام عن مسار مستخدم آخر';
  end if;

  select employee_id into v_emp_id
  from public.app_users
  where id=v_subject and is_active;

  v_cur_rank := private.fn_user_workflow_rank(v_subject,p_module_key,p_resource_key,p_scope_type,p_scope_key,p_amount);
  v_cur_emp := v_emp_id;

  if v_cur_emp is not null then
    v_seen := array[v_cur_emp]::uuid[];
    loop
      v_depth := v_depth + 1;
      exit when v_depth > 8;

      v_manager_emp := null;
      v_manager_user := null;

      select direct_manager_id into v_manager_emp
      from public.employees
      where id=v_cur_emp;

      exit when v_manager_emp is null;
      exit when v_manager_emp = any(v_seen);
      v_seen := v_seen || v_manager_emp;

      select au.id into v_manager_user
      from public.app_users au
      join public.employees e on e.id=au.employee_id
      where au.employee_id=v_manager_emp
        and au.is_active
        and e.status in ('active','on_leave')
      order by au.created_at
      limit 1;

      if v_manager_user is not null then
        select c.capability_key,c.action_key,a.label_ar,a.workflow_rank
          into v_cap
        from public.permission_capabilities c
        join public.permission_actions a
          on a.action_key=c.action_key
         and a.is_active
         and a.is_workflow_stage
        where c.is_active
          and c.module_key=p_module_key
          and c.resource_key=p_resource_key
          and a.workflow_rank>v_cur_rank
          and private.fn_user_has_assigned_capability(v_manager_user,c.capability_key,p_scope_type,p_scope_key,p_amount)
        order by a.workflow_rank,c.capability_key
        limit 1;

        if v_cap.capability_key is not null then
          return query select
            'org_chart'::text,v_depth,v_manager_emp,v_manager_user,
            v_cap.capability_key,v_cap.action_key,v_cap.label_ar,
            format('تم الحل عبر المدير الإداري عند المستوى %s',v_depth)::text;
          return;
        end if;
      end if;

      v_cur_emp := v_manager_emp;
    end loop;
  end if;

  return query
  select
    'capability_rank_fallback'::text,
    null::int,
    null::uuid,
    null::uuid,
    n.capability_key,
    n.action_key,
    n.action_label_ar,
    'لم يوجد مدير إداري مؤهل؛ استُخدم تسلسل رتبة الصلاحية الحالي.'::text
  from public.fn_next_higher_authority(p_module_key,p_resource_key,p_scope_type,p_scope_key,p_amount,v_subject) n
  limit 1;

  if not found then
    return query select
      'no_target_found'::text,null::int,null::uuid,null::uuid,null::text,null::text,null::text,
      'لا يوجد مدير إداري مؤهل ولا مستوى صلاحية أعلى.'::text;
  end if;
end;
$$;

revoke all on function public.fn_resolve_step_target(uuid,text,text,text,text,numeric) from public, anon;
grant execute on function public.fn_resolve_step_target(uuid,text,text,text,text,numeric) to authenticated;

comment on function public.fn_resolve_step_target(uuid,text,text,text,text,numeric) is
  'Shadow resolver: org chart first, capability-rank fallback second. Not wired to live workflow creation yet.';
