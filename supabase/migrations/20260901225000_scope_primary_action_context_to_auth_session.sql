-- تأسيس سياق التنفيذ للحساب الرئيسي على مستوى جلسة الدخول الفعلية.
-- الهدف: فصل «من يملك الصلاحية داخل النظام» عن «من قام بالفعل في الواقع» بدون حالة عامة معلقة بين الأجهزة.
-- كل جلسة تبدأ بصفة صاحب الحساب، ويمكن للحساب الرئيسي تفعيل «نيابة عن» داخل جلسته فقط.
-- انتهاء الجلسة أو مرور 8 ساعات يعيد السياق تلقائيًا إلى self، بينما تبقى السجلات المنفذة سابقًا مثبتة بهوية الفاعل وقت الإجراء.

create table if not exists private.user_action_context_sessions (
  system_actor_user_id uuid not null references public.app_users(id) on delete cascade,
  auth_session_id text not null,
  real_actor_employee_id uuid not null references public.employees(id),
  action_context_id uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '8 hours'),
  updated_at timestamptz not null default now(),
  primary key (system_actor_user_id, auth_session_id),
  constraint user_action_context_sessions_expiry_check check (expires_at > started_at)
);

create index if not exists idx_user_action_context_sessions_expiry
  on private.user_action_context_sessions(expires_at);

revoke all on table private.user_action_context_sessions from public, anon, authenticated;

comment on table private.user_action_context_sessions is
  'حالة تنفيذ نيابة عن مؤقتة ومعزولة لكل جلسة دخول. ليست مصدر صلاحية؛ auth.uid هو مصدر السلطة دائمًا.';

create or replace function private.fn_current_auth_session_id()
returns text
language sql
stable
security invoker
set search_path=public,private,pg_temp
as $$
  select nullif(auth.jwt()->>'session_id','');
$$;

revoke all on function private.fn_current_auth_session_id() from public, anon, authenticated;

-- المصدر المركزي الوحيد لسياق التنفيذ.
-- جميع المحركات اللاحقة (audit / approvals / operational events) تعتمد هذه الدالة،
-- لذلك تحويلها إلى سياق جلسة يرفع الدقة في النظام كله بدون منطق مكرر في الشاشات.
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
    select au.id as user_id, au.employee_id
    from public.app_users au
    where au.id=auth.uid() and au.is_active
    limit 1
  ), session_context as (
    select c.*
    from private.user_action_context_sessions c
    join me on me.user_id=c.system_actor_user_id
    where c.auth_session_id=private.fn_current_auth_session_id()
      and c.expires_at>now()
    limit 1
  ), resolved as (
    select
      me.user_id,
      me.employee_id as system_employee_id,
      public.fn_is_primary_user() as is_primary,
      case
        when public.fn_is_primary_user()
         and sc.real_actor_employee_id is not null
         and sc.real_actor_employee_id is distinct from me.employee_id
        then sc.real_actor_employee_id
        else me.employee_id
      end as real_employee_id,
      case
        when public.fn_is_primary_user()
         and sc.real_actor_employee_id is not null
         and sc.real_actor_employee_id is distinct from me.employee_id
        then 'on_behalf_of'
        else 'self'
      end as mode,
      case
        when public.fn_is_primary_user()
         and sc.real_actor_employee_id is not null
         and sc.real_actor_employee_id is distinct from me.employee_id
        then sc.action_context_id
        else null
      end as context_id,
      case
        when public.fn_is_primary_user()
         and sc.real_actor_employee_id is not null
         and sc.real_actor_employee_id is distinct from me.employee_id
        then sc.started_at
        else null
      end as mode_started_at
    from me
    left join session_context sc on true
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
    order by au.is_system_admin desc, au.created_at
    limit 1
  ) real_user on true;
$$;

revoke all on function private.fn_current_action_context() from public, anon, authenticated;

