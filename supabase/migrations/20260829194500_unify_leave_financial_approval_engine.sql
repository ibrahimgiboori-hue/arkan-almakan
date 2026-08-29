-- توحيد طلبات الإجازة والمعاملات المالية داخل محرك الاعتماد المرجعي.
-- الهدف: approval_workflows هو صندوق القرار الرسمي الوحيد، بينما تبقى جداول المصدر
-- (leave_requests / financial_cases) هي سجل الحالة المتخصص لكل معاملة.

create table if not exists public.approval_workflow_stage_policies (
  transaction_type text not null references public.approval_workflow_policies(transaction_type) on delete cascade,
  stage_order smallint not null check (stage_order > 0),
  stage_key text not null,
  stage_label_ar text not null,
  target_mode text not null check (target_mode in ('capability','primary_user')),
  target_capability text,
  target_group_key text not null,
  target_group_label text not null,
  target_portal_key text check (target_portal_key is null or target_portal_key in ('projects','workforce','finance','documents','admin')),
  source_action text,
  is_final boolean not null default false,
  is_active boolean not null default true,
  primary key (transaction_type, stage_order),
  unique (transaction_type, stage_key),
  check (
    (target_mode='capability' and target_capability is not null)
    or (target_mode='primary_user' and target_capability is null)
  )
);

comment on table public.approval_workflow_stage_policies is
  'المراحل الإلزامية داخل محرك approval_workflows. لا تنشئ محركًا موازيًا؛ بل تصف تسلسل القرار الإجباري للأنواع التي تحتاج أكثر من مرحلة.';

alter table public.approval_workflow_stage_policies enable row level security;
revoke insert, update, delete on public.approval_workflow_stage_policies from anon, authenticated;

after_policy:
insert into public.approval_workflow_policies(
  transaction_type,label_ar,source_module,submit_capability,initial_target_capability,
  initial_target_group_key,initial_target_group_label,origin_counts_as_opinion,financial_mode,
  allow_additional,is_active,capability_key,source_table,allowed_source_statuses,
  source_status_on_submit,source_status_on_return,source_status_on_reject,source_status_on_final
)
values
(
  'leave_request','اعتماد طلب إجازة','hr','hr.leaves.create','hr.leaves.review',
  'module:workforce','الموارد البشرية',false,'none',false,true,'hr.leaves.create','leave_requests',
  array['draft','submitted']::text[],'submitted','draft','rejected','ceo_approved'
),
(
  'financial_case','اعتماد معاملة مالية','finance','finance.cases.create','finance.cases.approve',
  'module:finance','المالية',false,'mandatory',false,true,'finance.cases.create','financial_cases',
  array['submitted','in_review','returned_to_source']::text[],null,null,null,null
)
on conflict (transaction_type) do update set
  label_ar=excluded.label_ar,
  source_module=excluded.source_module,
  submit_capability=excluded.submit_capability,
  initial_target_capability=excluded.initial_target_capability,
  initial_target_group_key=excluded.initial_target_group_key,
  initial_target_group_label=excluded.initial_target_group_label,
  origin_counts_as_opinion=excluded.origin_counts_as_opinion,
  financial_mode=excluded.financial_mode,
  allow_additional=excluded.allow_additional,
  is_active=true,
  capability_key=excluded.capability_key,
  source_table=excluded.source_table,
  allowed_source_statuses=excluded.allowed_source_statuses,
  source_status_on_submit=excluded.source_status_on_submit,
  source_status_on_return=excluded.source_status_on_return,
  source_status_on_reject=excluded.source_status_on_reject,
  source_status_on_final=excluded.source_status_on_final,
  updated_at=now();

insert into public.approval_workflow_stage_policies(
  transaction_type,stage_order,stage_key,stage_label_ar,target_mode,target_capability,
  target_group_key,target_group_label,target_portal_key,source_action,is_final,is_active
)
values
  ('leave_request',1,'hr_review','مراجعة الموارد البشرية','capability','hr.leaves.review','module:workforce','الموارد البشرية','workforce','leave_hr_review',false,true),
  ('leave_request',2,'final_approval','الاعتماد النهائي','primary_user',null,'primary:system','الاعتماد النهائي','admin','leave_final_approval',true,true),
  ('financial_case',1,'finance_review','المراجعة والاعتماد المالي','capability','finance.cases.approve','module:finance','المالية','finance','financial_review',false,true),
  ('financial_case',2,'final_approval','الاعتماد النهائي','primary_user',null,'primary:system','الاعتماد النهائي','admin','financial_final_approval',true,true)
