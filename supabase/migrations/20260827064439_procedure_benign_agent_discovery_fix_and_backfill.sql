create or replace function private.fn_procedure_upsert_runtime(p_source_key text,p_json jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_reg public.procedure_source_registry;
  v_id uuid;
  v_project uuid;
  v_amount numeric:=0;
  v_settled numeric:=0;
  v_group text:='';
  v_source_status text;
  v_done boolean:=false;
  v_runtime uuid;
begin
  select * into v_reg from public.procedure_source_registry where source_key=p_source_key and is_enabled limit 1;
  if not found or v_reg.id_column is null then return null; end if;
  begin v_id:=nullif(p_json->>v_reg.id_column,'')::uuid; exception when others then return null; end;
  if v_id is null then return null; end if;
  if v_reg.project_column is not null then begin v_project:=nullif(p_json->>v_reg.project_column,'')::uuid; exception when others then v_project:=null; end; end if;
  if v_reg.amount_column is not null then begin v_amount:=abs(coalesce(nullif(p_json->>v_reg.amount_column,'')::numeric,0)); exception when others then v_amount:=0; end; end if;
  if v_reg.settled_amount_column is not null then
    begin v_settled:=abs(coalesce(nullif(p_json->>v_reg.settled_amount_column,'')::numeric,0)); exception when others then v_settled:=0; end;
  elsif v_reg.settled_flag_column is not null and lower(coalesce(p_json->>v_reg.settled_flag_column,'false')) in ('true','t','1','yes') then v_settled:=v_amount;
  end if;
  if v_reg.group_column is not null then v_group:=coalesce(p_json->>v_reg.group_column,''); end if;
  if v_reg.status_column is not null then v_source_status:=nullif(p_json->>v_reg.status_column,''); end if;
  if lower(coalesce(v_source_status,'')) in ('paid','settled','closed','completed','complete','done','final_approved') then
    v_done:=true;
    if v_reg.financial_effect and v_settled=0 then v_settled:=v_amount; end if;
  end if;
  if v_settled>v_amount and v_amount>0 then v_settled:=v_amount; end if;

  insert into public.procedure_runtime_index(source_key,source_table,source_id,group_ref,project_id,source_label,financial_effect,original_amount,settled_amount,procedure_status,last_source_status,last_seen_at,settled_at,completed_at)
  values(v_reg.source_key,v_reg.relation_name,v_id,v_group,v_project,replace(v_reg.relation_name,'_',' '),v_reg.financial_effect,v_amount,v_settled,case when v_done then 'done' else 'under_processing' end,v_source_status,now(),case when v_reg.financial_effect and v_amount>0 and v_settled>=v_amount then now() else null end,case when v_done then now() else null end)
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
  return v_runtime;
end;
$$;

create or replace function private.fn_procedure_runtime_capture()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_key text; begin
  if tg_op='DELETE' then return old; end if;
  select source_key into v_key from public.procedure_source_registry where schema_name=tg_table_schema and relation_name=tg_table_name and is_enabled limit 1;
  if v_key is not null then perform private.fn_procedure_upsert_runtime(v_key,to_jsonb(new)); end if;
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
  v_uid uuid:=auth.uid();
  r record;
  v_cap text; v_module text; v_source_dest text;
  v_amount_col text; v_settled_amount_col text; v_settled_flag_col text; v_status_col text; v_project_col text; v_group_col text;
  v_financial boolean; v_aggregate boolean; v_score integer; v_reason text; v_source_key text; v_json jsonb;
  v_seen integer:=0; v_instrumented integer:=0; v_financial_count integer:=0; v_unmapped integer:=0; v_backfilled integer:=0;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not (public.fn_is_primary_user() or public.has_capability('system.approvals.route','all',null,null)) then raise exception 'لا تملك صلاحية تشغيل عامل اكتشاف الإجراءات'; end if;

  for r in
    with rels as (
      select n.nspname::text schema_name,c.relname::text relation_name,c.relkind,
        array_agg(a.attname::text order by a.attnum) filter(where a.attnum>0 and not a.attisdropped) cols,
        bool_or(a.attname='id' and t.typname='uuid') filter(where a.attnum>0 and not a.attisdropped) has_uuid_id
      from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid join pg_type t on t.oid=a.atttypid
      where n.nspname='public' and c.relkind in ('r','p','v')
      group by n.nspname,c.relname,c.relkind
    )
    select * from rels where has_uuid_id
      and relation_name !~ '^(procedure_|permission_|approval_|workspace_|notification|app_users|financial_case|financial_reconciliation|audit_|schema_|storage_|v_)'
      and (
        relation_name ~* '(expense|custody|advance|payroll|salary|wage|timesheet|attendance|presence|claim|measurement|quantity|disciplin|penalt|deduct|payment|settlement|reimburse|invoice|treasury|transaction)'
        or cols && array['amount','total_amount','net_pay','total_net','gross_pay','total_gross','deduction_amount','paid_amount','balance_due','cost','price','value']::text[]
        or (cols && array['status','payment_status','settlement_status']::text[] and cols && array['project_id','employee_id','contractor_id','day_id','run_id']::text[])
      ) order by relation_name
  loop
    v_seen:=v_seen+1; v_source_key:=r.schema_name||'.'||r.relation_name;
    v_cap:=private.fn_procedure_pick_capability(r.relation_name); v_module:=null; v_source_dest:=null;
    if v_cap is not null then select module_key,private.fn_route_source_destination(module_key) into v_module,v_source_dest from public.permission_capabilities where capability_key=v_cap; end if;

    v_amount_col:=null; v_settled_amount_col:=null; v_settled_flag_col:=null; v_status_col:=null; v_project_col:=null; v_group_col:=null;
    select x into v_amount_col from unnest(array['net_pay','total_net','approved_amount','amount','total_amount','balance_due','gross_pay','total_gross','deduction_amount','reimbursed_amount','recovered_amount','paid_amount','cost','price','value']::text[]) x where x=any(r.cols) limit 1;
    select x into v_settled_amount_col from unnest(array['settled_amount','paid_amount','reimbursed_amount','recovered_amount','amount_paid']::text[]) x where x=any(r.cols) limit 1;
    select x into v_settled_flag_col from unnest(array['is_settled','is_paid','is_recovered']::text[]) x where x=any(r.cols) limit 1;
    select x into v_status_col from unnest(array['settlement_status','payment_status','reimbursement_status','status']::text[]) x where x=any(r.cols) limit 1;
    select x into v_project_col from unnest(array['project_id']::text[]) x where x=any(r.cols) limit 1;
    select x into v_group_col from unnest(array['day_id','run_id','batch_id','period_id','claim_id','custody_id','project_id']::text[]) x where x=any(r.cols) limit 1;

    v_financial:=v_amount_col is not null or r.relation_name ~* '(expense|advance|payroll|salary|wage|claim|deduct|payment|settlement|reimburse|invoice|treasury|custody)';
    v_aggregate:=r.relation_name ~* '(run|batch|summary|day|timesheet|attendance|payroll|claim)' or v_group_col is not null;
    v_score:=least(100,35+case when v_cap is not null then 25 else 0 end+case when v_financial then 20 else 0 end+case when v_status_col is not null then 10 else 0 end+case when v_project_col is not null or v_group_col is not null then 10 else 0 end);
    v_reason:=concat_ws(' · ',case when v_cap is not null then 'مرتبطة بصلاحية '||v_cap else 'تحتاج ربط صلاحية' end,case when v_financial then 'أثر مالي مكتشف' else 'إجراء تشغيلي' end,case when v_aggregate then 'تدعم التجميع' else 'سجل مفرد' end);

    insert into public.procedure_source_registry(source_key,schema_name,relation_name,relation_kind,id_column,amount_column,settled_amount_column,settled_flag_column,status_column,project_column,group_column,capability_key,module_key,source_destination_key,financial_effect,aggregate_operation,confidence,discovery_reason,last_seen_at)
    values(v_source_key,r.schema_name,r.relation_name,case r.relkind when 'p' then 'partitioned_table' when 'v' then 'view' else 'table' end,'id',v_amount_col,v_settled_amount_col,v_settled_flag_col,v_status_col,v_project_col,v_group_col,v_cap,v_module,v_source_dest,v_financial,v_aggregate,v_score,v_reason,now())
    on conflict(source_key) do update set relation_kind=excluded.relation_kind,id_column=excluded.id_column,amount_column=excluded.amount_column,settled_amount_column=excluded.settled_amount_column,settled_flag_column=excluded.settled_flag_column,status_column=excluded.status_column,project_column=excluded.project_column,group_column=excluded.group_column,capability_key=coalesce(public.procedure_source_registry.capability_key,excluded.capability_key),module_key=coalesce(public.procedure_source_registry.module_key,excluded.module_key),source_destination_key=coalesce(public.procedure_source_registry.source_destination_key,excluded.source_destination_key),financial_effect=excluded.financial_effect,aggregate_operation=excluded.aggregate_operation,confidence=greatest(public.procedure_source_registry.confidence,excluded.confidence),discovery_reason=excluded.discovery_reason,last_seen_at=now();

    if v_financial then v_financial_count:=v_financial_count+1; end if; if v_cap is null then v_unmapped:=v_unmapped+1; end if;

    if r.relkind in ('r','p') then
      begin
        execute format('drop trigger if exists arkan_procedure_runtime_capture on %I.%I',r.schema_name,r.relation_name);
        execute format('create trigger arkan_procedure_runtime_capture after insert or update on %I.%I for each row execute function private.fn_procedure_runtime_capture()',r.schema_name,r.relation_name);
        update public.procedure_source_registry set instrumentation_status='instrumented',instrumented_at=coalesce(instrumented_at,now()) where source_key=v_source_key and instrumentation_status<>'ignored';
        v_instrumented:=v_instrumented+1;
        for v_json in execute format('select to_jsonb(t) from %I.%I t',r.schema_name,r.relation_name) loop
          perform private.fn_procedure_upsert_runtime(v_source_key,v_json); v_backfilled:=v_backfilled+1;
        end loop;
      exception when others then
        update public.procedure_source_registry set instrumentation_status='review',discovery_reason=v_reason||' · تعذر زرع المستشعر: '||sqlerrm where source_key=v_source_key;
      end;
    end if;

    if v_cap is not null and not exists(select 1 from public.procedure_route_policies p where p.capability_key=v_cap) then
      insert into public.procedure_route_policies(capability_key,source_destination_key,routing_mode,requires_followup,internal_upward_required,financial_effect,financial_review_required,allow_additional_requirements,allow_specific_user,default_sla_hours,notes,updated_by)
      values(v_cap,v_source_dest,case when v_financial and v_source_dest<>'finance' then 'cross_portal' else 'internal' end,true,true,v_financial,v_financial,true,true,case when v_financial then 24 else 48 end,'تصنيف أولي بواسطة عامل الإجراءات الحميد؛ قابل للتعديل من الدستور.',v_uid) on conflict(capability_key) do nothing;
    end if;
    if v_cap is not null and v_financial and v_source_dest is distinct from 'finance' and exists(select 1 from public.procedure_destinations where destination_key='finance' and is_active) then
      insert into public.procedure_route_targets(capability_key,from_destination_key,to_destination_key,action_type,is_mandatory,is_blocking,allow_specific_user,sla_hours,sort_order,is_active)
      values(v_cap,v_source_dest,'finance','review',true,true,true,24,10,true) on conflict(capability_key,from_destination_key,to_destination_key,action_type) do nothing;
    end if;
  end loop;
  return jsonb_build_object('seen',v_seen,'instrumented',v_instrumented,'financial',v_financial_count,'unmapped',v_unmapped,'backfilled',v_backfilled,'ran_at',now());
end;
$$;
