-- توحيد «اعتماداتي» وقرار الاعتماد مع سياق «تنفيذ نيابة عن».
-- القاعدة: الحساب المسجل يظل صاحب الصلاحية النظامية، لكن «صاحب الإجراء الحالي» هو
-- المستخدم المرتبط بالشخص المُمثَّل عند تفعيل النيابة. كل أسطح الاعتماد تستخدم نفس الحكم.

alter table public.approval_workflows
  add column if not exists origin_real_actor_employee_id uuid references public.employees(id),
  add column if not exists origin_real_actor_name_snapshot text,
  add column if not exists origin_acting_mode text,
  add column if not exists origin_action_context_id uuid;

alter table public.approval_workflow_versions
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

create or replace function private.fn_stamp_workflow_origin_context()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ctx record;
begin
  if tg_op='UPDATE'
     and old.origin_user_id is not distinct from new.origin_user_id
     and old.version_no is not distinct from new.version_no
     and old.submitted_at is not distinct from new.submitted_at then
    return new;
  end if;

  select * into v_ctx from private.fn_current_action_context();
  new.origin_real_actor_employee_id:=v_ctx.real_actor_employee_id;
  new.origin_real_actor_name_snapshot:=v_ctx.real_actor_name;
  new.origin_acting_mode:=case
    when v_ctx.system_actor_user_id is null then 'system_recorded'
    else coalesce(v_ctx.acting_mode,'self')
  end;
  new.origin_action_context_id:=v_ctx.action_context_id;
  return new;
end;
$$;

create or replace function private.fn_stamp_workflow_version_actor_context()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from private.fn_current_action_context();
  new.real_actor_employee_id:=v_ctx.real_actor_employee_id;
  new.real_actor_name_snapshot:=v_ctx.real_actor_name;
  new.acting_mode:=case
    when v_ctx.system_actor_user_id is null then 'system_recorded'
    else coalesce(v_ctx.acting_mode,'self')
  end;
  new.action_context_id:=v_ctx.action_context_id;
  return new;
end;
$$;

revoke all on function private.fn_stamp_workflow_origin_context() from public,anon,authenticated;
revoke all on function private.fn_stamp_workflow_version_actor_context() from public,anon,authenticated;

drop trigger if exists trg_stamp_workflow_origin_context on public.approval_workflows;
create trigger trg_stamp_workflow_origin_context
before insert or update on public.approval_workflows
for each row execute function private.fn_stamp_workflow_origin_context();

drop trigger if exists trg_stamp_workflow_version_actor_context on public.approval_workflow_versions;
create trigger trg_stamp_workflow_version_actor_context
before insert on public.approval_workflow_versions
for each row execute function private.fn_stamp_workflow_version_actor_context();

-- حكم مركزي واحد: هل صاحب الإجراء الحالي يستطيع اتخاذ هذه المرحلة؟
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
  v_effective_user uuid;
  v_scope_type text;
  v_scope_key text;
begin
  if auth.uid() is null then return false; end if;

  select * into w from public.approval_workflows where id=p_workflow_id;
  select * into s from public.approval_workflow_steps where id=p_step_id and workflow_id=p_workflow_id;
  if w.id is null or s.id is null or w.status<>'pending' or s.status<>'pending' then return false; end if;

  select * into v_ctx from private.fn_current_action_context();
  v_effective_user:=case
    when v_ctx.acting_mode='on_behalf_of' then v_ctx.real_actor_user_id
    else auth.uid()
  end;

  if s.target_type='user' then
    return v_effective_user is not null and s.target_user_id=v_effective_user;
  end if;

  if s.target_type<>'capability' or s.target_capability is null then return false; end if;
  v_scope_type:=case when w.project_id is null then 'all' else 'project' end;
  v_scope_key:=case when w.project_id is null then null else w.project_id::text end;

  if v_ctx.acting_mode='on_behalf_of' then
    -- الصلاحية النظامية ما زالت للحساب الرئيسي، لكن لا ننسب قرارًا لشخص لا تدخل هذه المرحلة ضمن عمله.
    return public.fn_is_primary_user()
      and v_effective_user is not null
      and private.fn_user_has_assigned_capability(v_effective_user,s.target_capability,v_scope_type,v_scope_key,w.amount);
  end if;

  return public.has_capability(s.target_capability,v_scope_type,v_scope_key,w.amount);
