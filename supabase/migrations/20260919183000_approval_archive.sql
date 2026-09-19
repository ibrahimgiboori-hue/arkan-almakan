create or replace function public.fn_my_approval_archive()
returns table(
  workflow_id uuid,
  workflow_no text,
  transaction_type text,
  label_ar text,
  source_label text,
  project_id uuid,
  amount numeric,
  workflow_status text,
  version_no integer,
  step_id uuid,
  step_order integer,
  target_group_label text,
  action_status text,
  action_type text,
  decision_comment text,
  acted_at timestamptz,
  acting_mode text,
  real_actor_name_snapshot text,
  submitted_at timestamptz,
  origin_group_label text
)
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if auth.uid() is null then return; end if;

  return query
  select
    w.id,
    w.workflow_no,
    w.transaction_type,
    p.label_ar,
    w.source_label,
    w.project_id,
    w.amount,
    w.status,
    w.version_no,
    s.id,
    s.step_order,
    s.target_group_label,
    s.status,
    s.action_type,
    s.decision_comment,
    s.acted_at,
    s.acting_mode,
    s.real_actor_name_snapshot,
    w.submitted_at,
    w.origin_group_label
  from public.approval_workflows w
  join public.approval_workflow_policies p
    on p.transaction_type=w.transaction_type
  join lateral (
    select hs.*
    from public.approval_workflow_steps hs
    where hs.workflow_id=w.id
      and hs.status <> 'pending'
      and hs.acted_at is not null
      and (
        public.fn_is_primary_user()
        or (hs.target_type='user' and hs.target_user_id=auth.uid())
        or hs.acted_by_user_id=auth.uid()
      )
    order by hs.acted_at desc, hs.step_order desc
    limit 1
  ) s on true
  order by s.acted_at desc;
end;
$function$;

grant execute on function public.fn_my_approval_archive() to authenticated;