-- انتقال الحالة الوحيد للحساب الرئيسي. لا تخزن الشاشة أي حالة صلاحية أو نيابة محليًا.
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
  v_session_id text;
  v_primary_employee_id uuid;
  v_employee public.employees;
  v_current private.user_action_context_sessions%rowtype;
  v_has_current boolean:=false;
  v_enable boolean;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not public.fn_is_primary_user() then
    raise exception 'وضع تنفيذ نيابة عن متاح للحساب الرئيسي فقط';
  end if;

  v_session_id:=private.fn_current_auth_session_id();
  if v_session_id is null then
    raise exception 'تعذر تحديد جلسة الدخول الحالية؛ أعد تسجيل الدخول ثم حاول مرة أخرى';
  end if;

  select au.employee_id
  into v_primary_employee_id
  from public.app_users au
  where au.id=auth.uid() and au.is_active
  limit 1;

  v_enable:=coalesce(p_enabled,false)
    and p_real_actor_employee_id is not null
    and p_real_actor_employee_id is distinct from v_primary_employee_id;

  -- تنظيف كسول وخفيف للسياقات المنتهية الخاصة بالحساب الحالي فقط.
  delete from private.user_action_context_sessions
  where system_actor_user_id=auth.uid()
    and expires_at<=now();

  select *
  into v_current
  from private.user_action_context_sessions
  where system_actor_user_id=auth.uid()
    and auth_session_id=v_session_id
  for update;
  v_has_current:=found;

  if v_enable then
    select * into v_employee
    from public.employees
    where id=p_real_actor_employee_id;

    if v_employee.id is null then
      raise exception 'الشخص المحدد غير موجود في سجل الأشخاص';
    end if;

    if v_has_current
       and v_current.real_actor_employee_id=p_real_actor_employee_id
       and v_current.expires_at>now() then
      update private.user_action_context_sessions
      set expires_at=now()+interval '8 hours',
          updated_at=now()
      where system_actor_user_id=auth.uid()
        and auth_session_id=v_session_id;
    else
      insert into private.user_action_context_sessions(
        system_actor_user_id,
        auth_session_id,
        real_actor_employee_id,
        action_context_id,
        started_at,
        expires_at,
        updated_at
      ) values(
        auth.uid(),
        v_session_id,
        p_real_actor_employee_id,
        gen_random_uuid(),
        now(),
        now()+interval '8 hours',
        now()
      )
      on conflict (system_actor_user_id,auth_session_id)
      do update set
        real_actor_employee_id=excluded.real_actor_employee_id,
        action_context_id=excluded.action_context_id,
        started_at=excluded.started_at,
        expires_at=excluded.expires_at,
        updated_at=excluded.updated_at;
    end if;
  else
    delete from private.user_action_context_sessions
    where system_actor_user_id=auth.uid()
      and auth_session_id=v_session_id;
  end if;

  return public.fn_my_action_context();
end;
$$;

revoke all on function public.fn_set_my_action_context(boolean,uuid) from public,anon;
grant execute on function public.fn_set_my_action_context(boolean,uuid) to authenticated;

