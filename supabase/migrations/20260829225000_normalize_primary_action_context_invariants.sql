-- تثبيت invariants سياق التنفيذ للحساب الرئيسي.
-- «تنفيذ نيابة عن» لا يجوز أن يكون نيابة عن صاحب الحساب نفسه؛ في هذه الحالة يعود الوضع إلى self.
-- هذا الملف لا يغير الصلاحيات: auth.uid() يبقى مصدر السلطة، والسياق يحدد فقط صاحب الفعل الحقيقي.

-- أصلح أي حالة قديمة مستحيلة قبل تركيب الحارس.
update public.system_access_settings s
set primary_action_mode='self',
    primary_acting_for_employee_id=null,
    primary_action_context_id=null,
    primary_action_mode_started_at=null,
    updated_at=now()
where s.singleton=true
  and s.primary_action_mode='on_behalf_of'
  and s.primary_acting_for_employee_id is not null
  and s.primary_acting_for_employee_id=(
    select au.employee_id
    from public.app_users au
    where au.id=s.primary_user_id
    limit 1
  );

create or replace function private.fn_guard_primary_action_context_settings()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_primary_employee_id uuid;
begin
  select au.employee_id
  into v_primary_employee_id
  from public.app_users au
  where au.id=new.primary_user_id
  limit 1;

  if coalesce(new.primary_action_mode,'self')='self' then
    new.primary_action_mode:='self';
    new.primary_acting_for_employee_id:=null;
    new.primary_action_context_id:=null;
    new.primary_action_mode_started_at:=null;
    return new;
  end if;

  if new.primary_action_mode<>'on_behalf_of' then
    raise exception 'وضع التنفيذ غير مدعوم';
  end if;
  if new.primary_acting_for_employee_id is null then
    raise exception 'اختر صاحب الإجراء الفعلي';
  end if;

  -- اختيار صاحب الحساب نفسه ليس نيابة، بل تنفيذ بصفته.
  if v_primary_employee_id is not null
     and new.primary_acting_for_employee_id=v_primary_employee_id then
    new.primary_action_mode:='self';
    new.primary_acting_for_employee_id:=null;
    new.primary_action_context_id:=null;
    new.primary_action_mode_started_at:=null;
    return new;
  end if;

  if not exists(
    select 1 from public.employees e
    where e.id=new.primary_acting_for_employee_id
  ) then
    raise exception 'الشخص المحدد غير موجود في سجل الأشخاص';
  end if;

  new.primary_action_context_id:=coalesce(new.primary_action_context_id,gen_random_uuid());
  new.primary_action_mode_started_at:=coalesce(new.primary_action_mode_started_at,now());
  return new;
end;
$$;

revoke all on function private.fn_guard_primary_action_context_settings() from public,anon,authenticated;

drop trigger if exists trg_guard_primary_action_context_settings on public.system_access_settings;
create trigger trg_guard_primary_action_context_settings
before insert or update of primary_action_mode,primary_acting_for_employee_id,primary_action_context_id,primary_action_mode_started_at,primary_user_id
on public.system_access_settings
for each row execute function private.fn_guard_primary_action_context_settings();

