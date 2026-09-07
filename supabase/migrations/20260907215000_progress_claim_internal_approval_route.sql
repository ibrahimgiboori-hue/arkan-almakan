-- دورة الاعتماد الداخلي للمطالبات / المستخلصات.
-- المصدر: إدارة المشاريع، ثم مراجعة إدارة المشاريع، ثم المالية، ثم الاعتماد النهائي.
-- بعد اكتمال الاعتماد الداخلي فقط يصبح المستخلص جاهزًا للتقديم للعميل.

-- 1) صلاحيات المراحل الجديدة.
insert into public.permission_capabilities(
  capability_key,module_key,module_label_ar,resource_key,resource_label_ar,
  action_key,description_ar,risk_level,is_active
) values
  (
    'projects.claims.review','projects','المشاريع','claims','المستخلصات',
    'review','مراجعة التمتير والكميات والمستندات قبل المراجعة المالية',2,true
  ),
  (
    'system.approvals.final_approve','system','النظام','approvals','الاعتمادات',
    'final_approve','الاعتماد النهائي لإصدار المعاملة بعد اكتمال المراجعات الداخلية',3,true
  )
on conflict (capability_key) do update
set module_key=excluded.module_key,
    module_label_ar=excluded.module_label_ar,
    resource_key=excluded.resource_key,
    resource_label_ar=excluded.resource_label_ar,
    action_key=excluded.action_key,
    description_ar=excluded.description_ar,
    risk_level=excluded.risk_level,
    is_active=true;

-- 2) سياسة المستخلص: مسار ثابت لا يعتمد على إضافة مراحل يدوية.
update public.approval_workflow_policies
set label_ar='اعتماد مطالبة مشروع',
    source_module='projects',
    submit_capability='projects.claims.submit',
    initial_target_capability='projects.claims.review',
    initial_target_group_key='module:projects',
    initial_target_group_label='مراجعة إدارة المشاريع',
    origin_counts_as_opinion=false,
    financial_mode='mandatory',
    allow_additional=false,
    is_active=true
where transaction_type='progress_claim';

-- 3) صندوق الاعتمادات يعرض المرحلة الحالية فقط، حتى عند وجود خطة مراحل مسبقة.
create or replace function public.fn_my_approval_inbox()
returns table(
  workflow_id uuid,
  workflow_no text,
  transaction_type text,
  label_ar text,
  source_label text,
  project_id uuid,
  amount numeric,
  status text,
  version_no integer,
  step_id uuid,
  step_order integer,
  target_group_label text,
  request_reason text,
  submitted_at timestamptz,
  origin_group_label text
)
language plpgsql
stable security definer
set search_path to 'public','private','pg_temp'
as $$
begin
  if auth.uid() is null then return; end if;

  return query
  select
    w.id,w.workflow_no,w.transaction_type,p.label_ar,w.source_label,w.project_id,w.amount,w.status,w.version_no,
    s.id,s.step_order,s.target_group_label,s.request_reason,w.submitted_at,w.origin_group_label
  from public.approval_workflows w
  join public.approval_workflow_policies p on p.transaction_type=w.transaction_type
  join public.approval_workflow_steps s
    on s.id=(
      select cs.id
      from public.approval_workflow_steps cs
      where cs.workflow_id=w.id
        and cs.version_no=w.version_no
        and cs.status='pending'
      order by cs.step_order
      limit 1
    )
  where w.status='pending'
    and (
      public.fn_is_primary_user()
      or (s.target_type='user' and s.target_user_id=auth.uid())
      or (
        s.target_type='capability'
        and public.has_capability(
          s.target_capability,
          case when w.project_id is null then 'all' else 'project' end,
          case when w.project_id is null then null else w.project_id::text end,
          w.amount
        )
      )
    )
  order by w.submitted_at;
end;
$$;

