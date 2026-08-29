-- الحالة الخاصة للحساب الرئيسي: «تنفيذ نيابة عن».
-- هذه ليست صلاحية موازية ولا جلسة انتحال. الصلاحيات تبقى للحساب المسجل فعليًا (auth.uid)،
-- بينما تنفصل هوية المُسجِّل النظامي عن صاحب الإجراء الحقيقي في النواة والتدقيق والاعتمادات.

alter table public.system_access_settings
  add column if not exists primary_action_mode text not null default 'self',
  add column if not exists primary_acting_for_employee_id uuid references public.employees(id),
  add column if not exists primary_action_context_id uuid,
  add column if not exists primary_action_mode_started_at timestamptz,
  add column if not exists primary_action_mode_updated_by uuid references public.app_users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='system_access_settings_primary_action_mode_check'
      and conrelid='public.system_access_settings'::regclass
  ) then
    alter table public.system_access_settings
      add constraint system_access_settings_primary_action_mode_check
      check (primary_action_mode in ('self','on_behalf_of'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='system_access_settings_primary_action_context_check'
      and conrelid='public.system_access_settings'::regclass
  ) then
    alter table public.system_access_settings
      add constraint system_access_settings_primary_action_context_check
      check (
        (primary_action_mode='self' and primary_acting_for_employee_id is null and primary_action_context_id is null)
        or
        (primary_action_mode='on_behalf_of' and primary_acting_for_employee_id is not null and primary_action_context_id is not null)
      );
  end if;
end;
$$;

-- المصدر المركزي الوحيد لسياق التنفيذ. الصلاحية لا تنتقل للشخص المختار؛ فقط نسبة الفعل إليه.
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
        then settings.primary_acting_for_employee_id
        else me.employee_id
      end as real_employee_id,
      case
        when public.fn_is_primary_user()
         and settings.primary_action_mode='on_behalf_of'
         and settings.primary_acting_for_employee_id is not null
        then 'on_behalf_of'
        else 'self'
      end as mode,
      case
        when public.fn_is_primary_user() and settings.primary_action_mode='on_behalf_of'
        then settings.primary_action_context_id
        else null
      end as context_id,
      case
        when public.fn_is_primary_user() and settings.primary_action_mode='on_behalf_of'
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
    order by au.is_system_admin desc, au.created_at
    limit 1
  ) real_user on true;
$$;

revoke all on function private.fn_current_action_context() from public, anon, authenticated;

create or replace function public.fn_my_action_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $$
declare
  v record;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v from private.fn_current_action_context();
  return jsonb_build_object(
    'system_actor_user_id',v.system_actor_user_id,
    'system_actor_employee_id',v.system_actor_employee_id,
    'real_actor_user_id',v.real_actor_user_id,
    'real_actor_employee_id',v.real_actor_employee_id,
    'real_actor_name',v.real_actor_name,
    'acting_mode',coalesce(v.acting_mode,'self'),
    'action_context_id',v.action_context_id,
    'is_primary_user',coalesce(v.is_primary_user,false),
    'started_at',v.started_at
  );
end;
$$;

revoke all on function public.fn_my_action_context() from public, anon;
grant execute on function public.fn_my_action_context() to authenticated;

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
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not public.fn_is_primary_user() then
    raise exception 'وضع تنفيذ نيابة عن متاح للحساب الرئيسي فقط';
  end if;

  select * into v_current
  from public.system_access_settings
  where singleton=true
  for update;

  if coalesce(p_enabled,false) then
    if p_real_actor_employee_id is null then raise exception 'اختر صاحب الإجراء الفعلي'; end if;
    select * into v_employee from public.employees where id=p_real_actor_employee_id;
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

revoke all on function public.fn_set_my_action_context(boolean,uuid) from public, anon;
grant execute on function public.fn_set_my_action_context(boolean,uuid) to authenticated;

