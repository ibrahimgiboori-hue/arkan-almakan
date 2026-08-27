-- Keep procedure_runtime_index as a projection of canonical approval outcomes.

create or replace function private.fn_sync_runtime_from_approval(
  p_workflow public.approval_workflows,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_runtime_id uuid;
  v_event text;
begin
  select id into v_runtime_id
  from public.procedure_runtime_index
  where source_table=p_workflow.source_table
    and source_id=p_workflow.source_id
  order by last_seen_at desc
  limit 1;

  if v_runtime_id is null then return; end if;

  if p_outcome in ('approved','rejected') then
    update public.procedure_runtime_index
    set procedure_status='done',completed_at=coalesce(completed_at,now()),last_seen_at=now()
    where id=v_runtime_id;
  elsif p_outcome='returned' then
    update public.procedure_runtime_index
    set procedure_status='under_processing',completed_at=null,last_seen_at=now()
    where id=v_runtime_id;
  else
    update public.procedure_runtime_index
    set procedure_status='under_processing',completed_at=null,last_seen_at=now()
    where id=v_runtime_id;
  end if;

  v_event:=case p_outcome
    when 'approved' then 'canonical_approval_completed'
    when 'rejected' then 'canonical_approval_rejected'
    when 'returned' then 'canonical_approval_returned'
    else 'canonical_approval_pending'
  end;

  insert into public.procedure_runtime_events(runtime_id,event_type,actor_user_id,note,payload)
  values(v_runtime_id,v_event,auth.uid(),null,jsonb_build_object('workflow_id',p_workflow.id,'workflow_status',p_outcome));
end;
$$;

revoke all on function private.fn_sync_runtime_from_approval(public.approval_workflows,text) from public, anon;

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

  perform private.fn_sync_runtime_from_approval(p_workflow,'approved');
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

  perform private.fn_sync_runtime_from_approval(p_workflow,case when p_rejected then 'rejected' else 'returned' end);
end;
$$;
