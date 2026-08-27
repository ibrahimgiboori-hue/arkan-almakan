-- Canonical approval registration without trusting browser-supplied financial/business data.
-- approval_workflows remains the canonical workflow engine.

alter table public.approval_workflow_policies
  add column if not exists capability_key text,
  add column if not exists source_table text,
  add column if not exists allowed_source_statuses text[],
  add column if not exists source_status_on_submit text,
  add column if not exists source_status_on_return text,
  add column if not exists source_status_on_reject text,
  add column if not exists source_status_on_final text;

create unique index if not exists approval_workflow_policies_capability_source_uq
  on public.approval_workflow_policies(capability_key,source_table)
  where capability_key is not null and source_table is not null;

comment on column public.approval_workflow_policies.capability_key is
  'Explicit business capability for universal registration. Combined with source_table; capability alone is not unique.';
comment on column public.approval_workflow_policies.source_table is
  'Explicit source relation for this business operation. Prevents one capability shared by many tables from becoming ambiguous.';

create or replace function private.fn_apply_policy_source_status(
  p_workflow public.approval_workflows,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_policy public.approval_workflow_policies;
  v_registry public.procedure_source_registry;
begin
  if p_status is null or p_workflow.id is null then return; end if;

  select * into v_policy
  from public.approval_workflow_policies
  where transaction_type=p_workflow.transaction_type;

  if v_policy.source_table is null or v_policy.source_table<>p_workflow.source_table then return; end if;

  select * into v_registry
  from public.procedure_source_registry
  where schema_name='public'
    and relation_name=p_workflow.source_table
    and is_enabled
    and id_column is not null
    and status_column is not null
  order by confidence desc
  limit 1;

  if v_registry.source_key is null then
    raise exception 'لا يوجد عقد مصدر موثوق لتحديث حالة المعاملة %',p_workflow.source_table;
  end if;

  execute format(
    'update %I.%I set %I=%L where %I=$1',
    v_registry.schema_name,v_registry.relation_name,v_registry.status_column,p_status,v_registry.id_column
  ) using p_workflow.source_id;
end;
$$;

revoke all on function private.fn_apply_policy_source_status(public.approval_workflows,text) from public, anon;

create or replace function public.fn_universal_submit_for_approval(
  p_capability_key text,
  p_source_table text,
  p_source_id uuid,
  p_source_label text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_policy public.approval_workflow_policies;
  v_registry public.procedure_source_registry;
  v_snapshot jsonb;
  v_amount numeric;
  v_project_id uuid;
  v_status text;
  v_label text;
  v_workflow uuid;
  v_workflow_row public.approval_workflows;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_source_id is null or nullif(trim(coalesce(p_source_table,'')),'') is null then
    raise exception 'مرجع المعاملة مطلوب';
  end if;

  select * into v_policy
  from public.approval_workflow_policies
  where capability_key=p_capability_key
    and source_table=p_source_table
    and is_active
  limit 1;

  if v_policy.transaction_type is null then
    raise exception 'لا توجد سياسة اعتماد موحّدة لهذا المصدر وهذه الصلاحية';
  end if;

  select * into v_registry
  from public.procedure_source_registry
  where schema_name='public'
    and relation_name=p_source_table
    and capability_key=p_capability_key
    and is_enabled
    and instrumentation_status='instrumented'
    and id_column is not null
  order by confidence desc
  limit 1;

  if v_registry.source_key is null then
    raise exception 'المصدر غير مسجل بعقد تشغيل موثوق';
  end if;

  execute format(
    'select to_jsonb(t) from %I.%I t where %I=$1',
    v_registry.schema_name,v_registry.relation_name,v_registry.id_column
  ) into v_snapshot using p_source_id;

  if v_snapshot is null then raise exception 'المعاملة غير موجودة'; end if;

  if v_registry.amount_column is not null then
    begin
      v_amount:=nullif(v_snapshot->>v_registry.amount_column,'')::numeric;
    exception when others then
      raise exception 'تعذر قراءة مبلغ المعاملة من المصدر الحقيقي';
    end;
  end if;

  if v_registry.project_column is not null then
    begin
      v_project_id:=nullif(v_snapshot->>v_registry.project_column,'')::uuid;
    exception when others then
      raise exception 'تعذر قراءة مشروع المعاملة من المصدر الحقيقي';
    end;
  end if;

  if v_registry.status_column is not null then
    v_status:=v_snapshot->>v_registry.status_column;
  end if;

  if v_policy.allowed_source_statuses is not null
     and not (coalesce(v_status,'')=any(v_policy.allowed_source_statuses)) then
    raise exception 'لا يمكن إرسال المعاملة للاعتماد من حالتها الحالية: %',coalesce(v_status,'—');
  end if;

  v_label:=coalesce(nullif(trim(p_source_label),''),v_policy.label_ar,p_source_table);

  v_workflow:=private.fn_approval_start(
    v_policy.transaction_type,
    p_source_table,
    p_source_id,
    v_label,
    v_project_id,
    v_amount,
    v_snapshot || jsonb_build_object(
      '_operation',jsonb_build_object(
        'capability_key',p_capability_key,
        'source_table',p_source_table,
        'registered_by',v_uid,
        'registered_at',now()
      )
    ),
    p_note
  );

  if v_policy.source_status_on_submit is not null then
    select * into v_workflow_row from public.approval_workflows where id=v_workflow;
    perform private.fn_apply_policy_source_status(v_workflow_row,v_policy.source_status_on_submit);
  end if;

  return v_workflow;
end;
$$;

revoke all on function public.fn_universal_submit_for_approval(text,text,uuid,text,text) from public, anon;
grant execute on function public.fn_universal_submit_for_approval(text,text,uuid,text,text) to authenticated;

comment on function public.fn_universal_submit_for_approval(text,text,uuid,text,text) is
  'Canonical registration adapter. Reads amount/project/status/snapshot from the source row in DB; browser cannot supply authoritative business values.';

create or replace function public.fn_create_procedure_action(
  p_capability_key text,
  p_source_table text,
  p_source_id uuid,
  p_source_label text,
  p_current_destination_key text default null,
  p_destination_key text default null,
  p_scope_type text default 'all',
  p_scope_key text default null,
  p_amount numeric default null,
  p_project_id uuid default null,
  p_note text default null,
  p_source_route text default null,
  p_target_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_opt record;
  v_source_dest text;
  v_source_portal text;
  v_target_portal text;
  v_assignee uuid;
  v_task uuid;
  v_due timestamptz;
  v_policy public.approval_workflow_policies;
  v_expected_destination text;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_source_id is null or nullif(trim(coalesce(p_source_table,'')),'') is null then raise exception 'مرجع المعاملة مطلوب'; end if;
  if not public.has_capability(p_capability_key,p_scope_type,p_scope_key,p_amount) and not public.fn_is_primary_user() then
    raise exception 'لا تملك صلاحية إنشاء هذا الإجراء';
  end if;

  select * into v_policy
  from public.approval_workflow_policies
  where capability_key=p_capability_key and source_table=p_source_table and is_active
  limit 1;

  if v_policy.transaction_type is not null then
    if p_target_user_id is not null then
      raise exception 'هذه العملية تستخدم سياسة اعتماد مؤسسية ولا تسمح بتجاوزها بتحديد مستخدم من الشاشة';
    end if;

    if v_policy.initial_target_group_key like 'module:%' then
      v_expected_destination:=split_part(v_policy.initial_target_group_key,':',2);
    end if;
    if p_destination_key is not null and v_expected_destination is not null and p_destination_key<>v_expected_destination then
      raise exception 'الوجهة المختارة لا تطابق سياسة الاعتماد المعتمدة لهذه العملية';
    end if;

    return public.fn_universal_submit_for_approval(
      p_capability_key,p_source_table,p_source_id,p_source_label,p_note
    );
  end if;

  select coalesce(pr.source_destination_key,private.fn_route_source_destination(pc.module_key))
    into v_source_dest
  from public.permission_capabilities pc
  left join public.procedure_route_policies pr on pr.capability_key=pc.capability_key
  where pc.capability_key=p_capability_key and pc.is_active;
  if v_source_dest is null then raise exception 'العملية غير معروفة في دستور الصلاحيات'; end if;

  select * into v_opt
  from public.fn_procedure_route_options(p_capability_key,coalesce(p_current_destination_key,v_source_dest),p_scope_type,p_scope_key,p_amount)
  where destination_key=coalesce(p_destination_key,destination_key)
  order by is_mandatory desc,option_kind
  limit 1;
  if v_opt.destination_key is null then raise exception 'لا يوجد مسار مسموح لهذه العملية في مرحلتها الحالية'; end if;

  select portal_key into v_source_portal from public.procedure_destinations where destination_key=v_source_dest;
  select portal_key into v_target_portal from public.procedure_destinations where destination_key=v_opt.destination_key;
  if v_opt.option_kind='higher_authority' then v_target_portal:=v_source_portal; end if;

  v_assignee:=v_opt.default_target_user_id;
  if p_target_user_id is not null then
    if not coalesce(v_opt.allow_specific_user,false) then raise exception 'هذا المسار لا يسمح بتحديد شخص'; end if;
    if not exists(select 1 from public.app_users where id=p_target_user_id and is_active) then raise exception 'المستخدم المختار غير نشط'; end if;
    v_assignee:=p_target_user_id;
  end if;
  if v_opt.sla_hours is not null then v_due:=now()+make_interval(hours=>v_opt.sla_hours); end if;

  if exists(select 1 from public.workspace_tasks t where t.source_table=p_source_table and t.source_id=p_source_id and t.source_capability_key=p_capability_key and t.status not in('completed','closed','cancelled')) then
    raise exception 'يوجد إجراء مفتوح بالفعل لهذه المعاملة';
  end if;

  insert into public.workspace_tasks(
    task_type,title,description,creator_user_id,assignee_user_id,status,priority,due_at,project_id,
    communication_kind,portal_key,work_source,source_route,source_label,source_portal_key,target_portal_key,target_capability,
    source_table,source_id,source_capability_key,current_destination_key
  ) values(
    'request',concat(coalesce(v_opt.action_type,'إجراء'),' — ',coalesce(nullif(trim(p_source_label),''),'معاملة')),
    nullif(trim(coalesce(p_note,'')),''),v_uid,v_assignee,'new','normal',v_due,p_project_id,
    'action_request',v_target_portal,'procedure',p_source_route,p_source_label,v_source_portal,v_target_portal,v_opt.target_capability,
    p_source_table,p_source_id,p_capability_key,v_opt.destination_key
  ) returning id into v_task;
  return v_task;
end;
$$;

revoke all on function public.fn_create_procedure_action(text,text,uuid,text,text,text,text,text,numeric,uuid,text,text,uuid) from public, anon;
grant execute on function public.fn_create_procedure_action(text,text,uuid,text,text,text,text,text,numeric,uuid,text,text,uuid) to authenticated;

create or replace function private.fn_finalize_approval_source(p_workflow public.approval_workflows)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_terms integer;
  v_status text;
begin
  if p_workflow.transaction_type='project_setup' then
    update public.projects set contract_value=round(coalesce(p_workflow.amount,0),2),updated_at=now() where id=p_workflow.source_id;
  elsif p_workflow.transaction_type='timesheet_week' then
    update public.timesheet_weeks set status='ceo_approved' where id=p_workflow.source_id;
  elsif p_workflow.transaction_type='progress_claim' then
    select coalesce(payment_terms_days,0) into v_terms from public.projects where id=p_workflow.project_id;
    update public.progress_claims set status='submitted',submitted_at=current_date,due_date=case when v_terms>0 then current_date+v_terms else null end where id=p_workflow.source_id;
  elsif p_workflow.transaction_type='contractor_expense' then
    null;
  elsif p_workflow.transaction_type='change_order' then
    perform private.fn_finalize_change_order(p_workflow.source_id);
  end if;

  select source_status_on_final into v_status
  from public.approval_workflow_policies
  where transaction_type=p_workflow.transaction_type;
  if v_status is not null then
    perform private.fn_apply_policy_source_status(p_workflow,v_status);
  end if;
end;
$$;

create or replace function private.fn_source_on_return(p_workflow public.approval_workflows,p_rejected boolean)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_status text;
begin
  if p_workflow.transaction_type='timesheet_week' then
    update public.timesheet_weeks set status=case when p_rejected then 'rejected'::public.request_status else 'draft'::public.request_status end where id=p_workflow.source_id;
  elsif p_workflow.transaction_type='progress_claim' and p_rejected then
    update public.progress_claims set status='rejected' where id=p_workflow.source_id;
  elsif p_workflow.transaction_type='change_order' then
    update public.change_orders set status=case when p_rejected then 'rejected'::public.request_status else 'draft'::public.request_status end where id=p_workflow.source_id;
  end if;

  select case when p_rejected then source_status_on_reject else source_status_on_return end
    into v_status
  from public.approval_workflow_policies
  where transaction_type=p_workflow.transaction_type;
  if v_status is not null then
    perform private.fn_apply_policy_source_status(p_workflow,v_status);
  end if;
end;
$$;

insert into public.approval_workflow_policies(
  transaction_type,label_ar,source_module,submit_capability,initial_target_capability,
  initial_target_group_key,initial_target_group_label,origin_counts_as_opinion,financial_mode,
  allow_additional,is_active,capability_key,source_table,allowed_source_statuses,
  source_status_on_submit,source_status_on_return,source_status_on_reject,source_status_on_final
)
values(
  'disciplinary_action','اعتماد إجراء تأديبي','hr','hr.disciplinary.create','finance.cases.review',
  'module:finance','المالية',true,'mandatory',false,true,'hr.disciplinary.create','disciplinary_actions',
  array['draft','submitted','rejected']::text[],'submitted','draft','rejected','accountant_approved'
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
  is_active=excluded.is_active,
  capability_key=excluded.capability_key,
  source_table=excluded.source_table,
  allowed_source_statuses=excluded.allowed_source_statuses,
  source_status_on_submit=excluded.source_status_on_submit,
  source_status_on_return=excluded.source_status_on_return,
  source_status_on_reject=excluded.source_status_on_reject,
  source_status_on_final=excluded.source_status_on_final,
  updated_at=now();

update public.procedure_source_registry
set reviewed_at=coalesce(reviewed_at,now())
where schema_name='public'
  and relation_name='disciplinary_actions'
  and capability_key='hr.disciplinary.create';