create or replace function public.current_real_actor_employee_id()
returns uuid
language sql
stable
security definer
set search_path=public,private,pg_temp
as $$
  select real_actor_employee_id from private.fn_current_action_context();
$$;

create or replace function public.current_action_mode()
returns text
language sql
stable
security definer
set search_path=public,private,pg_temp
as $$
  select coalesce(acting_mode,'self') from private.fn_current_action_context();
$$;

revoke all on function public.current_real_actor_employee_id() from public, anon;
revoke all on function public.current_action_mode() from public, anon;
grant execute on function public.current_real_actor_employee_id() to authenticated;
grant execute on function public.current_action_mode() to authenticated;

-- التدقيق العام: كل جدول يمر عبر fn_audit يحمل الآن المسجل النظامي وصاحب الفعل الحقيقي والسياق.
alter table public.audit_log
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid,
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

create index if not exists idx_audit_log_real_actor on public.audit_log(real_actor_employee_id,at desc);
create index if not exists idx_audit_log_action_context on public.audit_log(action_context_id) where action_context_id is not null;

update public.audit_log al
set system_actor_user_id=coalesce(al.system_actor_user_id,al.actor_id),
    real_actor_employee_id=coalesce(al.real_actor_employee_id,au.employee_id),
    real_actor_name_snapshot=coalesce(al.real_actor_name_snapshot,e.full_name_ar),
    acting_mode=coalesce(al.acting_mode,case when au.employee_id is null then 'legacy_unknown' else 'legacy_self' end)
from public.app_users au
left join public.employees e on e.id=au.employee_id
where al.actor_id=au.id
  and (al.system_actor_user_id is null or al.real_actor_employee_id is null or al.acting_mode is null);

update public.audit_log
set acting_mode='legacy_unknown'
where acting_mode is null;

create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
  v_ctx record;
begin
  if tg_op in ('UPDATE','DELETE') then v_old:=to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new:=to_jsonb(new); end if;

  begin
    v_id:=coalesce(v_new->>'id',v_old->>'id')::uuid;
  exception when others then
    v_id:=null;
  end;

  select * into v_ctx from private.fn_current_action_context();

  insert into public.audit_log(
    table_name,record_id,action,old_data,new_data,actor_id,actor_role,
    system_actor_user_id,real_actor_employee_id,real_actor_name_snapshot,acting_mode,action_context_id
  ) values(
    tg_table_name,v_id,tg_op,v_old,v_new,auth.uid(),public.current_app_role(),
    v_ctx.system_actor_user_id,v_ctx.real_actor_employee_id,v_ctx.real_actor_name,
    coalesce(v_ctx.acting_mode,'self'),v_ctx.action_context_id
  );

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

-- سجل تغيير الوضع نفسه يخضع للتدقيق المركزي.
drop trigger if exists trg_audit_system_access_settings_action_context on public.system_access_settings;
create trigger trg_audit_system_access_settings_action_context
after insert or update or delete on public.system_access_settings
for each row execute function public.fn_audit();

-- محرك الاعتمادات: acted_by_user_id يظل المُسجّل النظامي، وهذه الحقول تحفظ صاحب القرار الحقيقي.
alter table public.approval_workflow_steps
  add column if not exists real_actor_employee_id uuid,
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.approval_workflow_events
  add column if not exists real_actor_employee_id uuid,
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.approvals
  add column if not exists actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

update public.approval_workflow_steps s
set real_actor_employee_id=coalesce(s.real_actor_employee_id,au.employee_id),
    real_actor_name_snapshot=coalesce(s.real_actor_name_snapshot,e.full_name_ar),
    acting_mode=coalesce(s.acting_mode,case when au.employee_id is null then 'legacy_unknown' else 'legacy_self' end)
from public.app_users au
left join public.employees e on e.id=au.employee_id
where s.acted_by_user_id=au.id
  and (s.real_actor_employee_id is null or s.acting_mode is null);