end;
$$;

revoke all on function private.fn_current_actor_can_take_approval_step(uuid,uuid) from public,anon,authenticated;

-- «اعتماداتي» = ما ينتظر صاحب الإجراء الحالي فقط.
-- الحساب الرئيسي في وضعه العادي لا يحول الصفحة إلى شاشة مراقبة شاملة؛ المراقبة مكانها الحوكمة.
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
    and private.fn_current_actor_can_take_approval_step(w.id,s.id)
  order by w.submitted_at;
end;
$$;

revoke all on function public.fn_my_approval_inbox() from public,anon;
grant execute on function public.fn_my_approval_inbox() to authenticated;

create or replace function public.fn_approval_get(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $$
declare
  w public.approval_workflows;
  v_snapshot jsonb;
  v_steps jsonb;
  v_events jsonb;
  v_can_route boolean;
  v_can_act boolean;
  s public.approval_workflow_steps;
  v_ctx record;
begin
  if auth.uid() is null or not private.fn_can_read_approval_workflow(p_workflow_id,auth.uid()) then
    raise exception 'لا تملك صلاحية عرض هذه المعاملة';
  end if;

  select * into w from public.approval_workflows where id=p_workflow_id;
  select snapshot into v_snapshot
  from public.approval_workflow_versions
  where workflow_id=w.id and version_no=w.version_no;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,
    'step_order',x.step_order,
    'target_type',x.target_type,
    'target_user_id',x.target_user_id,
    'target_capability',x.target_capability,
    'target_group_key',x.target_group_key,
    'target_group_label',x.target_group_label,
    'request_reason',x.request_reason,
    'status',x.status,
    'acted_by_user_id',x.acted_by_user_id,
    'real_actor_employee_id',x.real_actor_employee_id,
    'real_actor_name_snapshot',x.real_actor_name_snapshot,
    'acting_mode',x.acting_mode,
    'action_context_id',x.action_context_id,
    'decision_comment',x.decision_comment,
    'acted_at',x.acted_at,
    'is_additional',x.is_additional
  ) order by x.step_order),'[]'::jsonb)
  into v_steps
  from public.approval_workflow_steps x
  where x.workflow_id=w.id and x.version_no=w.version_no;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type',e.event_type,
    'actor_user_id',e.actor_user_id,
    'real_actor_employee_id',e.real_actor_employee_id,
    'real_actor_name_snapshot',e.real_actor_name_snapshot,
    'acting_mode',e.acting_mode,
    'action_context_id',e.action_context_id,
    'note',e.note,
    'created_at',e.created_at,
    'payload',e.payload
  ) order by e.created_at),'[]'::jsonb)
  into v_events
  from public.approval_workflow_events e
  where e.workflow_id=w.id and e.version_no=w.version_no;

  select * into s from private.fn_current_approval_step(w.id);
  v_can_act:=s.id is not null and private.fn_current_actor_can_take_approval_step(w.id,s.id);
  v_can_route:=v_can_act and public.has_capability('system.approvals.route','all',null,w.amount);
  select * into v_ctx from private.fn_current_action_context();

  return jsonb_build_object(
    'workflow',to_jsonb(w),
    'snapshot',v_snapshot,
    'steps',v_steps,
    'events',v_events,
    'can_act',v_can_act,
    'can_route',v_can_route,
    'acting_mode',coalesce(v_ctx.acting_mode,'self'),
    'real_actor_employee_id',v_ctx.real_actor_employee_id,
    'real_actor_name',v_ctx.real_actor_name,
    'action_context_id',v_ctx.action_context_id
  );
end;
$$;

