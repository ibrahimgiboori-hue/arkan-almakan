alter table public.procedure_source_registry
  add column if not exists financial_total_role text generated always as (
    case
      when relation_name ~* '(payment|settlement|reimburse|treasury_movement|bank_statement)' then 'settlement'
      when relation_name ~* '(line|installment|deduction|allocation|measurement|attachment|budget_line)' then 'detail'
      else 'primary'
    end
  ) stored;

create or replace function private.fn_procedure_pick_capability(p_relation text)
returns text
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_resource text; v_preferred_module text; v_preferred_action text; v_cap text;
begin
  v_resource := case
    when p_relation ~* '(payroll|salary|wage)' then 'payroll'
    when p_relation ~* '(expense|cost|spend)' then 'expenses'
    when p_relation ~* '(custod|petty)' then 'custody'
    when p_relation ~* '(timesheet|attendance|presence)' then 'timesheets'
    when p_relation ~* '(claim|measurement|quantity|retention)' then 'claims'
    when p_relation ~* '(advance|loan)' then 'advances'
    when p_relation ~* '(disciplin|penalt|deduct)' then 'disciplinary'
    when p_relation ~* '(leave_request|leave_)' then 'leaves'
    when p_relation ~* '(end_of_service|end_service)' then 'end_service'
    when p_relation ~* '(quotation)' then 'quotes'
    when p_relation ~* '(^documents$|project_documents)' then 'documents'
    when p_relation ~* '(treasury|payment|reimburse)' then 'treasury'
    when p_relation ~* '(bank_statement)' then 'reconciliation'
    else null
  end;
  if v_resource is null then return null; end if;
  v_preferred_module := case
    when v_resource='payroll' then 'hr'
    when v_resource in ('expenses','custody','timesheets','claims','quotes','documents') then 'projects'
    when v_resource in ('advances','treasury','reconciliation') then 'finance'
    when v_resource in ('disciplinary','leaves','end_service') then 'hr'
    else null end;
  v_preferred_action := case
    when v_resource in ('payroll','expenses','timesheets','claims') then 'submit'
    when v_resource='advances' then 'post'
    when v_resource='treasury' and p_relation ~* 'payment' then 'pay'
    when v_resource='treasury' then 'post'
    when v_resource='reconciliation' then 'reconcile'
    when v_resource in ('custody','disciplinary','leaves','end_service','quotes','documents') then 'create'
    else null end;

  select c.capability_key into v_cap
  from public.permission_capabilities c
  where c.is_active and c.resource_key=v_resource
    and c.action_key in ('submit','post','record','create','edit','review','approve','pay','reconcile')
  order by case when c.module_key=v_preferred_module then 0 else 1 end,
           case when c.action_key=v_preferred_action then 0 else 1 end,
           case c.action_key when 'submit' then 1 when 'post' then 2 when 'record' then 3 when 'create' then 4 when 'pay' then 5 when 'reconcile' then 6 when 'edit' then 7 when 'review' then 8 when 'approve' then 9 else 10 end
  limit 1;
  return v_cap;
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
    'unmapped',(select count(*) from public.procedure_source_registry where is_enabled and capability_key is null),
    'financial_sources',(select count(*) from public.procedure_source_registry where is_enabled and financial_effect),
    'open_transactions',(select count(*) from public.procedure_runtime_index where procedure_status='under_processing'),
    'open_inquiries',(select count(*) from public.procedure_runtime_index where inquiry_status='open'),
    'financial_total',(select coalesce(sum(i.original_amount),0) from public.procedure_runtime_index i join public.procedure_source_registry r on r.source_key=i.source_key where i.financial_effect and r.financial_total_role='primary'),
    'settled_total',(select coalesce(sum(i.settled_amount),0) from public.procedure_runtime_index i join public.procedure_source_registry r on r.source_key=i.source_key where i.financial_effect and r.financial_total_role='primary'),
    'outstanding_total',(select coalesce(sum(greatest(i.original_amount-i.settled_amount,0)),0) from public.procedure_runtime_index i join public.procedure_source_registry r on r.source_key=i.source_key where i.financial_effect and r.financial_total_role='primary')
  );
end; $$;

create or replace function public.fn_procedure_runtime_summary()
returns table(
  source_key text, source_name text, capability_key text, financial_effect boolean, financial_total_role text,
  aggregate_operation boolean, records bigint, open_records bigint, inquiry_records bigint,
  total_amount numeric, settled_amount numeric, outstanding_amount numeric
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select r.source_key,r.relation_name,r.capability_key,r.financial_effect,r.financial_total_role,r.aggregate_operation,
         count(i.id),count(i.id) filter(where i.procedure_status='under_processing'),count(i.id) filter(where i.inquiry_status='open'),
         coalesce(sum(i.original_amount),0),coalesce(sum(i.settled_amount),0),coalesce(sum(greatest(i.original_amount-i.settled_amount,0)),0)
  from public.procedure_source_registry r
  left join public.procedure_runtime_index i on i.source_key=r.source_key
  where r.is_enabled and (public.fn_is_primary_user() or public.has_capability('system.approvals.view','all',null,null))
  group by r.source_key,r.relation_name,r.capability_key,r.financial_effect,r.financial_total_role,r.aggregate_operation
  order by r.financial_effect desc,r.relation_name;
$$;

grant execute on function public.fn_procedure_runtime_summary() to authenticated;
