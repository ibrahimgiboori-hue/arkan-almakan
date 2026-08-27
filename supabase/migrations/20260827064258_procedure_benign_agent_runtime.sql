create table if not exists public.procedure_source_registry (
  source_key text primary key,
  schema_name text not null default 'public',
  relation_name text not null,
  relation_kind text not null default 'table' check (relation_kind in ('table','partitioned_table','view')),
  id_column text,
  amount_column text,
  settled_amount_column text,
  settled_flag_column text,
  status_column text,
  project_column text,
  group_column text,
  capability_key text references public.permission_capabilities(capability_key) on delete set null,
  module_key text,
  source_destination_key text,
  financial_effect boolean not null default false,
  aggregate_operation boolean not null default false,
  confidence smallint not null default 0 check (confidence between 0 and 100),
  discovery_reason text,
  instrumentation_status text not null default 'discovered' check (instrumentation_status in ('discovered','instrumented','review','ignored')),
  is_enabled boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  instrumented_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null,
  unique(schema_name, relation_name)
);

create table if not exists public.procedure_runtime_index (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.procedure_source_registry(source_key) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  group_ref text not null default '',
  project_id uuid references public.projects(id) on delete set null,
  source_label text,
  financial_effect boolean not null default false,
  original_amount numeric not null default 0,
  settled_amount numeric not null default 0,
  procedure_status text not null default 'under_processing' check (procedure_status in ('under_processing','done','cancelled')),
  inquiry_status text not null default 'none' check (inquiry_status in ('none','open','answered')),
  last_source_status text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  settled_at timestamptz,
  completed_at timestamptz,
  unique(source_key, source_id, group_ref),
  check (original_amount >= 0),
  check (settled_amount >= 0)
);