on conflict (transaction_type,stage_order) do update set
  stage_key=excluded.stage_key,
  stage_label_ar=excluded.stage_label_ar,
  target_mode=excluded.target_mode,
  target_capability=excluded.target_capability,
  target_group_key=excluded.target_group_key,
  target_group_label=excluded.target_group_label,
  target_portal_key=excluded.target_portal_key,
  source_action=excluded.source_action,
  is_final=excluded.is_final,
  is_active=true;

-- financial_cases لم يكن مسجلاً كمصدر قابل للإرسال للمحرك المرجعي.
insert into public.procedure_source_registry(
  source_key,schema_name,relation_name,relation_kind,id_column,status_column,project_column,
  capability_key,module_key,source_destination_key,financial_effect,aggregate_operation,confidence,
  discovery_reason,instrumentation_status,is_enabled,instrumented_at,financial_total_role,
  temporal_effect,legal_effect,printable_output,central_candidate,transaction_role,capture_mode,transaction_key
)
values(
  'public.financial_cases','public','financial_cases','table','id','status','project_id',
  'finance.cases.create','finance','finance',true,false,100,
  'معاملة مالية أصلية ذات دورة مراجعة واعتماد وصرف؛ مسجلة صراحة في المحرك المرجعي.',
  'instrumented',true,now(),'settlement',false,true,false,true,'primary','document_source','financial_case'
)
on conflict (schema_name,relation_name) do update set
  id_column=excluded.id_column,
  status_column=excluded.status_column,
  project_column=excluded.project_column,
  capability_key=excluded.capability_key,
  module_key=excluded.module_key,
  source_destination_key=excluded.source_destination_key,
  financial_effect=excluded.financial_effect,
  confidence=excluded.confidence,
  discovery_reason=excluded.discovery_reason,
  instrumentation_status='instrumented',
  is_enabled=true,
  instrumented_at=coalesce(public.procedure_source_registry.instrumented_at,now()),
  financial_total_role=excluded.financial_total_role,
  legal_effect=excluded.legal_effect,
  central_candidate=true,
  transaction_role=excluded.transaction_role,
  capture_mode=excluded.capture_mode,
  transaction_key=excluded.transaction_key,
  last_seen_at=now();