create or replace function public.fn_approval_decide(
  p_workflow_id uuid,
  p_decision text,
  p_comment text default null,
  p_next_user_id uuid default null,
  p_next_capability text default null,
  p_next_reason text default null
)
returns text
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  w public.approval_workflows;
  s public.approval_workflow_steps;
  p public.approval_workflow_policies;
  g record;
  v_ctx record;
  v_next_group_key text;
  v_next_group_label text;
  v_next_module text;
  v_step integer;
  v_effective_user uuid;
  v_emp uuid;
  v_position text;
  v_job text;
  v_role public.user_role;
  v_next_employee uuid;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_decision not in ('approve','return','reject') then raise exception 'القرار غير مدعوم'; end if;

  select * into w from public.approval_workflows where id=p_workflow_id for update;
  if w.id is null or w.status<>'pending' then raise exception 'المعاملة ليست بانتظار قرار'; end if;
  select * into s from private.fn_current_approval_step(w.id);
  if s.id is null then raise exception 'لا توجد مرحلة اعتماد معلقة'; end if;

  select * into v_ctx from private.fn_current_action_context();
  v_effective_user:=case when v_ctx.acting_mode='on_behalf_of' then v_ctx.real_actor_user_id else v_uid end;

  if not private.fn_current_actor_can_take_approval_step(w.id,s.id) then
    if s.target_type='user' then
      raise exception 'هذه المرحلة ليست مسندة إلى صاحب الإجراء الحالي';
    end if;
    raise exception 'صاحب الإجراء الحالي لا يملك أهلية القرار في هذه المرحلة';
  end if;

  select * into p from public.approval_workflow_policies where transaction_type=w.transaction_type;
  if p_decision in ('return','reject') and nullif(trim(coalesce(p_comment,'')),'') is null then
    raise exception 'التبرير مطلوب';
  end if;

  if p_decision='return' then
    update public.approval_workflow_steps
    set status='returned',acted_by_user_id=v_uid,decision_comment=trim(p_comment),acted_at=now()
    where id=s.id;
    update public.approval_workflows
    set status='returned',return_note=trim(p_comment),updated_at=now()
    where id=w.id;
    perform private.fn_source_on_return(w,false);
  elsif p_decision='reject' then
    update public.approval_workflow_steps
    set status='rejected',acted_by_user_id=v_uid,decision_comment=trim(p_comment),acted_at=now()
    where id=s.id;
    update public.approval_workflows
    set status='rejected',finalized_at=now(),updated_at=now()
    where id=w.id;
    perform private.fn_source_on_return(w,true);
  else
    update public.approval_workflow_steps
    set status='approved',acted_by_user_id=v_uid,decision_comment=nullif(trim(p_comment),''),acted_at=now()
    where id=s.id;

    if p_next_user_id is not null or p_next_capability is not null then
      if not p.allow_additional then raise exception 'هذه المعاملة لا تسمح بإضافة اعتماد آخر'; end if;
      if not public.has_capability('system.approvals.route','all',null,w.amount) then
        raise exception 'لا تملك صلاحية إضافة مسار اعتماد';
      end if;
      if p_next_user_id is not null and p_next_capability is not null then
        raise exception 'اختر شخصًا أو جهة اعتماد، وليس كليهما';
      end if;

      if p_next_user_id is not null then
        -- «نفسك» هنا = صاحب الإجراء الفعلي، وليس مجرد الحساب الذي ضغط الزر.
        if p_next_user_id=v_effective_user then raise exception 'لا يمكن إحالة الاعتماد إلى صاحب الإجراء نفسه'; end if;
        select employee_id into v_next_employee
        from public.app_users where id=p_next_user_id and is_active;
        if v_next_employee is null and not exists(select 1 from public.app_users where id=p_next_user_id and is_active) then
          raise exception 'المستخدم المختار غير نشط';
        end if;
        select * into g from private.fn_user_approval_group(p_next_user_id);
        v_next_group_key:=g.group_key;
        v_next_group_label:=g.group_label;
      else
        select c.module_key into v_next_module
        from public.permission_capabilities c
        where c.capability_key=p_next_capability and c.is_active;
        if v_next_module is null then raise exception 'جهة الاعتماد غير صحيحة'; end if;
        v_next_group_key:='module:'||v_next_module;
        v_next_group_label:=case v_next_module
          when 'finance' then 'المالية'
          when 'projects' then 'إدارة المشاريع'
          when 'hr' then 'الموارد البشرية'
          else v_next_module end;
      end if;

      if exists(
        select 1 from public.approval_workflow_steps x
        where x.workflow_id=w.id and x.version_no=w.version_no and x.target_group_key=v_next_group_key
      ) then
        raise exception 'هذه الجهة شاركت بالفعل في مسار هذه النسخة ولا يمكن إضافتها مرة أخرى';
      end if;
      if p.origin_counts_as_opinion and w.origin_group_key=v_next_group_key then
        raise exception 'لا يمكن إعادة المعاملة إلى جهة المصدر كاعتماد إضافي على نفس النسخة';
      end if;

      if p_next_user_id is not null and (
        exists(
          select 1 from public.approval_workflow_steps x
          where x.workflow_id=w.id and x.version_no=w.version_no
            and (
              x.acted_by_user_id=p_next_user_id
              or (v_next_employee is not null and x.real_actor_employee_id=v_next_employee)
            )
        )
        or (
          p.origin_counts_as_opinion and (
            w.origin_user_id=p_next_user_id
            or (v_next_employee is not null and w.origin_real_actor_employee_id=v_next_employee)
          )
        )
      ) then
        raise exception 'هذا الشخص شارك بالفعل في قرار هذه النسخة';
      end if;

      select coalesce(max(step_order),0)+1 into v_step
      from public.approval_workflow_steps
      where workflow_id=w.id and version_no=w.version_no;

      insert into public.approval_workflow_steps(
        workflow_id,version_no,step_order,target_type,target_user_id,target_capability,
        target_group_key,target_group_label,requested_by_user_id,request_reason,is_additional
      ) values(
        w.id,w.version_no,v_step,
        case when p_next_user_id is not null then 'user' else 'capability' end,
        p_next_user_id,p_next_capability,v_next_group_key,v_next_group_label,v_uid,
        nullif(trim(p_next_reason),''),true
      );
    else
      update public.approval_workflows
      set status='approved',finalized_at=now(),updated_at=now()
      where id=w.id;
      perform private.fn_finalize_approval_source(w);
    end if;
  end if;

  -- الدور/الصفة تخص صاحب القرار الحقيقي؛ decided_by/recorded_by يظلان الحساب النظامي المسجل.
  select au.employee_id,au.role,e.board_role,e.job_title
  into v_emp,v_role,v_position,v_job
  from public.app_users au
  left join public.employees e on e.id=au.employee_id
  where au.id=coalesce(v_effective_user,v_uid);

  insert into public.approvals(
    entity_table,entity_id,step_order,step_role,decision,decided_by,decided_at,comment,
    actor_employee_id,actor_position_snapshot,actor_job_title_snapshot,approval_method,decision_date,
    recorded_by_user_id,recorded_at,source,stage_code,stage_label_snapshot,action_code,action_label_snapshot,
    is_final_action,scenario_snapshot,workflow_id,workflow_version,workflow_step_id
  ) values(
    w.source_table,w.source_id,s.step_order,v_role,
    case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
    v_uid,now(),p_comment,v_emp,v_position,v_job,'electronic',current_date,v_uid,now(),'live',
    'dynamic_approval',s.target_group_label,p_decision,
    case p_decision when 'approve' then 'اعتماد' when 'reject' then 'رفض' else 'إرجاع للتعديل' end,
    (p_decision='approve' and p_next_user_id is null and p_next_capability is null),
    'dynamic',w.id,w.version_no,s.id
  );

  insert into public.approval_workflow_events(
    workflow_id,version_no,step_id,event_type,actor_user_id,note,payload
  ) values(
    w.id,w.version_no,s.id,p_decision,v_uid,p_comment,
    jsonb_build_object(
      'next_user_id',p_next_user_id,
      'next_capability',p_next_capability,
      'next_group',v_next_group_label,
      'effective_actor_user_id',v_effective_user,
      'acting_mode',coalesce(v_ctx.acting_mode,'self')
    )
  );

  return (select status from public.approval_workflows where id=w.id);
end;
$$;

comment on function private.fn_current_actor_can_take_approval_step(uuid,uuid) is
  'الحكم المركزي المستخدم بواسطة inbox/details/decision حتى لا تعرض الواجهة قرارًا لا يستطيع RPC تنفيذه، ويصبح وضع النيابة سياقيًا للشخص المُمثَّل.';
