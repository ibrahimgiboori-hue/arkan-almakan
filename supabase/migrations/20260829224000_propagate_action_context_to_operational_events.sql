-- امتداد مبدأ «المُسجّل النظامي / صاحب الإجراء الفعلي» إلى سجلات الحركة خارج محرك الاعتمادات.
-- أي Event/Movement/Audit جديد في المسارات الأساسية يحمل نفس خمسة حقول السياق.
-- الجداول ذات الحالة المتغيرة تُربط كذلك بـ fn_audit حتى لا تضيع هوية من عدّلها لاحقًا.

create or replace function private.fn_stamp_generic_action_context()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_ctx record;
  v_source_user uuid;
  v_source_employee uuid;
  v_source_name text;
begin
  select * into v_ctx from private.fn_current_action_context();

  if tg_nargs>0 and nullif(tg_argv[0],'') is not null then
    begin
      v_source_user:=nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;
    exception when others then
      v_source_user:=null;
    end;
  end if;

  if v_source_user is not null then
    select au.employee_id,e.full_name_ar
    into v_source_employee,v_source_name
    from public.app_users au
    left join public.employees e on e.id=au.employee_id
    where au.id=v_source_user
    limit 1;
  end if;

  new.system_actor_user_id:=coalesce(v_ctx.system_actor_user_id,v_source_user,new.system_actor_user_id);
  new.real_actor_employee_id:=coalesce(v_ctx.real_actor_employee_id,v_source_employee,new.real_actor_employee_id);
  new.real_actor_name_snapshot:=coalesce(v_ctx.real_actor_name,v_source_name,new.real_actor_name_snapshot);
  new.acting_mode:=case
    when v_ctx.system_actor_user_id is not null then coalesce(v_ctx.acting_mode,'self')
    when v_source_user is not null then coalesce(new.acting_mode,'recorded_user')
    else coalesce(new.acting_mode,'system_recorded')
  end;
  new.action_context_id:=coalesce(v_ctx.action_context_id,new.action_context_id);
  return new;
end;
$$;

revoke all on function private.fn_stamp_generic_action_context() from public,anon,authenticated;

-- Event / movement / audit records: every new row is itself an action record.
alter table public.financial_case_events
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.workspace_task_events
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.procedure_runtime_events
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.transaction_movements
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.labor_assignment_audit
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.financial_reconciliation_audit
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.budget_reserve_movements
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.budget_period_cash_events
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.treasury_movements
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.project_change_events
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

-- Records التي تنشئ رحلة لاحقة: نحفظ سياق المنشئ داخل السجل نفسه، والتغييرات التالية تمر عبر audit_log.
alter table public.transaction_action_envelopes
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

alter table public.workspace_tasks
  add column if not exists system_actor_user_id uuid,
  add column if not exists real_actor_employee_id uuid references public.employees(id),
  add column if not exists real_actor_name_snapshot text,
  add column if not exists acting_mode text,
  add column if not exists action_context_id uuid;

-- Attach insert stamping with the legacy/system-user column used by each table as fallback.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('financial_case_events','actor_user_id'),
      ('workspace_task_events','actor_user_id'),
      ('procedure_runtime_events','actor_user_id'),
      ('transaction_movements','actor_user_id'),
      ('labor_assignment_audit','actor_user_id'),
      ('financial_reconciliation_audit','recorded_by'),
      ('budget_reserve_movements','recorded_by'),
      ('budget_period_cash_events','created_by'),
      ('treasury_movements','recorded_by'),
      ('project_change_events','created_by'),
      ('transaction_action_envelopes','origin_user_id'),
      ('workspace_tasks','creator_user_id')
    ) as x(table_name,source_user_column)
  loop
    execute format('drop trigger if exists trg_action_context_insert on public.%I',r.table_name);
    execute format(
      'create trigger trg_action_context_insert before insert on public.%I for each row execute function private.fn_stamp_generic_action_context(%L)',
      r.table_name,r.source_user_column
    );
  end loop;
end;
$$;

-- Legacy backfill: لا نخترع نيابة قديمة؛ نربط المُسجّل المعروف ونصفها legacy_self فقط.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('financial_case_events','actor_user_id'),
      ('workspace_task_events','actor_user_id'),
      ('procedure_runtime_events','actor_user_id'),
      ('transaction_movements','actor_user_id'),
      ('labor_assignment_audit','actor_user_id'),
      ('financial_reconciliation_audit','recorded_by'),
      ('budget_reserve_movements','recorded_by'),
      ('budget_period_cash_events','created_by'),
      ('treasury_movements','recorded_by'),
      ('project_change_events','created_by'),
      ('transaction_action_envelopes','origin_user_id'),
      ('workspace_tasks','creator_user_id')
    ) as x(table_name,source_user_column)
  loop
    execute format($sql$
      update public.%I t
      set system_actor_user_id=coalesce(t.system_actor_user_id,(to_jsonb(t)->>%L)::uuid),
          real_actor_employee_id=coalesce(t.real_actor_employee_id,au.employee_id),
          real_actor_name_snapshot=coalesce(t.real_actor_name_snapshot,e.full_name_ar),
          acting_mode=coalesce(t.acting_mode,case when au.employee_id is null then 'legacy_unknown' else 'legacy_self' end)
      from public.app_users au
      left join public.employees e on e.id=au.employee_id
      where au.id=(to_jsonb(t)->>%L)::uuid
        and (t.system_actor_user_id is null or t.real_actor_employee_id is null or t.acting_mode is null)
    $sql$,r.table_name,r.source_user_column,r.source_user_column);

    execute format(
      'update public.%I set acting_mode=coalesce(acting_mode,''legacy_unknown'') where acting_mode is null',
      r.table_name
    );
  end loop;
end;
$$;

-- Stateful operational records that previously had no central dual-actor audit.
-- The trigger name is deterministic per table; attaching it twice is idempotent.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'financial_cases',
    'financial_case_versions',
    'treasury_accounts',
    'treasury_movements',
    'bank_statement_entries',
    'employee_reimbursement_payments',
    'leave_balance_adjustments',
    'labor_project_assignments',
    'project_change_events',
    'project_cost_allocations',
    'project_financial_snapshots',
    'transaction_action_envelopes',
    'workspace_tasks',
    'workspace_document_approvals'
  ]
  loop
    if to_regclass('public.'||v_table) is not null then
      execute format('drop trigger if exists %I on public.%I','trg_audit_'||v_table,v_table);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.fn_audit()','trg_audit_'||v_table,v_table);
    end if;
  end loop;
end;
$$;

create index if not exists idx_financial_case_events_action_context on public.financial_case_events(action_context_id) where action_context_id is not null;
create index if not exists idx_workspace_task_events_action_context on public.workspace_task_events(action_context_id) where action_context_id is not null;
create index if not exists idx_transaction_movements_action_context on public.transaction_movements(action_context_id) where action_context_id is not null;
create index if not exists idx_workspace_tasks_action_context on public.workspace_tasks(action_context_id) where action_context_id is not null;
create index if not exists idx_transaction_action_envelopes_action_context on public.transaction_action_envelopes(action_context_id) where action_context_id is not null;

comment on function private.fn_stamp_generic_action_context() is
  'حقن مركزي لسياق المُسجّل النظامي وصاحب الإجراء الحقيقي في سجلات الحركة التشغيلية عند INSERT.';