update public.approval_workflow_events ev
set real_actor_employee_id=coalesce(ev.real_actor_employee_id,au.employee_id),
    real_actor_name_snapshot=coalesce(ev.real_actor_name_snapshot,e.full_name_ar),
    acting_mode=coalesce(ev.acting_mode,case when au.employee_id is null then 'legacy_unknown' else 'legacy_self' end)
from public.app_users au
left join public.employees e on e.id=au.employee_id
where ev.actor_user_id=au.id
  and (ev.real_actor_employee_id is null or ev.acting_mode is null);

update public.approvals a
set actor_name_snapshot=coalesce(a.actor_name_snapshot,e.full_name_ar),
    acting_mode=coalesce(a.acting_mode,
      case
        when a.actor_employee_id is null then 'legacy_unknown'
        when au.employee_id=a.actor_employee_id then 'legacy_self'
        else 'explicit_actor'
      end)
from public.app_users au
left join public.employees e on e.id=a.actor_employee_id
where au.id=coalesce(a.recorded_by_user_id,a.decided_by)
  and (a.actor_name_snapshot is null or a.acting_mode is null);

update public.approvals set acting_mode='legacy_unknown' where acting_mode is null;

create or replace function private.fn_stamp_workflow_step_actor_context()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ctx record;
  v_employee_id uuid;
  v_name text;
begin
  if new.acted_by_user_id is null then return new; end if;
  if tg_op='UPDATE'
     and old.acted_by_user_id is not distinct from new.acted_by_user_id
     and old.acted_at is not distinct from new.acted_at
     and old.status is not distinct from new.status then
    return new;
  end if;

  select * into v_ctx from private.fn_current_action_context();
  v_employee_id:=coalesce(v_ctx.real_actor_employee_id,(select employee_id from public.app_users where id=new.acted_by_user_id));
  select full_name_ar into v_name from public.employees where id=v_employee_id;

  new.real_actor_employee_id:=v_employee_id;
  new.real_actor_name_snapshot:=v_name;
  new.acting_mode:=case when v_ctx.system_actor_user_id is null then 'system_recorded' else coalesce(v_ctx.acting_mode,'self') end;
  new.action_context_id:=v_ctx.action_context_id;
  return new;
end;
$$;

create or replace function private.fn_stamp_workflow_event_actor_context()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ctx record;
  v_employee_id uuid;
  v_name text;
begin
  if new.actor_user_id is null then return new; end if;
  select * into v_ctx from private.fn_current_action_context();
  v_employee_id:=coalesce(v_ctx.real_actor_employee_id,(select employee_id from public.app_users where id=new.actor_user_id));
  select full_name_ar into v_name from public.employees where id=v_employee_id;

  new.real_actor_employee_id:=v_employee_id;
  new.real_actor_name_snapshot:=v_name;
  new.acting_mode:=case when v_ctx.system_actor_user_id is null then 'system_recorded' else coalesce(v_ctx.acting_mode,'self') end;
  new.action_context_id:=v_ctx.action_context_id;
  return new;
end;
$$;

create or replace function private.fn_stamp_approval_actor_context()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ctx record;
  v_actor uuid;
  v_identity record;
  v_name text;
begin
  select * into v_ctx from private.fn_current_action_context();

  if v_ctx.acting_mode='on_behalf_of' and v_ctx.real_actor_employee_id is not null then
    v_actor:=v_ctx.real_actor_employee_id;
    new.acting_mode:='on_behalf_of';
    new.action_context_id:=v_ctx.action_context_id;
  else
    v_actor:=coalesce(new.actor_employee_id,v_ctx.real_actor_employee_id);
    new.acting_mode:=case
      when v_ctx.system_actor_user_id is null then coalesce(new.acting_mode,'system_recorded')
      when v_actor is not null and v_ctx.system_actor_employee_id is distinct from v_actor then 'explicit_actor'
      else 'self'
    end;
    new.action_context_id:=null;
  end if;

  new.actor_employee_id:=v_actor;
  if v_actor is not null then
    select * into v_identity from public.employee_identity_snapshot(v_actor);
    select full_name_ar into v_name from public.employees where id=v_actor;
    new.actor_name_snapshot:=v_name;
    new.actor_position_snapshot:=v_identity.board_role;
    new.actor_job_title_snapshot:=v_identity.job_title;
  end if;
  return new;
