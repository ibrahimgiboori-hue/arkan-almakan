-- Payroll approval batches: the monthly payroll run is the ledger; approval is sent for selected employees only.
-- No payroll line may be silently duplicated across approval batches. Returned/rejected batches are resubmitted as the same batch.

create table if not exists public.payroll_approval_batches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete restrict,
  batch_no text not null unique,
  status text not null default 'draft' check (status in ('draft','submitted','returned','approved','rejected','cancelled')),
  employee_count integer not null default 0 check (employee_count >= 0),
  total_gross numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  total_net numeric(14,2) not null default 0,
  note text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  real_actor_employee_id uuid references public.employees(id) on delete set null,
  real_actor_name_snapshot text,
  acting_mode text,
  action_context_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_approval_batch_lines (
  batch_id uuid not null references public.payroll_approval_batches(id) on delete cascade,
  payroll_line_id uuid not null references public.payroll_lines(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  gross_snapshot numeric(14,2) not null default 0,
  deductions_snapshot numeric(14,2) not null default 0,
  net_snapshot numeric(14,2) not null default 0,
  line_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (batch_id,payroll_line_id),
  unique (payroll_line_id)
);

create index if not exists payroll_approval_batches_run_idx
  on public.payroll_approval_batches(run_id,created_at desc);
create index if not exists payroll_approval_batch_lines_employee_idx
  on public.payroll_approval_batch_lines(employee_id);

alter table public.payroll_approval_batches enable row level security;
alter table public.payroll_approval_batch_lines enable row level security;

-- Transaction constitution: the batch is the governed transaction source; the monthly run remains the workbook/ledger.
insert into public.transaction_definitions(
  transaction_key,label_ar,module_key,resource_key,description_ar,
  has_temporal_effect,has_financial_effect,has_legal_effect,has_printable_output,is_periodic_or_aggregate,
  route_template,default_movement_kind,allow_request,allow_approval,allow_assignment,allow_inquiry,general_scope,is_active,
  requires_action,default_action_kind,default_target_destination_key,default_action_note,
  completion_source_statuses,completion_mode,execution_engine,completion_allowed_from_statuses,protected_source_statuses
) values (
  'payroll_batch','دفعة رواتب','hr','payroll','معاملة اعتماد لرواتب موظفين محددين من مسير شهر واحد.',
  true,true,true,true,true,
  'undecided','choose',true,true,false,true,'both',true,
  true,'request','finance','يرجى طلب التعميد وصرف رواتب الموظفين المحددين',
  array['submitted']::text[],'gated','approval_workflow',array['draft','returned','rejected']::text[],array['approved']::text[]
)
on conflict (transaction_key) do update set
  label_ar=excluded.label_ar,module_key=excluded.module_key,resource_key=excluded.resource_key,description_ar=excluded.description_ar,
  has_temporal_effect=excluded.has_temporal_effect,has_financial_effect=excluded.has_financial_effect,
  has_legal_effect=excluded.has_legal_effect,has_printable_output=excluded.has_printable_output,
  is_periodic_or_aggregate=excluded.is_periodic_or_aggregate,requires_action=excluded.requires_action,
  default_action_kind=excluded.default_action_kind,default_target_destination_key=excluded.default_target_destination_key,
  default_action_note=excluded.default_action_note,completion_source_statuses=excluded.completion_source_statuses,
  completion_mode=excluded.completion_mode,execution_engine=excluded.execution_engine,
  completion_allowed_from_statuses=excluded.completion_allowed_from_statuses,protected_source_statuses=excluded.protected_source_statuses,
  is_active=true,updated_at=now();

insert into public.procedure_source_registry(
  source_key,schema_name,relation_name,relation_kind,id_column,amount_column,status_column,
  capability_key,module_key,source_destination_key,financial_effect,aggregate_operation,confidence,
  discovery_reason,instrumentation_status,is_enabled,instrumented_at,
  temporal_effect,legal_effect,printable_output,central_candidate,transaction_role,capture_mode,transaction_key
) values (
  'public.payroll_approval_batches','public','payroll_approval_batches','table','id','total_net','status',
  'hr.payroll.submit','hr','workforce',true,true,100,
  'selected payroll approval batch','instrumented',true,now(),
  true,true,true,true,'primary','source_write','payroll_batch'
)
on conflict (source_key) do update set
  relation_name=excluded.relation_name,id_column=excluded.id_column,amount_column=excluded.amount_column,status_column=excluded.status_column,
  capability_key=excluded.capability_key,module_key=excluded.module_key,source_destination_key=excluded.source_destination_key,
  financial_effect=excluded.financial_effect,aggregate_operation=excluded.aggregate_operation,confidence=excluded.confidence,
  instrumentation_status='instrumented',is_enabled=true,instrumented_at=coalesce(public.procedure_source_registry.instrumented_at,now()),
  temporal_effect=excluded.temporal_effect,legal_effect=excluded.legal_effect,
  printable_output=excluded.printable_output,central_candidate=excluded.central_candidate,transaction_role=excluded.transaction_role,
  capture_mode=excluded.capture_mode,transaction_key=excluded.transaction_key,last_seen_at=now();

insert into public.transaction_hooks(transaction_key,source_table,source_event,source_capability_key,role,is_blocking,is_active)
select 'payroll_batch','payroll_approval_batches','write','hr.payroll.submit','primary',true,true
where not exists (
  select 1 from public.transaction_hooks
  where transaction_key='payroll_batch' and source_table='payroll_approval_batches' and source_event='write' and role='primary'
);

insert into public.approval_workflow_policies(
  transaction_type,label_ar,source_module,submit_capability,initial_target_capability,
  initial_target_group_key,initial_target_group_label,origin_counts_as_opinion,financial_mode,allow_additional,is_active,
  capability_key,source_table,allowed_source_statuses,source_status_on_submit,source_status_on_return,source_status_on_reject,source_status_on_final
) values (
  'payroll_batch','اعتماد دفعة رواتب','hr','hr.payroll.submit','finance.payroll.review',
  'module:finance','المالية',true,'mandatory',true,true,
  'hr.payroll.submit','payroll_approval_batches',array['submitted']::text[],null,'returned','rejected','approved'
)
on conflict (transaction_type) do update set
  label_ar=excluded.label_ar,source_module=excluded.source_module,submit_capability=excluded.submit_capability,
  initial_target_capability=excluded.initial_target_capability,initial_target_group_key=excluded.initial_target_group_key,
  initial_target_group_label=excluded.initial_target_group_label,origin_counts_as_opinion=excluded.origin_counts_as_opinion,
  financial_mode=excluded.financial_mode,allow_additional=excluded.allow_additional,is_active=true,
  capability_key=excluded.capability_key,source_table=excluded.source_table,allowed_source_statuses=excluded.allowed_source_statuses,
  source_status_on_submit=excluded.source_status_on_submit,source_status_on_return=excluded.source_status_on_return,
  source_status_on_reject=excluded.source_status_on_reject,source_status_on_final=excluded.source_status_on_final,updated_at=now();

drop trigger if exists arkan_procedure_runtime_capture on public.payroll_approval_batches;
create trigger arkan_procedure_runtime_capture
after insert or update on public.payroll_approval_batches
for each row execute function private.fn_procedure_runtime_capture();

drop trigger if exists trg_audit_payroll_approval_batches on public.payroll_approval_batches;
create trigger trg_audit_payroll_approval_batches
after insert or update or delete on public.payroll_approval_batches
for each row execute function public.fn_audit();

create or replace function private.fn_refresh_payroll_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_count integer;
  v_gross numeric;
  v_ded numeric;
  v_net numeric;
begin
  update public.payroll_approval_batch_lines bl
  set employee_id=pl.employee_id,
      gross_snapshot=pl.gross_pay,
      deductions_snapshot=pl.total_deductions,
      net_snapshot=pl.net_pay,
      line_snapshot=to_jsonb(pl),
      updated_at=now()
  from public.payroll_lines pl
  where bl.batch_id=p_batch_id and pl.id=bl.payroll_line_id;

  select count(*),coalesce(sum(gross_snapshot),0),coalesce(sum(deductions_snapshot),0),coalesce(sum(net_snapshot),0)
    into v_count,v_gross,v_ded,v_net
  from public.payroll_approval_batch_lines
  where batch_id=p_batch_id;

  update public.payroll_approval_batches
  set employee_count=v_count,total_gross=v_gross,total_deductions=v_ded,total_net=v_net,updated_at=now()
  where id=p_batch_id;
end;
$$;

create or replace function public.fn_payroll_batch_overview(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_batches jsonb;
  v_states jsonb;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not public.fn_is_primary_user()
     and not public.has_capability('hr.payroll.view','all',null,null)
     and not public.has_capability('finance.payroll.view','all',null,null) then
    raise exception 'لا تملك صلاحية عرض الرواتب';
  end if;

  select coalesce(jsonb_agg(x.obj order by x.created_at desc),'[]'::jsonb)
    into v_batches
  from (
    select b.created_at,
      jsonb_build_object(
        'id',b.id,'batch_no',b.batch_no,'status',b.status,'employee_count',b.employee_count,
        'total_gross',b.total_gross,'total_deductions',b.total_deductions,'total_net',b.total_net,
        'note',b.note,'created_at',b.created_at,
        'workflow_id',w.id,'workflow_no',w.workflow_no,'workflow_status',w.status,
        'return_note',w.return_note,'workflow_version',w.version_no
      ) as obj
    from public.payroll_approval_batches b
    left join lateral (
      select aw.id,aw.workflow_no,aw.status,aw.return_note,aw.version_no
      from public.approval_workflows aw
      where aw.source_table='payroll_approval_batches' and aw.source_id=b.id
      order by aw.created_at desc limit 1
    ) w on true
    where b.run_id=p_run_id
  ) x;

  select coalesce(jsonb_object_agg(bl.payroll_line_id::text,
    jsonb_build_object(
      'batch_id',b.id,'batch_no',b.batch_no,'batch_status',b.status,
      'editable',b.status in ('returned','rejected'),
      'locked',b.status in ('submitted','approved'),
      'workflow_status',w.status,'return_note',w.return_note
    )),'{}'::jsonb)
    into v_states
  from public.payroll_approval_batch_lines bl
  join public.payroll_approval_batches b on b.id=bl.batch_id
  left join lateral (
    select aw.status,aw.return_note
    from public.approval_workflows aw
    where aw.source_table='payroll_approval_batches' and aw.source_id=b.id
    order by aw.created_at desc limit 1
  ) w on true
  where b.run_id=p_run_id;

  return jsonb_build_object('batches',v_batches,'line_states',v_states);
end;
$$;

create or replace function public.fn_submit_payroll_batch(p_run_id uuid,p_line_ids uuid[],p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_batch uuid;
  v_batch_no text;
  v_ids uuid[];
  v_expected integer;
  v_found integer;
  v_ctx record;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not public.fn_is_primary_user() and not public.has_capability('hr.payroll.submit','all',null,null) then
    raise exception 'لا تملك صلاحية إرسال الرواتب';
  end if;
  if not exists(select 1 from public.payroll_runs where id=p_run_id) then raise exception 'مسير الرواتب غير موجود'; end if;

  select array_agg(distinct x) into v_ids from unnest(coalesce(p_line_ids,array[]::uuid[])) x where x is not null;
  v_expected:=coalesce(array_length(v_ids,1),0);
  if v_expected=0 then raise exception 'حدد موظفًا واحدًا على الأقل'; end if;

  select count(*) into v_found from public.payroll_lines where run_id=p_run_id and id=any(v_ids);
  if v_found<>v_expected then raise exception 'بعض صفوف الرواتب المحددة لا تنتمي إلى هذا المسير'; end if;

  if exists(
    select 1 from public.payroll_approval_batch_lines bl
    where bl.payroll_line_id=any(v_ids)
  ) then
    raise exception 'يوجد موظف محدد مرتبط بالفعل بمعاملة رواتب سابقة؛ أعد إرسال معاملته الأصلية إذا كانت معادة للتعديل';
  end if;

  select * into v_ctx from private.fn_current_action_context();
  v_batch_no:=public.next_document_number('PAYROLL_BATCH','PRB');

  insert into public.payroll_approval_batches(
    run_id,batch_no,status,note,created_by_user_id,real_actor_employee_id,real_actor_name_snapshot,acting_mode,action_context_id
  ) values (
    p_run_id,v_batch_no,'draft',nullif(trim(coalesce(p_note,'')),''),v_uid,
    v_ctx.real_actor_employee_id,v_ctx.real_actor_name,v_ctx.acting_mode,v_ctx.action_context_id
  ) returning id into v_batch;

  insert into public.payroll_approval_batch_lines(
    batch_id,payroll_line_id,employee_id,gross_snapshot,deductions_snapshot,net_snapshot,line_snapshot
  )
  select v_batch,pl.id,pl.employee_id,pl.gross_pay,pl.total_deductions,pl.net_pay,to_jsonb(pl)
  from public.payroll_lines pl
  where pl.run_id=p_run_id and pl.id=any(v_ids);

  perform private.fn_refresh_payroll_batch(v_batch);
  perform public.fn_submit_transaction_source('payroll_approval_batches',v_batch,'submitted');
  return v_batch;
end;
$$;

create or replace function public.fn_resubmit_payroll_batch(p_batch_id uuid,p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_status text;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not public.fn_is_primary_user() and not public.has_capability('hr.payroll.submit','all',null,null) then
    raise exception 'لا تملك صلاحية إعادة إرسال الرواتب';
  end if;

  select status into v_status from public.payroll_approval_batches where id=p_batch_id for update;
  if v_status is null then raise exception 'معاملة الرواتب غير موجودة'; end if;
  if v_status not in ('returned','rejected') then raise exception 'هذه المعاملة ليست معادة للتعديل'; end if;

  perform private.fn_refresh_payroll_batch(p_batch_id);
  update public.payroll_approval_batches
  set note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=p_batch_id;
  perform public.fn_submit_transaction_source('payroll_approval_batches',p_batch_id,'submitted');
  return p_batch_id;
end;
$$;

grant execute on function public.fn_payroll_batch_overview(uuid) to authenticated;
grant execute on function public.fn_submit_payroll_batch(uuid,uuid[],text) to authenticated;
grant execute on function public.fn_resubmit_payroll_batch(uuid,text) to authenticated;