-- المصدر المركزي للسياق لا يثق بحالة «نيابة عن النفس» حتى لو وصلت إليه من بيانات قديمة.
create or replace function private.fn_current_action_context()
returns table(
  system_actor_user_id uuid,
  system_actor_employee_id uuid,
  real_actor_user_id uuid,
  real_actor_employee_id uuid,
  real_actor_name text,
  acting_mode text,
  action_context_id uuid,
  is_primary_user boolean,
  started_at timestamptz
)
language sql
stable
security definer
set search_path=public,private,pg_temp
as $$
  with me as (
    select au.id as user_id,au.employee_id
    from public.app_users au
    where au.id=auth.uid() and au.is_active
    limit 1
  ), settings as (
    select s.*
    from public.system_access_settings s
    where s.singleton=true
    limit 1
  ), resolved as (
    select
      me.user_id,
      me.employee_id as system_employee_id,
      public.fn_is_primary_user() as is_primary,
      case
        when public.fn_is_primary_user()
         and settings.primary_action_mode='on_behalf_of'
         and settings.primary_acting_for_employee_id is not null
         and settings.primary_acting_for_employee_id is distinct from me.employee_id
        then settings.primary_acting_for_employee_id
        else me.employee_id
      end as real_employee_id,
      case
        when public.fn_is_primary_user()
         and settings.primary_action_mode='on_behalf_of'
         and settings.primary_acting_for_employee_id is not null
         and settings.primary_acting_for_employee_id is distinct from me.employee_id
        then 'on_behalf_of'
        else 'self'
      end as mode,
      case
        when public.fn_is_primary_user()
         and settings.primary_action_mode='on_behalf_of'
         and settings.primary_acting_for_employee_id is not null
         and settings.primary_acting_for_employee_id is distinct from me.employee_id
        then settings.primary_action_context_id
        else null
      end as context_id,
      case
        when public.fn_is_primary_user()
         and settings.primary_action_mode='on_behalf_of'
         and settings.primary_acting_for_employee_id is not null
         and settings.primary_acting_for_employee_id is distinct from me.employee_id
        then settings.primary_action_mode_started_at
        else null
      end as mode_started_at
    from me
    left join settings on true
  )
  select
    r.user_id,
    r.system_employee_id,
    real_user.id,
    r.real_employee_id,
    emp.full_name_ar,
    r.mode,
    r.context_id,
    r.is_primary,
    r.mode_started_at
  from resolved r
  left join public.employees emp on emp.id=r.real_employee_id
  left join lateral (
    select au.id
    from public.app_users au
    where au.employee_id=r.real_employee_id and au.is_active
    order by au.is_system_admin desc,au.created_at
    limit 1
  ) real_user on true;
$$;

revoke all on function private.fn_current_action_context() from public,anon,authenticated;

-- انتقال الحالة الوحيد: اختيار النفس يساوي إيقاف النيابة، ولا ينشئ context زائفًا.
create or replace function public.fn_set_my_action_context(
  p_enabled boolean,
  p_real_actor_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_employee public.employees;
  v_current public.system_access_settings;
  v_primary_employee_id uuid;
  v_enable boolean;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not public.fn_is_primary_user() then
    raise exception 'وضع تنفيذ نيابة عن متاح للحساب الرئيسي فقط';
  end if;

  select au.employee_id into v_primary_employee_id
  from public.app_users au
  where au.id=auth.uid() and au.is_active
  limit 1;

  v_enable:=coalesce(p_enabled,false)
    and p_real_actor_employee_id is not null
    and p_real_actor_employee_id is distinct from v_primary_employee_id;

  select * into v_current
  from public.system_access_settings
  where singleton=true
  for update;

  if v_enable then
    select * into v_employee
    from public.employees
    where id=p_real_actor_employee_id;
    if v_employee.id is null then raise exception 'الشخص المحدد غير موجود في سجل الأشخاص'; end if;

    update public.system_access_settings
    set primary_action_mode='on_behalf_of',
        primary_acting_for_employee_id=p_real_actor_employee_id,
        primary_action_context_id=case
          when v_current.primary_action_mode='on_behalf_of'
           and v_current.primary_acting_for_employee_id=p_real_actor_employee_id
           and v_current.primary_action_context_id is not null
          then v_current.primary_action_context_id
          else gen_random_uuid()
        end,
        primary_action_mode_started_at=case
          when v_current.primary_action_mode='on_behalf_of'
           and v_current.primary_acting_for_employee_id=p_real_actor_employee_id
           and v_current.primary_action_mode_started_at is not null
          then v_current.primary_action_mode_started_at
          else now()
        end,
        primary_action_mode_updated_by=auth.uid(),
        updated_at=now()
    where singleton=true;
  else
    update public.system_access_settings
    set primary_action_mode='self',
        primary_acting_for_employee_id=null,
        primary_action_context_id=null,
        primary_action_mode_started_at=null,
        primary_action_mode_updated_by=auth.uid(),
        updated_at=now()
    where singleton=true;
  end if;

  return public.fn_my_action_context();
end;
$$;

revoke all on function public.fn_set_my_action_context(boolean,uuid) from public,anon;
grant execute on function public.fn_set_my_action_context(boolean,uuid) to authenticated;