-- 4) محرك القرار العام: لا يُنهي الرحلة إلا بعد انتهاء كل المراحل المخططة.
create or replace function public.fn_approval_decide(
  p_workflow_id uuid,
  p_decision text,
  p_comment text default null,
  p_next_user_id uuid default null,
  p_next_capability text default null,
  p_next_reason text default null
)
returns text
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  w public.approval_workflows;
  s public.approval_workflow_steps;
  p public.approval_workflow_policies;
  g record;
  v_next_group_key text;
  v_next_group_label text;
  v_next_module text;
  v_step integer;
  v_emp uuid;
  v_position text;
  v_job text;
  v_role public.user_role;
  v_has_remaining boolean:=false;
  v_is_final boolean:=false;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_decision not in ('approve','return','reject') then raise exception 'القرار غير مدعوم'; end if;

  select * into w from public.approval_workflows where id=p_workflow_id for update;
  if w.id is null or w.status<>'pending' then raise exception 'المعاملة ليست بانتظار قرار'; end if;

  select * into s from private.fn_current_approval_step(w.id);
  if s.id is null then raise exception 'لا توجد مرحلة اعتماد معلقة'; end if;

  if not public.fn_is_primary_user() then
    if s.target_type='user' then
      if s.target_user_id<>v_uid then raise exception 'هذه المرحلة مسندة حصريًا إلى مستخدم آخر'; end if;
    else
      if not public.has_capability(
        s.target_capability,
        case when w.project_id is null then 'all' else 'project' end,
        case when w.project_id is null then null else w.project_id::text end,
        w.amount
      ) then
        raise exception 'لا تملك صلاحية القرار في هذه المرحلة';
      end if;
    end if;
  end if;

  select * into p from public.approval_workflow_policies where transaction_type=w.transaction_type;
  if p_decision in ('return','reject') and nullif(trim(coalesce(p_comment,'')),'') is null then
    raise exception 'التبرير مطلوب';
  end if;

  if p_decision='return' then
    update public.approval_workflow_steps
    set status='returned',acted_by_user_id=v_uid,decision_comment=trim(p_comment),acted_at=now()
    where id=s.id;

    update public.approval_workflows
    set status='returned',return_note=trim(p_comment),updated_at=now()
    where id=w.id;

    perform private.fn_source_on_return(w,false);

  elsif p_decision='reject' then
    update public.approval_workflow_steps
    set status='rejected',acted_by_user_id=v_uid,decision_comment=trim(p_comment),acted_at=now()
    where id=s.id;

    update public.approval_workflows
    set status='rejected',finalized_at=now(),updated_at=now()
    where id=w.id;

    perform private.fn_source_on_return(w,true);

  else
    update public.approval_workflow_steps
    set status='approved',acted_by_user_id=v_uid,
        decision_comment=nullif(trim(p_comment),''),acted_at=now()
    where id=s.id;

    if p_next_user_id is not null or p_next_capability is not null then
      if not p.allow_additional then raise exception 'هذه المعاملة لا تسمح بإضافة اعتماد آخر'; end if;
      if not public.has_capability('system.approvals.route','all',null,w.amount) then
        raise exception 'لا تملك صلاحية إضافة مسار اعتماد';
      end if;
      if p_next_user_id is not null and p_next_capability is not null then
        raise exception 'اختر شخصًا أو جهة اعتماد، وليس كليهما';
      end if;

      if p_next_user_id is not null then
        if p_next_user_id=v_uid then raise exception 'لا يمكن إحالة الاعتماد إلى نفسك'; end if;
        if not exists(select 1 from public.app_users where id=p_next_user_id and is_active) then
          raise exception 'المستخدم المختار غير نشط';
        end if;
        select * into g from private.fn_user_approval_group(p_next_user_id);
        v_next_group_key:=g.group_key;
        v_next_group_label:=g.group_label;
      else
        select c.module_key into v_next_module
        from public.permission_capabilities c
        where c.capability_key=p_next_capability and c.is_active;
        if v_next_module is null then raise exception 'جهة الاعتماد غير صحيحة'; end if;
        v_next_group_key:='module:'||v_next_module;
        v_next_group_label:=case v_next_module
          when 'finance' then 'المالية'
          when 'projects' then 'إدارة المشاريع'
          when 'hr' then 'الموارد البشرية'
          else v_next_module
        end;
      end if;

      if exists(
        select 1 from public.approval_workflow_steps x
        where x.workflow_id=w.id and x.version_no=w.version_no
          and x.target_group_key=v_next_group_key
      ) then raise exception 'هذه الجهة شاركت بالفعل في مسار هذه النسخة ولا يمكن إضافتها مرة أخرى'; end if;

      if p.origin_counts_as_opinion and w.origin_group_key=v_next_group_key then
        raise exception 'لا يمكن إعادة المعاملة إلى جهة المصدر كاعتماد إضافي على نفس النسخة';
      end if;

      if p_next_user_id is not null and (
        exists(select 1 from public.approval_workflow_steps x where x.workflow_id=w.id and x.version_no=w.version_no and x.acted_by_user_id=p_next_user_id)
        or (p.origin_counts_as_opinion and w.origin_user_id=p_next_user_id)
      ) then raise exception 'هذا الشخص شارك بالفعل في قرار هذه النسخة'; end if;

      select coalesce(max(step_order),0)+1 into v_step
      from public.approval_workflow_steps
      where workflow_id=w.id and version_no=w.version_no;

      insert into public.approval_workflow_steps(
        workflow_id,version_no,step_order,target_type,target_user_id,target_capability,
        target_group_key,target_group_label,requested_by_user_id,request_reason,is_additional
      ) values(
        w.id,w.version_no,v_step,
        case when p_next_user_id is not null then 'user' else 'capability' end,
        p_next_user_id,p_next_capability,v_next_group_key,v_next_group_label,
        v_uid,nullif(trim(p_next_reason),''),true
      );
    else
      select exists(
        select 1
        from public.approval_workflow_steps x
        where x.workflow_id=w.id
          and x.version_no=w.version_no
          and x.status='pending'
      ) into v_has_remaining;

      if v_has_remaining then
        update public.approval_workflows set updated_at=now() where id=w.id;
      else
        update public.approval_workflows
        set status='approved',finalized_at=now(),updated_at=now()
        where id=w.id;
        perform private.fn_finalize_approval_source(w);
        v_is_final:=true;
      end if;
    end if;
  end if;

  select au.employee_id,au.role,e.board_role,e.job_title
  into v_emp,v_role,v_position,v_job
  from public.app_users au
  left join public.employees e on e.id=au.employee_id
  where au.id=v_uid;

  insert into public.approvals(
    entity_table,entity_id,step_order,step_role,decision,decided_by,decided_at,comment,
    actor_employee_id,actor_position_snapshot,actor_job_title_snapshot,approval_method,decision_date,
    recorded_by_user_id,recorded_at,source,stage_code,stage_label_snapshot,action_code,action_label_snapshot,
    is_final_action,scenario_snapshot,workflow_id,workflow_version,workflow_step_id
  ) values(
    w.source_table,w.source_id,s.step_order,v_role,
    case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
    v_uid,now(),p_comment,v_emp,v_position,v_job,'electronic',current_date,v_uid,now(),'live',
    'dynamic_approval',s.target_group_label,
    p_decision,case p_decision when 'approve' then 'اعتماد' when 'reject' then 'رفض' else 'إرجاع للتعديل' end,
    v_is_final,'dynamic',w.id,w.version_no,s.id
  );

  insert into public.approval_workflow_events(
    workflow_id,version_no,step_id,event_type,actor_user_id,note,payload
  ) values(
    w.id,w.version_no,s.id,p_decision,v_uid,p_comment,
    jsonb_build_object(
      'next_user_id',p_next_user_id,
      'next_capability',p_next_capability,
      'next_group',v_next_group_label,
      'final_action',v_is_final
    )
  );

  return (select status from public.approval_workflows where id=w.id);