-- استثناء الحساب الرئيسي في مرحلة التأسيس:
-- صلاحية الضغط والتنفيذ تبقى للحساب الرئيسي، أما «من قام بالفعل» فيُؤخذ من سياق النيابة.
-- لا نشترط اكتمال حزم صلاحيات الشخص المُمثَّل عند مرحلة capability؛ لأن هذا السجل يوثّق
-- واقعًا حدث خارج البرنامج أثناء بنائه. أما المرحلة المسندة إلى مستخدم بعينه فلا يجوز نسبتها
-- إلى شخص آخر؛ المطابقة تكون بالموظف حتى لو تغيّر حسابه أو كانت له أكثر من هوية دخول.
create or replace function private.fn_current_actor_can_take_approval_step(
  p_workflow_id uuid,
  p_step_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ctx record;
  w public.approval_workflows;
  s public.approval_workflow_steps;
  v_target_employee_id uuid;
  v_scope_type text;
  v_scope_key text;
begin
  if auth.uid() is null then return false; end if;

  select * into w from public.approval_workflows where id=p_workflow_id;
  select * into s from public.approval_workflow_steps where id=p_step_id and workflow_id=p_workflow_id;
  if w.id is null or s.id is null or w.status<>'pending' or s.status<>'pending' then return false; end if;

  select * into v_ctx from private.fn_current_action_context();

  if public.fn_is_primary_user() and v_ctx.acting_mode='on_behalf_of' then
    if v_ctx.real_actor_employee_id is null then return false; end if;

    if s.target_type='user' then
      select au.employee_id into v_target_employee_id
      from public.app_users au
      where au.id=s.target_user_id
      limit 1;
      return v_target_employee_id is not null
        and v_target_employee_id=v_ctx.real_actor_employee_id;
    end if;

    if s.target_type='capability' and s.target_capability is not null then
      return true;
    end if;

    return false;
  end if;

  if s.target_type='user' then
    return s.target_user_id=auth.uid();
  end if;

  if s.target_type<>'capability' or s.target_capability is null then return false; end if;
  v_scope_type:=case when w.project_id is null then 'all' else 'project' end;
  v_scope_key:=case when w.project_id is null then null else w.project_id::text end;

  return public.has_capability(s.target_capability,v_scope_type,v_scope_key,w.amount);
end;
$$;

revoke all on function private.fn_current_actor_can_take_approval_step(uuid,uuid) from public,anon,authenticated;

comment on function private.fn_current_actor_can_take_approval_step(uuid,uuid) is
  'الحكم المركزي للاعتماد: المستخدمون العاديون تحكمهم الصلاحيات التفصيلية، والحساب الرئيسي يستطيع أثناء التسجيل نيابةً عن توثيق الواقع مع إلزام مطابقة الشخص في المراحل المسندة لمستخدم بعينه.';

-- إنهاء البنية العامة القديمة بعد نقل المصدر المركزي إلى الجلسة.
-- لا نستخدم CASCADE عمدًا: إذا ظهر اعتماد خفي فالمهاجرة تفشل بدل حذف شيء غير مقصود.
drop trigger if exists trg_guard_primary_action_context_settings on public.system_access_settings;
drop function if exists private.fn_guard_primary_action_context_settings();

alter table public.system_access_settings
  drop constraint if exists system_access_settings_primary_action_mode_check,
  drop constraint if exists system_access_settings_primary_action_context_check,
  drop column if exists primary_action_mode,
  drop column if exists primary_acting_for_employee_id,
  drop column if exists primary_action_context_id,
  drop column if exists primary_action_mode_started_at,
  drop column if exists primary_action_mode_updated_by;

comment on function public.fn_set_my_action_context(boolean,uuid) is
  'يضبط صاحب الإجراء الحقيقي للحساب الرئيسي داخل جلسة الدخول الحالية فقط. سلطة التنفيذ النظامية تبقى للحساب الرئيسي ولا تنتقل للشخص المختار.';
comment on function public.current_real_actor_employee_id() is
  'هوية صاحب الفعل الحقيقي في جلسة التنفيذ الحالية؛ يجب استخدامها في أي وظيفة جديدة بدل افتراض أن auth.uid هو صاحب الفعل.';

-- واجهة القراءة تبقى بنفس العقد jsonb، لكن تضيف وقت انتهاء السياق حتى لا تعرض الشاشة
-- «نيابة عن» بعد أن تكون قاعدة البيانات قد أعادت التنفيذ تلقائيًا إلى self.
create or replace function public.fn_my_action_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $$
declare
  v record;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;

  select * into v from private.fn_current_action_context();

  if v.acting_mode='on_behalf_of' and v.action_context_id is not null then
    select c.expires_at
    into v_expires_at
    from private.user_action_context_sessions c
    where c.system_actor_user_id=auth.uid()
      and c.auth_session_id=private.fn_current_auth_session_id()
      and c.action_context_id=v.action_context_id
      and c.expires_at>now()
    limit 1;
  end if;

  return jsonb_build_object(
    'system_actor_user_id',v.system_actor_user_id,
    'system_actor_employee_id',v.system_actor_employee_id,
    'real_actor_user_id',v.real_actor_user_id,
    'real_actor_employee_id',v.real_actor_employee_id,
    'real_actor_name',v.real_actor_name,
    'acting_mode',coalesce(v.acting_mode,'self'),
    'action_context_id',v.action_context_id,
    'is_primary_user',coalesce(v.is_primary_user,false),
    'started_at',v.started_at,
    'expires_at',v_expires_at
  );
end;
$$;

revoke all on function public.fn_my_action_context() from public,anon;
grant execute on function public.fn_my_action_context() to authenticated;

comment on function public.fn_my_action_context() is
  'يعيد سياق صاحب الإجراء الحالي للحساب المسجل، مع وقت انتهاء وضع النيابة حتى تبقى الواجهة متزامنة مع قرار قاعدة البيانات.';