-- إنشاء مرحلة إلزامية تالية بحسب الدستور. المرحلة النهائية تستهدف المستخدم الأساسي حصريًا.
create or replace function private.fn_enqueue_required_approval_stage(
  p_workflow_id uuid,
  p_version_no integer,
  p_stage_order integer,
  p_requested_by uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_workflow public.approval_workflows;
  v_stage public.approval_workflow_stage_policies;
  v_target_user uuid;
  v_id uuid;
begin
  select * into v_workflow from public.approval_workflows where id=p_workflow_id;
  if v_workflow.id is null then raise exception 'دورة الاعتماد غير موجودة'; end if;

  select * into v_stage
  from public.approval_workflow_stage_policies
  where transaction_type=v_workflow.transaction_type
    and stage_order=p_stage_order
    and is_active
  limit 1;
  if v_stage.transaction_type is null then return null; end if;

  if exists(
    select 1 from public.approval_workflow_steps
    where workflow_id=p_workflow_id and version_no=p_version_no and step_order=p_stage_order
  ) then
    select id into v_id from public.approval_workflow_steps
    where workflow_id=p_workflow_id and version_no=p_version_no and step_order=p_stage_order;
    return v_id;
  end if;

  if v_stage.target_mode='primary_user' then
    select primary_user_id into v_target_user
    from public.system_access_settings
    where singleton=true;
    if v_target_user is null or not exists(select 1 from public.app_users where id=v_target_user and is_active) then
      raise exception 'لا يوجد مستخدم أساسي نشط لاستلام الاعتماد النهائي';
    end if;

    insert into public.approval_workflow_steps(
      workflow_id,version_no,step_order,target_type,target_user_id,target_capability,
      target_group_key,target_group_label,requested_by_user_id,request_reason,is_additional,target_portal_key
    ) values(
      p_workflow_id,p_version_no,p_stage_order,'user',v_target_user,null,
      v_stage.target_group_key,v_stage.target_group_label,p_requested_by,nullif(trim(coalesce(p_reason,'')),''),false,v_stage.target_portal_key
    ) returning id into v_id;
  else
    insert into public.approval_workflow_steps(
      workflow_id,version_no,step_order,target_type,target_user_id,target_capability,
      target_group_key,target_group_label,requested_by_user_id,request_reason,is_additional,target_portal_key
    ) values(
      p_workflow_id,p_version_no,p_stage_order,'capability',null,v_stage.target_capability,
      v_stage.target_group_key,v_stage.target_group_label,p_requested_by,nullif(trim(coalesce(p_reason,'')),''),false,v_stage.target_portal_key
    ) returning id into v_id;
  end if;

  insert into public.approval_workflow_events(workflow_id,version_no,step_id,event_type,actor_user_id,note,payload)
  values(
    p_workflow_id,p_version_no,v_id,'required_stage_queued',p_requested_by,p_reason,
    jsonb_build_object('stage_order',p_stage_order,'stage_key',v_stage.stage_key,'stage_label',v_stage.stage_label_ar)
  );

  return v_id;
end;
$$;

revoke all on function private.fn_enqueue_required_approval_stage(uuid,integer,integer,uuid,text) from public, anon, authenticated;

-- مزامنة نتيجة المرحلة مع سجل المصدر المتخصص دون إنشاء محرك حالة موازٍ.
create or replace function private.fn_apply_required_approval_stage_effect(
  p_workflow public.approval_workflows,
  p_step public.approval_workflow_steps,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_stage public.approval_workflow_stage_policies;
begin
  select * into v_stage
  from public.approval_workflow_stage_policies
  where transaction_type=p_workflow.transaction_type
    and stage_order=p_step.step_order
    and is_active
  limit 1;
  if v_stage.transaction_type is null or v_stage.source_action is null then return; end if;

  case v_stage.source_action
    when 'leave_hr_review' then
      update public.leave_requests
      set status='hr_reviewed'
      where id=p_workflow.source_id and status in ('submitted','draft');
    when 'leave_final_approval' then
      update public.leave_requests
      set status='ceo_approved'
      where id=p_workflow.source_id and status='hr_reviewed';
    when 'financial_review' then
      perform public.fn_financial_case_action(p_workflow.source_id,'finance_approve',p_comment,null,0,0);
    when 'financial_final_approval' then
      perform public.fn_financial_case_action(p_workflow.source_id,'final_approve',p_comment,null,0,0);
    else
      raise exception 'تأثير مرحلة الاعتماد غير معروف: %',v_stage.source_action;
  end case;
end;
$$;

revoke all on function private.fn_apply_required_approval_stage_effect(public.approval_workflows,public.approval_workflow_steps,text) from public, anon, authenticated;

-- مسار داخلي للأحداث التي أنشأها المصدر نفسه (مثل نسخة معاملة مالية جديدة).
-- لا يُمنح للواجهة؛ لذلك لا يمكن استخدامه لتجاوز submit_capability العامة.
create or replace function private.fn_approval_start_from_source_event(
  p_transaction_type text,
  p_source_table text,
  p_source_id uuid,
  p_source_label text,
  p_project_id uuid,
  p_amount numeric,
  p_snapshot jsonb,
  p_note text,
  p_origin_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_policy public.approval_workflow_policies;
  v_stage public.approval_workflow_stage_policies;
  v_workflow public.approval_workflows;
  v_origin_user uuid;
  v_origin record;
  v_no text;
  v_version integer;
  v_step uuid;
begin
  select * into v_policy
  from public.approval_workflow_policies
  where transaction_type=p_transaction_type and is_active
  limit 1;
  if v_policy.transaction_type is null then raise exception 'نوع دورة الاعتماد غير مدعوم'; end if;

  v_origin_user:=p_origin_user_id;
  if v_origin_user is null or not exists(select 1 from public.app_users where id=v_origin_user) then
    select primary_user_id into v_origin_user from public.system_access_settings where singleton=true;
  end if;
  if v_origin_user is null then raise exception 'تعذر تحديد منشئ دورة الاعتماد'; end if;

  select * into v_origin from private.fn_user_approval_group(v_origin_user);

  select * into v_workflow
  from public.approval_workflows
  where transaction_type=p_transaction_type and source_table=p_source_table and source_id=p_source_id
    and status in ('pending','returned')
  order by created_at desc
  limit 1
  for update;

  if v_workflow.id is not null and v_workflow.status='pending' then
    return v_workflow.id;
  end if;

  if v_workflow.id is null then
    v_no:=public.next_document_number('APPROVAL','APR');
    insert into public.approval_workflows(
      workflow_no,transaction_type,source_table,source_id,source_module,source_label,project_id,amount,
      status,version_no,origin_user_id,origin_group_key,origin_group_label,metadata
    ) values(
      v_no,p_transaction_type,p_source_table,p_source_id,v_policy.source_module,p_source_label,p_project_id,p_amount,
      'pending',1,v_origin_user,v_origin.group_key,v_origin.group_label,jsonb_build_object('financial_mode',v_policy.financial_mode,'source_event',true)
    ) returning * into v_workflow;
    v_version:=1;
  else
    v_version:=v_workflow.version_no+1;
    update public.approval_workflows
    set status='pending',version_no=v_version,source_label=p_source_label,project_id=p_project_id,amount=p_amount,
        origin_user_id=v_origin_user,origin_group_key=v_origin.group_key,origin_group_label=v_origin.group_label,
        submitted_at=now(),finalized_at=null,return_note=null,updated_at=now()
    where id=v_workflow.id
    returning * into v_workflow;
  end if;

  insert into public.approval_workflow_versions(workflow_id,version_no,snapshot,amount,submitted_by,note)
  values(v_workflow.id,v_version,coalesce(p_snapshot,'{}'::jsonb),p_amount,v_origin_user,p_note);

  select * into v_stage
  from public.approval_workflow_stage_policies
  where transaction_type=p_transaction_type and stage_order=1 and is_active
  limit 1;

  if v_stage.transaction_type is null then
    insert into public.approval_workflow_steps(
      workflow_id,version_no,step_order,target_type,target_capability,target_group_key,target_group_label,
      requested_by_user_id,request_reason,is_additional
    ) values(
      v_workflow.id,v_version,1,'capability',v_policy.initial_target_capability,
      v_policy.initial_target_group_key,v_policy.initial_target_group_label,v_origin_user,p_note,false
    ) returning id into v_step;
  elsif v_stage.target_mode='primary_user' then
    perform private.fn_enqueue_required_approval_stage(v_workflow.id,v_version,1,v_origin_user,p_note);
    select id into v_step from public.approval_workflow_steps
    where workflow_id=v_workflow.id and version_no=v_version and step_order=1;
  else
    insert into public.approval_workflow_steps(
      workflow_id,version_no,step_order,target_type,target_capability,target_group_key,target_group_label,
      requested_by_user_id,request_reason,is_additional,target_portal_key
    ) values(
      v_workflow.id,v_version,1,'capability',v_stage.target_capability,v_stage.target_group_key,v_stage.target_group_label,
      v_origin_user,p_note,false,v_stage.target_portal_key
    ) returning id into v_step;
  end if;

  insert into public.approval_workflow_events(workflow_id,version_no,step_id,event_type,actor_user_id,note,payload)
  values(v_workflow.id,v_version,v_step,'submitted_from_source',v_origin_user,p_note,jsonb_build_object('amount',p_amount,'source_event',true));

  return v_workflow.id;
end;
$$;

revoke all on function private.fn_approval_start_from_source_event(text,text,uuid,text,uuid,numeric,jsonb,text,uuid) from public, anon, authenticated;

-- كل نسخة مالية جديدة/معادة للمصدر تعيد فتح نفس دورة الاعتماد (بنسخة جديدة) بدل نظام توجيه مستقل.
create or replace function private.trg_financial_case_version_to_approval()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_case public.financial_cases;
  v_label text;
begin
  select * into v_case from public.financial_cases where id=new.case_id;
  if v_case.id is null then return new; end if;
  if v_case.status not in ('submitted','in_review','returned_to_source') then return new; end if;

  v_label:=concat_ws(' — ',nullif(v_case.case_no,''),coalesce(nullif(v_case.counterparty_name,''),nullif(v_case.source_label,''),'معاملة مالية'));
  perform private.fn_approval_start_from_source_event(
    'financial_case','financial_cases',v_case.id,v_label,v_case.project_id,new.requested_amount,
    jsonb_build_object('case',to_jsonb(v_case),'financial_version',to_jsonb(new)),new.source_note,
    coalesce(new.submitted_by,v_case.created_by)
  );
  return new;
end;
$$;

revoke all on function private.trg_financial_case_version_to_approval() from public, anon, authenticated;

drop trigger if exists trg_financial_case_version_to_approval on public.financial_case_versions;
create trigger trg_financial_case_version_to_approval
after insert on public.financial_case_versions
for each row execute function private.trg_financial_case_version_to_approval();

-- قرار الاعتماد: إن كان للنوع مراحل إلزامية، لا يسمح بتجاوز المرحلة التالية يدويًا.
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
  v_required_next public.approval_workflow_stage_policies;
  v_next_group_key text;
  v_next_group_label text;
  v_next_module text;
  v_step integer;
  v_emp uuid;
  v_position text;
  v_job text;
  v_role public.user_role;
  v_final_action boolean:=false;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_decision not in ('approve','return','reject') then raise exception 'القرار غير مدعوم'; end if;

  select * into w from public.approval_workflows where id=p_workflow_id for update;
  if w.id is null or w.status<>'pending' then raise exception 'المعاملة ليست بانتظار قرار'; end if;
  select * into s from private.fn_current_approval_step(w.id);
  if s.id is null then raise exception 'لا توجد مرحلة اعتماد معلقة'; end if;

  if s.target_type='user' then
    if s.target_user_id<>v_uid and not public.fn_is_primary_user() then
      raise exception 'هذه المرحلة مسندة حصريًا إلى مستخدم آخر';
    end if;
  else
    if not public.has_capability(
      s.target_capability,
      case when w.project_id is null then 'all' else 'project' end,
      case when w.project_id is null then null else w.project_id::text end,
      w.amount
    ) then raise exception 'لا تملك صلاحية القرار في هذه المرحلة'; end if;
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

    if w.transaction_type='financial_case' then
      perform public.fn_financial_case_action(w.source_id,'return_to_source',p_comment,null,0,0);
    else
      perform private.fn_source_on_return(w,false);
    end if;

  elsif p_decision='reject' then
    update public.approval_workflow_steps
    set status='rejected',acted_by_user_id=v_uid,decision_comment=trim(p_comment),acted_at=now()
    where id=s.id;
    update public.approval_workflows
    set status='rejected',finalized_at=now(),updated_at=now()
    where id=w.id;

    if w.transaction_type='financial_case' then
      perform public.fn_financial_case_action(w.source_id,'cancel',p_comment,null,0,0);
    else
      perform private.fn_source_on_return(w,true);
    end if;

  else
    select * into v_required_next
    from public.approval_workflow_stage_policies
    where transaction_type=w.transaction_type
      and stage_order=s.step_order+1
      and is_active
    limit 1;

    if v_required_next.transaction_type is not null and (p_next_user_id is not null or p_next_capability is not null) then
      raise exception 'لهذه المعاملة مرحلة إلزامية تالية؛ لا يمكن تجاوزها بإحالة يدوية';
    end if;

    update public.approval_workflow_steps
    set status='approved',acted_by_user_id=v_uid,decision_comment=nullif(trim(p_comment),''),acted_at=now()
    where id=s.id;

    perform private.fn_apply_required_approval_stage_effect(w,s,p_comment);

    if v_required_next.transaction_type is not null then
      perform private.fn_enqueue_required_approval_stage(w.id,w.version_no,s.step_order+1,v_uid,p_next_reason);
      update public.approval_workflows set updated_at=now() where id=w.id;
    elsif p_next_user_id is not null or p_next_capability is not null then
      if not p.allow_additional then raise exception 'هذه المعاملة لا تسمح بإضافة اعتماد آخر'; end if;
      if not public.has_capability('system.approvals.route','all',null,w.amount) then raise exception 'لا تملك صلاحية إضافة مسار اعتماد'; end if;
      if p_next_user_id is not null and p_next_capability is not null then raise exception 'اختر شخصًا أو جهة اعتماد، وليس كليهما'; end if;

      if p_next_user_id is not null then
        if p_next_user_id=v_uid then raise exception 'لا يمكن إحالة الاعتماد إلى نفسك'; end if;
        if not exists(select 1 from public.app_users where id=p_next_user_id and is_active) then raise exception 'المستخدم المختار غير نشط'; end if;
        select * into g from private.fn_user_approval_group(p_next_user_id);
        v_next_group_key:=g.group_key;
        v_next_group_label:=g.group_label;
      else
        select c.module_key into v_next_module
        from public.permission_capabilities c
        where c.capability_key=p_next_capability and c.is_active;
        if v_next_module is null then raise exception 'جهة الاعتماد غير صحيحة'; end if;
        v_next_group_key:='module:'||v_next_module;
        v_next_group_label:=case v_next_module when 'finance' then 'المالية' when 'projects' then 'إدارة المشاريع' when 'hr' then 'الموارد البشرية' else v_next_module end;
      end if;

      if exists(select 1 from public.approval_workflow_steps x where x.workflow_id=w.id and x.version_no=w.version_no and x.target_group_key=v_next_group_key) then
        raise exception 'هذه الجهة شاركت بالفعل في مسار هذه النسخة ولا يمكن إضافتها مرة أخرى';
      end if;
      if p.origin_counts_as_opinion and w.origin_group_key=v_next_group_key then
        raise exception 'لا يمكن إعادة المعاملة إلى جهة المصدر كاعتماد إضافي على نفس النسخة';
      end if;
      if p_next_user_id is not null and (
        exists(select 1 from public.approval_workflow_steps x where x.workflow_id=w.id and x.version_no=w.version_no and x.acted_by_user_id=p_next_user_id)
        or (p.origin_counts_as_opinion and w.origin_user_id=p_next_user_id)
      ) then raise exception 'هذا الشخص شارك بالفعل في قرار هذه النسخة'; end if;

      select coalesce(max(step_order),0)+1 into v_step
      from public.approval_workflow_steps
      where workflow_id=w.id and version_no=w.version_no;

      insert into public.approval_workflow_steps(
        workflow_id,version_no,step_order,target_type,target_user_id,target_capability,target_group_key,target_group_label,
        requested_by_user_id,request_reason,is_additional
      ) values(
        w.id,w.version_no,v_step,case when p_next_user_id is not null then 'user' else 'capability' end,
        p_next_user_id,p_next_capability,v_next_group_key,v_next_group_label,v_uid,nullif(trim(p_next_reason),''),true
      );
    else
      update public.approval_workflows
      set status='approved',finalized_at=now(),updated_at=now()
      where id=w.id;
      perform private.fn_finalize_approval_source(w);
      v_final_action:=true;
    end if;
  end if;

  select au.employee_id,au.role,e.board_role,e.job_title
    into v_emp,v_role,v_position,v_job
  from public.app_users au
  left join public.employees e on e.id=au.employee_id
  where au.id=v_uid;

  insert into public.approvals(
    entity_table,entity_id,step_order,step_role,decision,decided_by,decided_at,comment,
    actor_employee_id,actor_position_snapshot,actor_job_title_snapshot,approval_method,decision_date,
    recorded_by_user_id,recorded_at,source,stage_code,stage_label_snapshot,action_code,action_label_snapshot,
    is_final_action,scenario_snapshot,workflow_id,workflow_version,workflow_step_id
  ) values(
    w.source_table,w.source_id,s.step_order,v_role,
    case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
    v_uid,now(),p_comment,v_emp,v_position,v_job,'electronic',current_date,v_uid,now(),'live','dynamic_approval',s.target_group_label,
    p_decision,case p_decision when 'approve' then 'اعتماد' when 'reject' then 'رفض' else 'إرجاع للتعديل' end,
    v_final_action,'dynamic',w.id,w.version_no,s.id
  );

  insert into public.approval_workflow_events(workflow_id,version_no,step_id,event_type,actor_user_id,note,payload)
  values(
    w.id,w.version_no,s.id,p_decision,v_uid,p_comment,
    jsonb_build_object(
      'next_user_id',p_next_user_id,
      'next_capability',p_next_capability,
      'next_group',v_next_group_label,
      'required_next_stage',case when v_required_next.transaction_type is null then null else v_required_next.stage_key end
    )
  );

  return (select status from public.approval_workflows where id=w.id);
end;
$$;

revoke all on function public.fn_approval_decide(uuid,text,text,uuid,text,text) from public, anon;
grant execute on function public.fn_approval_decide(uuid,text,text,uuid,text,text) to authenticated;

-- تفاصيل الصندوق تعرف الآن إن كانت المرحلة الحالية نهائية أم وسيطة.
create or replace function public.fn_approval_get(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $$
declare
  w public.approval_workflows;
  p public.approval_workflow_policies;
  s public.approval_workflow_steps;
  v_stage public.approval_workflow_stage_policies;
  v_snapshot jsonb;
  v_steps jsonb;
  v_events jsonb;
  v_can_route boolean;
  v_can_act boolean;
  v_is_final_stage boolean:=true;
  v_stage_label text;
begin
  if auth.uid() is null or not private.fn_can_read_approval_workflow(p_workflow_id,auth.uid()) then
    raise exception 'لا تملك صلاحية عرض هذه المعاملة';
  end if;

  select * into w from public.approval_workflows where id=p_workflow_id;
  select * into p from public.approval_workflow_policies where transaction_type=w.transaction_type;
  select snapshot into v_snapshot from public.approval_workflow_versions where workflow_id=w.id and version_no=w.version_no;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'step_order',x.step_order,'target_type',x.target_type,'target_user_id',x.target_user_id,
    'target_capability',x.target_capability,'target_group_key',x.target_group_key,'target_group_label',x.target_group_label,
    'request_reason',x.request_reason,'status',x.status,'acted_by_user_id',x.acted_by_user_id,
    'decision_comment',x.decision_comment,'acted_at',x.acted_at,'is_additional',x.is_additional
  ) order by x.step_order),'[]'::jsonb)
  into v_steps
  from public.approval_workflow_steps x
  where x.workflow_id=w.id and x.version_no=w.version_no;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type',e.event_type,'actor_user_id',e.actor_user_id,'note',e.note,'created_at',e.created_at,'payload',e.payload
  ) order by e.created_at),'[]'::jsonb)
  into v_events
  from public.approval_workflow_events e
  where e.workflow_id=w.id and e.version_no=w.version_no;

  select * into s from private.fn_current_approval_step(w.id);
  v_can_act:=s.id is not null and (
    s.target_user_id=auth.uid()
    or (s.target_type='capability' and public.has_capability(
      s.target_capability,
      case when w.project_id is null then 'all' else 'project' end,
      case when w.project_id is null then null else w.project_id::text end,
      w.amount
    ))
    or public.fn_is_primary_user()
  );

  if s.id is not null then
    select * into v_stage
    from public.approval_workflow_stage_policies
    where transaction_type=w.transaction_type and stage_order=s.step_order and is_active
    limit 1;
    if v_stage.transaction_type is not null then
      v_is_final_stage:=v_stage.is_final;
      v_stage_label:=v_stage.stage_label_ar;
    else
      v_is_final_stage:=true;
      v_stage_label:=s.target_group_label;
    end if;
  end if;

  v_can_route:=v_can_act
    and coalesce(p.allow_additional,true)
    and not exists(
      select 1 from public.approval_workflow_stage_policies sp
      where sp.transaction_type=w.transaction_type and sp.is_active
    )
    and public.has_capability('system.approvals.route','all',null,w.amount);

  return jsonb_build_object(
    'workflow',to_jsonb(w),'snapshot',v_snapshot,'steps',v_steps,'events',v_events,
    'can_act',v_can_act,'can_route',v_can_route,
    'is_final_stage',v_is_final_stage,'current_stage_label',v_stage_label
  );
