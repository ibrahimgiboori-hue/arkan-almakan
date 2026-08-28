do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature,p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname like 'fn_budget_%'
  loop
    execute format('revoke all on function %s from public, anon',r.signature);
    if r.proname like 'fn_budget_rpc_%' then
      execute format('grant execute on function %s to authenticated, service_role',r.signature);
    else
      execute format('revoke execute on function %s from authenticated',r.signature);
      execute format('grant execute on function %s to service_role',r.signature);
    end if;
  end loop;
end $$;

-- Restore the internal-only posture of private functions that predated this module.
-- Migration 0120 intentionally removed PUBLIC execution from private, but its broad
-- authenticated grant must not make these owner-only governance functions callable.
do $$
declare sig text;
begin
  foreach sig in array array[
    'private.fn_apply_policy_source_status(public.approval_workflows,text)',
    'private.fn_approval_visibility_filter(uuid,text,uuid,uuid)',
    'private.fn_contractor_financial_trace(uuid,uuid)',
    'private.fn_finalize_approval_source(public.approval_workflows)',
    'private.fn_has_pending_approval(text,uuid)',
    'private.fn_procedure_task_visibility_filter(uuid,text,uuid,uuid)',
    'private.fn_sync_runtime_from_approval(public.approval_workflows,text)',
    'private.fn_user_has_assigned_capability(uuid,text,text,text,numeric)',
    'private.fn_user_workflow_rank(uuid,text,text,text,text,numeric)',
    'private.sync_project_responsibility_permissions()',
    'private.trg_guard_claim_approval_source()',
    'private.trg_guard_contractor_expense_approval_source()',
    'private.trg_guard_project_approval_source()',
    'private.trg_guard_timesheet_approval_source()'
  ] loop
    if to_regprocedure(sig) is not null then execute format('revoke execute on function %s from authenticated',to_regprocedure(sig)); end if;
  end loop;
end $$;