create table if not exists public.procedure_runtime_events (
  id bigint generated always as identity primary key,
  runtime_id uuid not null references public.procedure_runtime_index(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_procedure_source_registry_financial on public.procedure_source_registry(financial_effect,is_enabled);
create index if not exists idx_procedure_runtime_open on public.procedure_runtime_index(procedure_status,inquiry_status);
create index if not exists idx_procedure_runtime_project on public.procedure_runtime_index(project_id);
create index if not exists idx_procedure_runtime_source on public.procedure_runtime_index(source_table,source_id);

alter table public.procedure_source_registry enable row level security;
alter table public.procedure_runtime_index enable row level security;
alter table public.procedure_runtime_events enable row level security;

create or replace function private.fn_procedure_pick_capability(p_relation text)
returns text
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_resource text;
  v_cap text;
begin
  v_resource := case
    when p_relation ~* '(payroll|salary|wage)' then 'payroll'
    when p_relation ~* '(expense|cost|spend)' then 'expenses'
    when p_relation ~* '(custody|petty)' then 'custody'
    when p_relation ~* '(timesheet|attendance|presence)' then 'timesheets'
    when p_relation ~* '(claim|measurement|quantity)' then 'claims'
    when p_relation ~* '(advance|loan)' then 'advances'
    when p_relation ~* '(disciplin|penalt|deduct)' then 'disciplinary'
    else null
  end;
  if v_resource is null then return null; end if;

  select c.capability_key into v_cap
  from public.permission_capabilities c
  where c.is_active and c.resource_key=v_resource
    and c.action_key in ('submit','post','record','create','edit','review','approve')
  order by case c.action_key
    when 'submit' then 1 when 'post' then 2 when 'record' then 3 when 'create' then 4
    when 'edit' then 5 when 'review' then 6 when 'approve' then 7 else 9 end,
    case when v_resource='payroll' and c.module_key='hr' then 0
         when v_resource in ('expenses','custody','timesheets','claims') and c.module_key='projects' then 0
         when v_resource='advances' and c.module_key='finance' then 0
         when v_resource='disciplinary' and c.module_key='hr' then 0 else 1 end
  limit 1;
  return v_cap;
end;
$$;

create or replace function private.fn_procedure_runtime_capture()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_reg public.procedure_source_registry;
  v_json jsonb;
  v_id uuid;
  v_project uuid;
  v_amount numeric := 0;
  v_settled numeric := 0;
  v_group text := '';
  v_source_status text;
  v_done boolean := false;
  v_runtime uuid;
begin
  if tg_op='DELETE' then return old; end if;
  select * into v_reg
  from public.procedure_source_registry
  where schema_name=tg_table_schema and relation_name=tg_table_name and is_enabled
  limit 1;
  if not found or v_reg.id_column is null then return new; end if;

  v_json := to_jsonb(new);
  begin v_id := nullif(v_json->>v_reg.id_column,'')::uuid; exception when others then return new; end;
  if v_id is null then return new; end if;

  if v_reg.project_column is not null then
    begin v_project := nullif(v_json->>v_reg.project_column,'')::uuid; exception when others then v_project := null; end;
  end if;
  if v_reg.amount_column is not null then
    begin v_amount := abs(coalesce(nullif(v_json->>v_reg.amount_column,'')::numeric,0)); exception when others then v_amount := 0; end;
  end if;
  if v_reg.settled_amount_column is not null then
    begin v_settled := abs(coalesce(nullif(v_json->>v_reg.settled_amount_column,'')::numeric,0)); exception when others then v_settled := 0; end;
  elsif v_reg.settled_flag_column is not null and lower(coalesce(v_json->>v_reg.settled_flag_column,'false')) in ('true','t','1','yes') then
    v_settled := v_amount;
  end if;
  if v_reg.group_column is not null then v_group := coalesce(v_json->>v_reg.group_column,''); end if;
  if v_reg.status_column is not null then v_source_status := nullif(v_json->>v_reg.status_column,''); end if;
  if lower(coalesce(v_source_status,'')) in ('paid','settled','closed','completed','complete','done','final_approved') then
    v_done := true;
    if v_reg.financial_effect and v_settled=0 then v_settled:=v_amount; end if;
  end if;
  if v_settled > v_amount and v_amount > 0 then v_settled := v_amount; end if;

  insert into public.procedure_runtime_index(
    source_key,source_table,source_id,group_ref,project_id,source_label,financial_effect,
    original_amount,settled_amount,procedure_status,last_source_status,last_seen_at,settled_at,completed_at
  ) values(
    v_reg.source_key,tg_table_name,v_id,v_group,v_project,replace(tg_table_name,'_',' '),v_reg.financial_effect,
    v_amount,v_settled,case when v_done then 'done' else 'under_processing' end,v_source_status,now(),
    case when v_reg.financial_effect and v_amount>0 and v_settled>=v_amount then now() else null end,
    case when v_done then now() else null end
  )
  on conflict(source_key,source_id,group_ref) do update set
    project_id=excluded.project_id,
    financial_effect=excluded.financial_effect,
    original_amount=excluded.original_amount,
    settled_amount=greatest(public.procedure_runtime_index.settled_amount,excluded.settled_amount),
    last_source_status=excluded.last_source_status,
    last_seen_at=now(),
    procedure_status=case when public.procedure_runtime_index.procedure_status='done' then 'done' else excluded.procedure_status end,
    settled_at=case when excluded.original_amount>0 and greatest(public.procedure_runtime_index.settled_amount,excluded.settled_amount)>=excluded.original_amount then coalesce(public.procedure_runtime_index.settled_at,now()) else public.procedure_runtime_index.settled_at end,
    completed_at=case when excluded.procedure_status='done' then coalesce(public.procedure_runtime_index.completed_at,now()) else public.procedure_runtime_index.completed_at end
  returning id into v_runtime;

  return new;
end;
$$;

create or replace function public.fn_procedure_auto_discover_sources()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  r record;
  v_cap text;
  v_module text;
  v_source_dest text;
  v_amount_col text;
  v_settled_amount_col text;
  v_settled_flag_col text;
  v_status_col text;
  v_project_col text;
  v_group_col text;
  v_financial boolean;
  v_aggregate boolean;
  v_score integer;
  v_reason text;
  v_source_key text;
  v_seen integer:=0;
  v_instrumented integer:=0;
  v_financial_count integer:=0;
  v_unmapped integer:=0;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not (public.fn_is_primary_user() or public.has_capability('system.approvals.route','all',null,null)) then
    raise exception 'لا تملك صلاحية تشغيل عامل اكتشاف الإجراءات';
  end if;

  for r in
    with rels as (
      select n.nspname schema_name,c.relname relation_name,c.relkind,
        array_agg(a.attname order by a.attnum) filter(where a.attnum>0 and not a.attisdropped) cols,
        bool_or(a.attname='id' and t.typname='uuid') filter(where a.attnum>0 and not a.attisdropped) has_uuid_id
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid
      join pg_type t on t.oid=a.atttypid
      where n.nspname='public' and c.relkind in ('r','p','v')
      group by n.nspname,c.relname,c.relkind
    )
    select * from rels
    where has_uuid_id
      and relation_name !~ '^(procedure_|permission_|approval_|workspace_|notification|app_users|financial_case|financial_reconciliation|audit_|schema_|storage_|v_)'
      and (
        relation_name ~* '(expense|custody|advance|payroll|salary|wage|timesheet|attendance|presence|claim|measurement|quantity|disciplin|penalt|deduct|payment|settlement|reimburse|invoice|treasury|transaction)'
        or cols && array['amount','total_amount','net_pay','total_net','gross_pay','total_gross','deduction_amount','paid_amount','balance_due','cost','price','value']::text[]
        or (cols && array['status','payment_status','settlement_status']::text[] and cols && array['project_id','employee_id','contractor_id','day_id','run_id']::text[])
      )
    order by relation_name
  loop
    v_seen:=v_seen+1;
    v_source_key:=r.schema_name||'.'||r.relation_name;
    v_cap:=private.fn_procedure_pick_capability(r.relation_name);
    v_module:=null; v_source_dest:=null;
    if v_cap is not null then
      select module_key,private.fn_route_source_destination(module_key) into v_module,v_source_dest
      from public.permission_capabilities where capability_key=v_cap;
    end if;

    select x into v_amount_col from unnest(array['net_pay','total_net','approved_amount','amount','total_amount','balance_due','gross_pay','total_gross','deduction_amount','reimbursed_amount','recovered_amount','paid_amount','cost','price','value']) x where x=any(r.cols) limit 1;
    select x into v_settled_amount_col from unnest(array['settled_amount','paid_amount','reimbursed_amount','recovered_amount','amount_paid']) x where x=any(r.cols) limit 1;
    select x into v_settled_flag_col from unnest(array['is_settled','is_paid','is_recovered']) x where x=any(r.cols) limit 1;
    select x into v_status_col from unnest(array['settlement_status','payment_status','reimbursement_status','status']) x where x=any(r.cols) limit 1;
    select x into v_project_col from unnest(array['project_id']) x where x=any(r.cols) limit 1;
    select x into v_group_col from unnest(array['day_id','run_id','batch_id','period_id','claim_id','custody_id','project_id']) x where x=any(r.cols) limit 1;

    v_financial := v_amount_col is not null or r.relation_name ~* '(expense|advance|payroll|salary|wage|claim|deduct|payment|settlement|reimburse|invoice|treasury|custody)';
    v_aggregate := r.relation_name ~* '(run|batch|summary|day|timesheet|attendance|payroll|claim)' or v_group_col is not null;
    v_score := least(100, 35 + case when v_cap is not null then 25 else 0 end + case when v_financial then 20 else 0 end + case when v_status_col is not null then 10 else 0 end + case when v_project_col is not null or v_group_col is not null then 10 else 0 end);
    v_reason := concat_ws(' · ',case when v_cap is not null then 'مرتبطة بصلاحية '||v_cap else 'تحتاج ربط صلاحية' end,case when v_financial then 'أثر مالي مكتشف' else 'إجراء تشغيلي' end,case when v_aggregate then 'تدعم التجميع' else 'سجل مفرد' end);

    insert into public.procedure_source_registry(
      source_key,schema_name,relation_name,relation_kind,id_column,amount_column,settled_amount_column,settled_flag_column,status_column,project_column,group_column,
      capability_key,module_key,source_destination_key,financial_effect,aggregate_operation,confidence,discovery_reason,last_seen_at
    ) values(
      v_source_key,r.schema_name,r.relation_name,case r.relkind when 'p' then 'partitioned_table' when 'v' then 'view' else 'table' end,'id',v_amount_col,v_settled_amount_col,v_settled_flag_col,v_status_col,v_project_col,v_group_col,
      v_cap,v_module,v_source_dest,v_financial,v_aggregate,v_score,v_reason,now()
    )
    on conflict(source_key) do update set
      relation_kind=excluded.relation_kind,id_column=excluded.id_column,amount_column=excluded.amount_column,settled_amount_column=excluded.settled_amount_column,
      settled_flag_column=excluded.settled_flag_column,status_column=excluded.status_column,project_column=excluded.project_column,group_column=excluded.group_column,
      capability_key=coalesce(public.procedure_source_registry.capability_key,excluded.capability_key),module_key=coalesce(public.procedure_source_registry.module_key,excluded.module_key),
      source_destination_key=coalesce(public.procedure_source_registry.source_destination_key,excluded.source_destination_key),financial_effect=excluded.financial_effect,
      aggregate_operation=excluded.aggregate_operation,confidence=greatest(public.procedure_source_registry.confidence,excluded.confidence),discovery_reason=excluded.discovery_reason,last_seen_at=now();

    if v_financial then v_financial_count:=v_financial_count+1; end if;
    if v_cap is null then v_unmapped:=v_unmapped+1; end if;

    if r.relkind in ('r','p') then
      begin
        execute format('drop trigger if exists arkan_procedure_runtime_capture on %I.%I',r.schema_name,r.relation_name);
        execute format('create trigger arkan_procedure_runtime_capture after insert or update on %I.%I for each row execute function private.fn_procedure_runtime_capture()',r.schema_name,r.relation_name);
        update public.procedure_source_registry set instrumentation_status='instrumented',instrumented_at=coalesce(instrumented_at,now()) where source_key=v_source_key and instrumentation_status<>'ignored';
        v_instrumented:=v_instrumented+1;
      exception when others then
        update public.procedure_source_registry set instrumentation_status='review',discovery_reason=v_reason||' · تعذر زرع المستشعر: '||sqlerrm where source_key=v_source_key;
      end;
    end if;

    if v_cap is not null and not exists(select 1 from public.procedure_route_policies p where p.capability_key=v_cap) then
      insert into public.procedure_route_policies(capability_key,source_destination_key,routing_mode,requires_followup,internal_upward_required,financial_effect,financial_review_required,allow_additional_requirements,allow_specific_user,default_sla_hours,notes,updated_by)
      values(v_cap,v_source_dest,case when v_financial and v_source_dest<>'finance' then 'cross_portal' else 'internal' end,true,true,v_financial,v_financial,true,true,case when v_financial then 24 else 48 end,'تصنيف أولي بواسطة عامل الإجراءات الحميد؛ قابل للتعديل من الدستور.',v_uid)
      on conflict(capability_key) do nothing;
    end if;

    if v_cap is not null and v_financial and v_source_dest is distinct from 'finance' and exists(select 1 from public.procedure_destinations where destination_key='finance' and is_active) then
      insert into public.procedure_route_targets(capability_key,from_destination_key,to_destination_key,action_type,is_mandatory,is_blocking,allow_specific_user,sla_hours,sort_order,is_active)
      values(v_cap,v_source_dest,'finance','review',true,true,true,24,10,true)
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('seen',v_seen,'instrumented',v_instrumented,'financial',v_financial_count,'unmapped',v_unmapped,'ran_at',now());
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
  v_row public.procedure_runtime_index;
  v_before jsonb;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from public.procedure_runtime_index where source_table=p_source_table and source_id=p_source_id order by last_seen_at desc limit 1 for update;
  if not found then raise exception 'المعاملة غير موجودة في فهرس الإجراءات'; end if;
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

  return (select jsonb_build_object(
    'id',x.id,'procedure_status',x.procedure_status,'inquiry_status',x.inquiry_status,'original_amount',x.original_amount,
    'settled_amount',x.settled_amount,'outstanding_amount',greatest(x.original_amount-x.settled_amount,0),
    'settlement_status',case when not x.financial_effect then 'not_applicable' when x.original_amount<=0 then 'none' when x.settled_amount<=0 then 'unsettled' when x.settled_amount<x.original_amount then 'partial' else 'settled' end
  ) from public.procedure_runtime_index x where x.id=v_row.id);
end;
$$;

create or replace function public.fn_procedure_agent_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_uid uuid:=auth.uid(); begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not (public.fn_is_primary_user() or public.has_capability('system.approvals.view','all',null,null)) then raise exception 'لا تملك صلاحية عرض حالة عامل الإجراءات'; end if;
  return jsonb_build_object(
    'sources',(select count(*) from public.procedure_source_registry where is_enabled),
    'instrumented',(select count(*) from public.procedure_source_registry where is_enabled and instrumentation_status='instrumented'),
    'review',(select count(*) from public.procedure_source_registry where is_enabled and instrumentation_status='review'),
    'financial_sources',(select count(*) from public.procedure_source_registry where is_enabled and financial_effect),
    'open_transactions',(select count(*) from public.procedure_runtime_index where procedure_status='under_processing'),
    'open_inquiries',(select count(*) from public.procedure_runtime_index where inquiry_status='open'),
    'financial_total',(select coalesce(sum(original_amount),0) from public.procedure_runtime_index where financial_effect),
    'settled_total',(select coalesce(sum(settled_amount),0) from public.procedure_runtime_index where financial_effect),
    'outstanding_total',(select coalesce(sum(greatest(original_amount-settled_amount,0)),0) from public.procedure_runtime_index where financial_effect)
  );
end; $$;

grant execute on function public.fn_procedure_auto_discover_sources() to authenticated;
grant execute on function public.fn_procedure_runtime_action(text,uuid,text,text,numeric) to authenticated;
grant execute on function public.fn_procedure_agent_status() to authenticated;

comment on table public.procedure_source_registry is 'عامل الإجراءات الحميد: سجل المصادر المكتشفة تلقائيًا دون تعديل بيانات التشغيل الأصلية.';
comment on table public.procedure_runtime_index is 'فهرس موحد لحالة الإجراء والتسوية المالية للعمليات المكتشفة.';