end;
$$;

-- 5) إرسال المستخلص ينشئ خطة الاعتماد الداخلي كاملة من البداية.
create or replace function public.fn_submit_progress_claim_for_approval(
  p_claim_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $$
declare
  c public.progress_claims;
  v_snapshot jsonb;
  v_project_name text;
  v_workflow_id uuid;
  v_version integer;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;

  select * into c from public.progress_claims where id=p_claim_id;
  if c.id is null then raise exception 'المستخلص غير موجود'; end if;
  if not public.has_project_capability('projects.claims.submit',c.project_id,c.net_payable) then
    raise exception 'لا تملك صلاحية إرسال هذا المستخلص';
  end if;
  if c.status<>'draft' then
    raise exception 'يمكن إرسال المستخلصات المسودة فقط للاعتماد الداخلي';
  end if;

  select p.name_ar into v_project_name from public.projects p where p.id=c.project_id;

  select jsonb_build_object(
    'claim_id',c.id,
    'claim_no',c.claim_no,
    'project_id',c.project_id,
    'project_name',v_project_name,
    'period_from',c.period_from,
    'period_to',c.period_to,
    'gross_amount',c.gross_amount,
    'retention_amount',c.retention_amount,
    'advance_recovery',c.advance_recovery,
    'other_deductions',c.other_deductions,
    'vat_rate',c.vat_rate,
    'vat_amount',c.vat_amount,
    'net_payable',c.net_payable,
    'lines',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'project_item_id',cl.project_item_id,
          'description',pi.description_ar,
          'qty_previous',cl.qty_previous,
          'qty_this',cl.qty_this,
          'unit_price',cl.unit_price,
          'amount',cl.amount
        ) order by pi.sort_order
      ) filter(where cl.project_item_id is not null),
      '[]'::jsonb
    )
  ) into v_snapshot
  from public.claim_lines cl
  left join public.project_items pi on pi.id=cl.project_item_id
  where cl.claim_id=c.id;

  v_workflow_id:=private.fn_approval_start(
    'progress_claim','progress_claims',c.id,'مستخلص / مقايسة',
    c.project_id,c.net_payable,v_snapshot,p_note,null,null
  );

  select version_no into v_version
  from public.approval_workflows
  where id=v_workflow_id;

  update public.approval_workflow_steps
  set target_group_key='module:projects',
      target_group_label='مراجعة إدارة المشاريع',
      target_portal_key='projects',
      request_reason=coalesce(nullif(trim(p_note),''),'مراجعة التمتير والكميات والمستندات المؤيدة')
  where workflow_id=v_workflow_id
    and version_no=v_version
    and step_order=1;

  insert into public.approval_workflow_steps(
    workflow_id,version_no,step_order,target_type,target_capability,
    target_group_key,target_group_label,requested_by_user_id,request_reason,is_additional,target_portal_key
  ) values
  (
    v_workflow_id,v_version,2,'capability','finance.projects.review',
    'module:finance','المراجعة المالية',auth.uid(),
    'مراجعة الأسعار والضريبة والمحتجزات والدفعة المقدمة والخصومات',false,'finance'
  ),
  (
    v_workflow_id,v_version,3,'capability','system.approvals.final_approve',
    'module:system','الاعتماد النهائي',auth.uid(),
    'اعتماد إصدار المطالبة بعد اكتمال المراجعتين الفنية والمالية',false,'admin'
  );

  return v_workflow_id;
