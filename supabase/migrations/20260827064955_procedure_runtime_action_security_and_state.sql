create or replace function public.fn_procedure_runtime_state(p_source_table text,p_source_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_row record; begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select i.*,r.capability_key,r.financial_total_role,r.aggregate_operation,r.confidence,r.discovery_reason
    into v_row
  from public.procedure_runtime_index i
  join public.procedure_source_registry r on r.source_key=i.source_key
  where i.source_table=p_source_table and i.source_id=p_source_id and r.is_enabled
  order by i.last_seen_at desc limit 1;
  if not found then return null; end if;
  if not (public.fn_is_primary_user()
    or (v_row.capability_key is not null and public.has_capability(v_row.capability_key,case when v_row.project_id is null then 'all' else 'project' end,v_row.project_id::text,v_row.original_amount))
    or (v_row.financial_effect and public.has_capability('finance.cases.view',case when v_row.project_id is null then 'all' else 'project' end,v_row.project_id::text,v_row.original_amount))
    or public.has_capability('system.approvals.view','all',null,null)) then
    raise exception 'لا تملك صلاحية قراءة حالة هذه المعاملة';
  end if;
  return jsonb_build_object(
    'runtime_id',v_row.id,'source_key',v_row.source_key,'source_table',v_row.source_table,'source_id',v_row.source_id,
    'capability_key',v_row.capability_key,'financial_effect',v_row.financial_effect,'financial_total_role',v_row.financial_total_role,
    'aggregate_operation',v_row.aggregate_operation,'confidence',v_row.confidence,'discovery_reason',v_row.discovery_reason,
    'procedure_status',v_row.procedure_status,'inquiry_status',v_row.inquiry_status,'last_source_status',v_row.last_source_status,
    'original_amount',v_row.original_amount,'settled_amount',v_row.settled_amount,'outstanding_amount',greatest(v_row.original_amount-v_row.settled_amount,0),
    'settlement_status',case when not v_row.financial_effect then 'not_applicable' when v_row.original_amount<=0 then 'none' when v_row.settled_amount<=0 then 'unsettled' when v_row.settled_amount<v_row.original_amount then 'partial' else 'settled' end,
    'project_id',v_row.project_id,'group_ref',v_row.group_ref,'last_seen_at',v_row.last_seen_at
  );
end;
$$;

create or replace function public.fn_procedure_runtime_action(
  p_source_table text,
  p_source_id uuid,
  p_action text,
  p_note text default null,
  p_settled_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_row record;
  v_before jsonb;
  v_scope_type text;
  v_scope_key text;
  v_source_allowed boolean:=false;
  v_finance_allowed boolean:=false;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select i.*,r.capability_key into v_row
  from public.procedure_runtime_index i join public.procedure_source_registry r on r.source_key=i.source_key
  where i.source_table=p_source_table and i.source_id=p_source_id and r.is_enabled
  order by i.last_seen_at desc limit 1 for update of i;
  if not found then raise exception 'المعاملة غير موجودة في فهرس الإجراءات'; end if;
  v_scope_type:=case when v_row.project_id is null then 'all' else 'project' end;
  v_scope_key:=v_row.project_id::text;
  v_source_allowed:=v_row.capability_key is not null and public.has_capability(v_row.capability_key,v_scope_type,v_scope_key,v_row.original_amount);
  v_finance_allowed:=v_row.financial_effect and (
    public.has_capability('finance.cases.review',v_scope_type,v_scope_key,v_row.original_amount)
    or public.has_capability('finance.cases.approve',v_scope_type,v_scope_key,v_row.original_amount)
    or public.has_capability('finance.treasury.pay',v_scope_type,v_scope_key,v_row.original_amount)
  );
  if not public.fn_is_primary_user() then
    if p_action in ('settle','set_settled_amount') and not v_finance_allowed then raise exception 'تسوية الأثر المالي تتطلب صلاحية مالية'; end if;
    if p_action not in ('settle','set_settled_amount') and not (v_source_allowed or v_finance_allowed or public.has_capability('system.approvals.route','all',null,null)) then raise exception 'لا تملك صلاحية اتخاذ إجراء على هذه المعاملة'; end if;
  end if;
  v_before:=to_jsonb(v_row);

  if p_action='completed' then
    update public.procedure_runtime_index set procedure_status='done',completed_at=coalesce(completed_at,now()),last_seen_at=now() where id=v_row.id;
  elsif p_action='reopen' then
    update public.procedure_runtime_index set procedure_status='under_processing',completed_at=null,last_seen_at=now() where id=v_row.id;
  elsif p_action='inquiry_open' then
    if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'نص الاستفسار مطلوب'; end if;
    update public.procedure_runtime_index set inquiry_status='open',last_seen_at=now() where id=v_row.id;
  elsif p_action='inquiry_answered' then
    update public.procedure_runtime_index set inquiry_status='answered',last_seen_at=now() where id=v_row.id;
  elsif p_action='settle' then
    if not v_row.financial_effect then raise exception 'هذه العملية بلا أثر مالي'; end if;
    update public.procedure_runtime_index set settled_amount=original_amount,settled_at=now(),last_seen_at=now() where id=v_row.id;
  elsif p_action='set_settled_amount' then
    if not v_row.financial_effect then raise exception 'هذه العملية بلا أثر مالي'; end if;
    if p_settled_amount is null or p_settled_amount<0 then raise exception 'المبلغ المسوى غير صحيح'; end if;
    update public.procedure_runtime_index set settled_amount=least(original_amount,p_settled_amount),settled_at=case when p_settled_amount>=original_amount then now() else settled_at end,last_seen_at=now() where id=v_row.id;
  else
    raise exception 'إجراء غير مدعوم';
  end if;

  insert into public.procedure_runtime_events(runtime_id,event_type,actor_user_id,note,payload)
  values(v_row.id,p_action,v_uid,nullif(btrim(coalesce(p_note,'')),''),jsonb_build_object('before',v_before,'settled_amount',p_settled_amount));

  return public.fn_procedure_runtime_state(p_source_table,p_source_id);
end;
$$;

grant execute on function public.fn_procedure_runtime_state(text,uuid) to authenticated;
grant execute on function public.fn_procedure_runtime_action(text,uuid,text,text,numeric) to authenticated;