end;
$$;

revoke all on function private.fn_stamp_workflow_step_actor_context() from public,anon,authenticated;
revoke all on function private.fn_stamp_workflow_event_actor_context() from public,anon,authenticated;
revoke all on function private.fn_stamp_approval_actor_context() from public,anon,authenticated;

drop trigger if exists trg_stamp_workflow_step_actor_context on public.approval_workflow_steps;
create trigger trg_stamp_workflow_step_actor_context
before insert or update on public.approval_workflow_steps
for each row execute function private.fn_stamp_workflow_step_actor_context();

drop trigger if exists trg_stamp_workflow_event_actor_context on public.approval_workflow_events;
create trigger trg_stamp_workflow_event_actor_context
before insert on public.approval_workflow_events
for each row execute function private.fn_stamp_workflow_event_actor_context();

drop trigger if exists trg_stamp_approval_actor_context on public.approvals;
create trigger trg_stamp_approval_actor_context
before insert on public.approvals
for each row execute function private.fn_stamp_approval_actor_context();

create index if not exists idx_approval_steps_real_actor on public.approval_workflow_steps(real_actor_employee_id,acted_at desc);
create index if not exists idx_approval_events_real_actor on public.approval_workflow_events(real_actor_employee_id,created_at desc);
create index if not exists idx_approvals_action_context on public.approvals(action_context_id) where action_context_id is not null;

-- الحساب الرئيسي يرى كل ما ينتظر قرارًا، حتى لو كانت مرحلة محددة باسم مستخدم آخر؛
-- هذا لا يمنحه هوية ذلك المستخدم، بل يتيح له تنفيذ القرار مع توثيق «نيابة عن» عند تفعيل الوضع.
create or replace function public.fn_my_approval_inbox()
returns table(
  workflow_id uuid,
  workflow_no text,
  transaction_type text,
  label_ar text,
  source_label text,
  project_id uuid,
  amount numeric,
  status text,
  version_no integer,
  step_id uuid,
  step_order integer,
  target_group_label text,
  request_reason text,
  submitted_at timestamptz,
  origin_group_label text
)
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select
    w.id,w.workflow_no,w.transaction_type,p.label_ar,w.source_label,w.project_id,w.amount,w.status,w.version_no,
    s.id,s.step_order,s.target_group_label,s.request_reason,w.submitted_at,w.origin_group_label
  from public.approval_workflows w
  join public.approval_workflow_policies p on p.transaction_type=w.transaction_type
  join public.approval_workflow_steps s
    on s.workflow_id=w.id and s.version_no=w.version_no and s.status='pending'
  where w.status='pending'
    and (
      public.fn_is_primary_user()
      or (s.target_type='user' and s.target_user_id=auth.uid())
      or (
        s.target_type='capability'
        and public.has_capability(
          s.target_capability,
          case when w.project_id is null then 'all' else 'project' end,
          case when w.project_id is null then null else w.project_id::text end,
          w.amount
        )
      )
    )
  order by w.submitted_at;
end;
$$;

revoke all on function public.fn_my_approval_inbox() from public,anon;
grant execute on function public.fn_my_approval_inbox() to authenticated;

comment on function public.fn_set_my_action_context(boolean,uuid) is
  'زر الحالة الخاصة للحساب الرئيسي. الصلاحية تبقى لـ auth.uid، وصاحب الإجراء الحقيقي يؤخذ مركزيًا من system_access_settings.';
comment on function public.current_real_actor_employee_id() is
  'هوية صاحب الفعل الحقيقي في السياق الحالي؛ تُستخدم في أي وظيفة جديدة بدل افتراض أن auth.uid هو صاحب الفعل.';