end;
$$;

revoke all on function public.fn_submit_progress_claim_for_approval(uuid,text) from public;
grant execute on function public.fn_submit_progress_claim_for_approval(uuid,text) to authenticated;

-- 6) ترقية الرحلات الحالية التي ما زالت في أول خطوة ولم يتخذ فيها قرار بعد.
-- نحافظ على مستخدم المالية المسند إليه حاليًا، ونضيف قبله مراجعة المشاريع وبعده الاعتماد النهائي.
with legacy as (
  select w.id as workflow_id,w.version_no,w.origin_user_id,s.id as step_id
  from public.approval_workflows w
  join public.approval_workflow_steps s
    on s.workflow_id=w.id and s.version_no=w.version_no
  where w.transaction_type='progress_claim'
    and w.status='pending'
    and s.status='pending'
    and s.acted_at is null
    and (
      select count(*)
      from public.approval_workflow_steps x
      where x.workflow_id=w.id and x.version_no=w.version_no
    )=1
)
update public.approval_workflow_steps s
set step_order=2,
    target_group_key='module:finance',
    target_group_label='المراجعة المالية',
    target_portal_key='finance',
    request_reason=coalesce(s.request_reason,'مراجعة الأسعار والضريبة والمحتجزات والدفعة المقدمة والخصومات')
from legacy l
where s.id=l.step_id;

insert into public.approval_workflow_steps(
  workflow_id,version_no,step_order,target_type,target_capability,
  target_group_key,target_group_label,requested_by_user_id,request_reason,is_additional,target_portal_key
)
select
  w.id,w.version_no,1,'capability','projects.claims.review',
  'module:projects','مراجعة إدارة المشاريع',w.origin_user_id,
  'مراجعة التمتير والكميات والمستندات المؤيدة',false,'projects'
from public.approval_workflows w
where w.transaction_type='progress_claim'
  and w.status='pending'
  and not exists(
    select 1 from public.approval_workflow_steps s
    where s.workflow_id=w.id and s.version_no=w.version_no and s.target_group_key='module:projects'
  )
  and exists(
    select 1 from public.approval_workflow_steps s
    where s.workflow_id=w.id and s.version_no=w.version_no
      and s.step_order=2 and s.status='pending' and s.acted_at is null
      and s.target_group_key='module:finance'
  );

insert into public.approval_workflow_steps(
  workflow_id,version_no,step_order,target_type,target_capability,
  target_group_key,target_group_label,requested_by_user_id,request_reason,is_additional,target_portal_key
)
select
  w.id,w.version_no,3,'capability','system.approvals.final_approve',
  'module:system','الاعتماد النهائي',w.origin_user_id,
  'اعتماد إصدار المطالبة بعد اكتمال المراجعتين الفنية والمالية',false,'admin'
from public.approval_workflows w
where w.transaction_type='progress_claim'
  and w.status='pending'
  and not exists(
    select 1 from public.approval_workflow_steps s
    where s.workflow_id=w.id and s.version_no=w.version_no and s.target_group_key='module:system'
  )
  and exists(
    select 1 from public.approval_workflow_steps s
    where s.workflow_id=w.id and s.version_no=w.version_no
      and s.step_order=1 and s.target_group_key='module:projects'
  );

comment on function public.fn_submit_progress_claim_for_approval(uuid,text) is
  'Creates the fixed three-stage internal approval route for project claims: project review, finance review, final approval.';
