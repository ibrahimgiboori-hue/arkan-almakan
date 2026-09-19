-- Governed printing access for Treasury Vouchers and printable approval snapshots.
-- This migration reproduces the live functions used by the Print Captain routes.

create or replace function public.fn_cash_voucher_print_get(p_voucher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','private','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v public.cash_vouchers;
  v_allowed boolean:=false;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;

  select * into v from public.cash_vouchers where id=p_voucher_id;
  if v.id is null then raise exception 'السند غير موجود'; end if;

  if public.fn_is_primary_user()
     or public.has_capability('finance.treasury.view','all',null,v.amount) then
    v_allowed:=true;
  else
    select exists(
      select 1
      from public.approval_workflows w
      where w.transaction_type='cash_voucher'
        and w.source_id=v.id
        and private.fn_can_read_approval_workflow(w.id,v_uid)
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'لا تملك صلاحية عرض هذا السند';
  end if;

  return to_jsonb(v);
end;
$function$;

revoke all on function public.fn_cash_voucher_print_get(uuid) from public,anon;
grant execute on function public.fn_cash_voucher_print_get(uuid) to authenticated;

create or replace function public.fn_approval_get(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','private','pg_temp'
as $function$
declare
  w public.approval_workflows;
  v_snapshot jsonb;
  v_steps jsonb;
  v_events jsonb;
  v_decisions jsonb;
  v_can_route boolean;
  v_can_act boolean;
  v_is_final_stage boolean:=true;
  s public.approval_workflow_steps;
begin
  if auth.uid() is null or not private.fn_can_read_approval_workflow(p_workflow_id,auth.uid()) then
    raise exception 'لا تملك صلاحية عرض هذه المعاملة';
  end if;

  select * into w from public.approval_workflows where id=p_workflow_id;
  select snapshot into v_snapshot
  from public.approval_workflow_versions
  where workflow_id=w.id and version_no=w.version_no;

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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'step_order',a.step_order,
    'decision',a.decision,
    'decision_label',a.action_label_snapshot,
    'actor_name',a.actor_name_snapshot,
    'actor_position',a.actor_position_snapshot,
    'actor_job_title',a.actor_job_title_snapshot,
    'acting_mode',a.acting_mode,
    'comment',a.comment,
    'decided_at',a.decided_at,
    'is_final_action',a.is_final_action
  ) order by a.decided_at,a.step_order),'[]'::jsonb)
  into v_decisions
  from public.approvals a
  where a.workflow_id=w.id and a.workflow_version=w.version_no;

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

  v_can_route:=v_can_act and (
    public.fn_is_primary_user()
    or public.has_capability('system.approvals.route','all',null,w.amount)
  );

  if s.id is not null then
    select not exists(
      select 1
      from public.approval_workflow_steps x
      where x.workflow_id=w.id
        and x.version_no=w.version_no
        and x.status='pending'
        and x.step_order>s.step_order
    ) into v_is_final_stage;
  end if;

  return jsonb_build_object(
    'workflow',to_jsonb(w),
    'snapshot',v_snapshot,
    'steps',v_steps,
    'events',v_events,
    'decisions',v_decisions,
    'can_act',v_can_act,
    'can_route',v_can_route,
    'current_stage_label',coalesce(s.target_group_label,'القرار'),
    'is_final_stage',v_is_final_stage
  );
end;
$function$;