end;
$$;

revoke all on function public.fn_approval_get(uuid) from public, anon;
grant execute on function public.fn_approval_get(uuid) to authenticated;

-- إلغاء الإجازة يلغي أيضًا دورة الاعتماد المفتوحة حتى لا يبقى عنصر ميت في الصندوق.
create or replace function public.cancel_leave(p_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.leave_requests;
  v_actor_role public.user_role;
  v_workflow public.approval_workflows;
  v_step public.approval_workflow_steps;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from public.leave_requests where id=p_id for update;
  if v_row.id is null then raise exception 'طلب الإجازة غير موجود'; end if;
  if v_row.status in ('cancelled','rejected') then raise exception 'الطلب مغلق بالفعل'; end if;
  if not (v_row.employee_id=public.current_employee_id() and v_row.status in ('draft','submitted'))
     and not public.has_employee_capability('hr.leaves.cancel',v_row.employee_id,null) then
    raise exception 'لا تملك صلاحية إلغاء هذا الطلب';
  end if;

  select coalesce((select role from public.app_users where id=auth.uid()),'supervisor'::public.user_role)
    into v_actor_role;

  select * into v_workflow
  from public.approval_workflows
  where transaction_type='leave_request' and source_table='leave_requests' and source_id=p_id
    and status in ('pending','returned')
  order by created_at desc limit 1 for update;

  if v_workflow.id is not null then
    select * into v_step from private.fn_current_approval_step(v_workflow.id);
    update public.approval_workflow_steps
    set status='cancelled',acted_by_user_id=auth.uid(),decision_comment=nullif(trim(p_reason),''),acted_at=now()
    where workflow_id=v_workflow.id and version_no=v_workflow.version_no and status='pending';
    update public.approval_workflows
    set status='cancelled',finalized_at=now(),updated_at=now(),return_note=nullif(trim(p_reason),'')
    where id=v_workflow.id;
    insert into public.approval_workflow_events(workflow_id,version_no,step_id,event_type,actor_user_id,note,payload)
    values(v_workflow.id,v_workflow.version_no,v_step.id,'cancelled',auth.uid(),nullif(trim(p_reason),''),'{}'::jsonb);
  end if;

  update public.leave_requests set status='cancelled' where id=p_id;
  insert into public.approvals(
    entity_table,entity_id,step_order,step_role,decision,decided_by,decided_at,comment,
    source,stage_code,stage_label_snapshot,action_code,action_label_snapshot,is_final_action,scenario_snapshot,
    workflow_id,workflow_version,workflow_step_id
  ) values(
    'leave_requests',p_id,
    coalesce((select max(step_order)+1 from public.approvals where entity_table='leave_requests' and entity_id=p_id),1),
    v_actor_role,'cancelled',auth.uid(),now(),nullif(trim(p_reason),''),'live','cancel','إلغاء','cancel','إلغاء الطلب',true,'normal',
    v_workflow.id,v_workflow.version_no,v_step.id
  );
  return true;
end;
$$;

-- ترحيل الحالات المفتوحة الموجودة قبل التوحيد مرة واحدة، دون إعادة كتابة تاريخ الحالات المغلقة.
do $$
declare
  r record;
  v_primary uuid;
begin
  select primary_user_id into v_primary from public.system_access_settings where singleton=true;

  for r in
    select lr.*,e.full_name_ar
    from public.leave_requests lr
    left join public.employees e on e.id=lr.employee_id
    where lr.record_source<>'historical_paper'
      and lr.status='submitted'
      and not exists(
        select 1 from public.approval_workflows w
        where w.source_table='leave_requests' and w.source_id=lr.id and w.transaction_type='leave_request'
      )
  loop
    perform private.fn_approval_start_from_source_event(
      'leave_request','leave_requests',r.id,
      concat_ws(' — ',nullif(r.request_no,''),coalesce(nullif(r.full_name_ar,''),'طلب إجازة')),
      null,null,to_jsonb(r),r.reason,coalesce(r.created_by,r.recorded_by_user_id,v_primary)
    );
  end loop;

  for r in
    select fc.*,fv.source_snapshot,fv.requested_amount,fv.source_note,fv.submitted_by
    from public.financial_cases fc
    join public.financial_case_versions fv on fv.case_id=fc.id and fv.version_no=fc.current_version_no
    where fc.status in ('submitted','in_review')
      and not exists(
        select 1 from public.approval_workflows w
        where w.source_table='financial_cases' and w.source_id=fc.id and w.transaction_type='financial_case'
      )
  loop
    perform private.fn_approval_start_from_source_event(
      'financial_case','financial_cases',r.id,
      concat_ws(' — ',nullif(r.case_no,''),coalesce(nullif(r.counterparty_name,''),nullif(r.source_label,''),'معاملة مالية')),
      r.project_id,r.requested_amount,
      jsonb_build_object('case',to_jsonb(r)-'source_snapshot'-'requested_amount'-'source_note'-'submitted_by','financial_version_snapshot',r.source_snapshot),
      r.source_note,coalesce(r.submitted_by,r.created_by,v_primary)
    );
  end loop;
end;
$$;
