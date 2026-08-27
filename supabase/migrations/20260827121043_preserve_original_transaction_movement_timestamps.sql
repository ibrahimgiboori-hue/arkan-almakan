update public.transaction_movements m
set created_at=w.submitted_at
from public.approval_workflows w
where m.source_engine='approval'
  and m.source_engine_ref=w.id::text
  and m.movement_kind='approval_submitted'
  and w.submitted_at is not null;

update public.transaction_movements m
set created_at=coalesce(w.finalized_at,w.updated_at,w.created_at)
from public.approval_workflows w
where m.source_engine='approval'
  and m.source_engine_ref=w.id::text
  and m.movement_kind='approval_status';

update public.transaction_movements m
set created_at=s.created_at
from public.approval_workflow_steps s
where m.source_engine='approval_step'
  and m.source_engine_ref=s.id::text
  and m.movement_kind='approval_route';

update public.transaction_movements m
set created_at=s.acted_at
from public.approval_workflow_steps s
where m.source_engine='approval_step'
  and m.source_engine_ref=s.id::text
  and m.movement_kind='approval_decision'
  and s.acted_at is not null;

update public.transaction_movements m
set created_at=t.created_at
from public.workspace_tasks t
where m.source_engine='workspace_task'
  and m.source_engine_ref=t.id::text;

update public.transaction_movements m
set created_at=e.created_at
from public.workspace_task_events e
where m.source_engine='workspace_event'
  and m.source_engine_ref=e.id::text;

update public.transaction_register r
set opened_at=x.first_at,
    last_movement_at=x.last_at,
    updated_at=now()
from (
  select transaction_id,min(created_at) first_at,max(created_at) last_at
  from public.transaction_movements
  group by transaction_id
) x
where x.transaction_id=r.id;
