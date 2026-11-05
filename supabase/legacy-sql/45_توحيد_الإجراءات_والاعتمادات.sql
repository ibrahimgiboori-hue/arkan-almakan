-- توحيد مفهوم الإجراء والمعاملة والاعتماد في كل النظام.
-- الإجراء ليس بالضرورة اعتماداً: قد يكون إعداداً أو تسجيلًا أو مراجعة أو موافقة أو إقراراً أو اعتماداً نهائياً.

alter table public.approvals add column if not exists action_code text;
alter table public.approvals add column if not exists action_label_snapshot text;
alter table public.approvals add column if not exists is_final_action boolean not null default false;
alter table public.approvals add column if not exists scenario_snapshot text;

create table if not exists public.workflow_action_defs (
  transaction_type text not null,
  scenario_code text not null check (scenario_code in ('normal','exceptional')),
  step_order smallint not null check (step_order > 0),
  action_code text not null,
  action_label text not null,
  is_final boolean not null default false,
  is_active boolean not null default true,
  primary key (transaction_type, scenario_code, step_order)
);

insert into public.workflow_action_defs(transaction_type,scenario_code,step_order,action_code,action_label,is_final) values
('leave','normal',1,'review_approval','مراجعة وموافقة',false),
('leave','normal',2,'final_approval','اعتماد نهائي',true),
('leave','exceptional',1,'prepare_register','إعداد وتسجيل الطلب',false),
('leave','exceptional',2,'final_approval','اعتماد نهائي',true),
('advance','normal',1,'review','مراجعة',false),
('advance','normal',2,'financial_review','مراجعة مالية وموافقة',false),
('advance','normal',3,'final_approval','اعتماد نهائي',true),
('advance','exceptional',1,'prepare_register','إعداد وتسجيل الطلب',false),
('advance','exceptional',2,'financial_review','مراجعة مالية',false),
('advance','exceptional',3,'final_approval','اعتماد نهائي',true)
on conflict (transaction_type,scenario_code,step_order) do update set
 action_code=excluded.action_code, action_label=excluded.action_label,
 is_final=excluded.is_final, is_active=true;

update public.approvals
set action_code = coalesce(action_code, case
      when stage_code='final_approval' then 'final_approval'
      when stage_code='financial_review' then 'financial_review'
      when stage_code in ('administrative_review','review') then 'review'
      else 'register' end),
    action_label_snapshot = coalesce(action_label_snapshot, stage_label_snapshot,
      case when stage_code='final_approval' then 'اعتماد نهائي'
           when stage_code='financial_review' then 'مراجعة مالية'
           when stage_code in ('administrative_review','review') then 'مراجعة'
           else 'تسجيل الإجراء' end),
    is_final_action = case when stage_code='final_approval' then true else is_final_action end
where action_code is null or action_label_snapshot is null or stage_code='final_approval';

create or replace function public.leave_request_scenario(p_id uuid)
returns text language plpgsql stable set search_path=public as $$
declare
  v_row public.leave_requests;
  v_return date;
  v_balance integer;
  v_expected integer;
begin
  select * into v_row from public.leave_requests where id=p_id;
  if v_row.id is null or v_row.leave_kind::text <> 'annual' then return 'normal'; end if;
  v_return := coalesce(v_row.actual_return_date, v_row.end_date + 1);
  select s.actual_balance into v_balance
  from public.leave_balance_snapshot(v_row.employee_id, v_return, p_id) s limit 1;
  v_expected := coalesce(v_balance,0) - coalesce(v_row.days_count,0);
  return case when v_expected < 0 then 'exceptional' else 'normal' end;
end $$;

create or replace function public.record_business_action(
  p_entity_table text,
  p_entity_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null,
  p_stage_code text default null,
  p_stage_label text default null,
  p_source text default 'manual',
  p_action_code text default 'register',
  p_action_label text default 'تسجيل الإجراء',
  p_is_final boolean default false,
  p_scenario text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_snapshot record;
  v_step smallint;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول لتسجيل الإجراء'; end if;
  if p_entity_table is null or trim(p_entity_table)='' then raise exception 'نوع المعاملة مطلوب'; end if;
  if p_actor_employee_id is null then raise exception 'القائم بالإجراء مطلوب'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'نتيجة الإجراء غير مدعومة'; end if;
  if coalesce(trim(p_action_code),'')='' then raise exception 'نوع الإجراء مطلوب'; end if;

  select * into v_snapshot from public.employee_identity_snapshot(p_actor_employee_id);
  if v_snapshot.employee_id is null then raise exception 'القائم بالإجراء غير موجود في سجل الأشخاص'; end if;

  select coalesce(max(step_order),0)+1 into v_step
  from public.approvals where entity_table=p_entity_table and entity_id=p_entity_id;

  insert into public.approvals(
    entity_table,entity_id,step_order,step_role,decision,decided_by,decided_at,comment,
    actor_employee_id,actor_position_snapshot,actor_job_title_snapshot,
    approval_method,decision_date,evidence_path,recorded_by_user_id,recorded_at,
    source,stage_code,stage_label_snapshot,
    action_code,action_label_snapshot,is_final_action,scenario_snapshot
  ) values (
    p_entity_table,p_entity_id,v_step,null,p_decision,auth.uid(),now(),p_comment,
    p_actor_employee_id,v_snapshot.board_role,v_snapshot.job_title,
    'manual',coalesce(p_decision_date,current_date),p_evidence_path,auth.uid(),now(),
    coalesce(nullif(trim(p_source),''),'manual'),nullif(trim(p_stage_code),''),nullif(trim(p_stage_label),''),
    trim(p_action_code),coalesce(nullif(trim(p_action_label),''),'تسجيل الإجراء'),coalesce(p_is_final,false),nullif(trim(p_scenario),'')
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.record_manual_approval(
  p_entity_table text,
  p_entity_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null,
  p_stage_code text default null,
  p_stage_label text default null,
  p_source text default 'manual'
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_action_code text;
  v_action_label text;
  v_final boolean;
begin
  v_action_code := case
    when p_stage_code='final_approval' then 'final_approval'
    when p_stage_code='financial_review' then 'financial_review'
    when p_stage_code in ('administrative_review','review') then 'review'
    else 'register' end;
  v_action_label := coalesce(nullif(trim(p_stage_label),''), case
    when p_stage_code='final_approval' then 'اعتماد نهائي'
    when p_stage_code='financial_review' then 'مراجعة مالية'
    when p_stage_code in ('administrative_review','review') then 'مراجعة'
    else 'تسجيل الإجراء' end);
  v_final := p_stage_code='final_approval';
  return public.record_business_action(
    p_entity_table,p_entity_id,p_actor_employee_id,p_decision,p_decision_date,p_comment,p_evidence_path,
    p_stage_code,p_stage_label,p_source,v_action_code,v_action_label,v_final,null
  );
end $$;

create or replace function public.record_leave_manual_decision(
  p_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null
) returns request_status language plpgsql security definer set search_path=public as $$
declare
  v_row public.leave_requests;
  v_new request_status;
  v_stage_code text;
  v_stage_label text;
  v_action_code text;
  v_action_label text;
  v_final boolean := false;
  v_scenario text;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from public.leave_requests where id=p_id for update;
  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_row.status in ('ceo_approved','rejected','cancelled') then raise exception 'هذا الطلب مغلق ولا يقبل إجراءً جديداً'; end if;

  v_scenario := public.leave_request_scenario(p_id);
  if v_row.status in ('draft','submitted') then
    if v_scenario='exceptional' then
      v_stage_code:='prepare_register'; v_stage_label:='إعداد وتسجيل الطلب';
      v_action_code:='prepare_register'; v_action_label:='إعداد وتسجيل الطلب';
    else
      v_stage_code:='administrative_review'; v_stage_label:='مراجعة وموافقة';
      v_action_code:='review_approval'; v_action_label:='مراجعة وموافقة';
    end if;
  elsif v_row.status='hr_reviewed' then
    v_stage_code:='final_approval'; v_stage_label:='الاعتماد النهائي';
    v_action_code:='final_approval'; v_action_label:='اعتماد نهائي'; v_final:=true;
  else raise exception 'حالة الطلب الحالية غير مدعومة'; end if;

  if p_decision='rejected' then v_new:='rejected';
  elsif p_decision='approved' then
    if v_row.status in ('draft','submitted') then v_new:='hr_reviewed'; else v_new:='ceo_approved'; end if;
  else raise exception 'نتيجة الإجراء يجب أن تكون approved أو rejected'; end if;

  perform public.record_business_action(
    'leave_requests',p_id,p_actor_employee_id,p_decision,p_decision_date,p_comment,p_evidence_path,
    v_stage_code,v_stage_label,'leave_request',v_action_code,v_action_label,v_final,v_scenario
  );
  update public.leave_requests set status=v_new where id=p_id;
  return v_new;
end $$;

create or replace function public.record_advance_manual_decision(
  p_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null
) returns request_status language plpgsql security definer set search_path=public as $$
declare
  v_row public.advances;
  v_new request_status;
  v_stage_code text;
  v_stage_label text;
  v_action_code text;
  v_action_label text;
  v_final boolean := false;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from public.advances where id=p_id for update;
  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_row.status in ('ceo_approved','rejected','cancelled') then raise exception 'هذا الطلب مغلق ولا يقبل إجراءً جديدًا'; end if;

  if v_row.status in ('draft','submitted') then
    v_stage_code:='administrative_review'; v_stage_label:='مراجعة'; v_action_code:='review'; v_action_label:='مراجعة';
  elsif v_row.status='hr_reviewed' then
    v_stage_code:='financial_review'; v_stage_label:='مراجعة مالية وموافقة'; v_action_code:='financial_review'; v_action_label:='مراجعة مالية وموافقة';
  elsif v_row.status='accountant_approved' then
    v_stage_code:='final_approval'; v_stage_label:='الاعتماد النهائي'; v_action_code:='final_approval'; v_action_label:='اعتماد نهائي'; v_final:=true;
  else raise exception 'حالة الطلب الحالية غير مدعومة'; end if;

  if p_decision='rejected' then v_new:='rejected';
  elsif p_decision='approved' then
    if v_row.status in ('draft','submitted') then v_new:='hr_reviewed';
    elsif v_row.status='hr_reviewed' then v_new:='accountant_approved';
    else v_new:='ceo_approved'; end if;
  else raise exception 'نتيجة الإجراء يجب أن تكون approved أو rejected'; end if;

  perform public.record_business_action(
    'advances',p_id,p_actor_employee_id,p_decision,p_decision_date,p_comment,p_evidence_path,
    v_stage_code,v_stage_label,'advance_request',v_action_code,v_action_label,v_final,'normal'
  );
  update public.advances set status=v_new where id=p_id;
  return v_new;
end $$;

create or replace view public.v_approval_register as
select a.id,a.entity_table,a.entity_id,a.step_order,
       a.stage_code,a.stage_label_snapshot,
       a.decision,a.decision_date,a.approval_method,a.actor_employee_id,
       e.full_name_ar as actor_name,
       a.actor_position_snapshot,a.actor_job_title_snapshot,
       case when e.person_kind::text='board' then concat_ws(' و',nullif(trim(a.actor_position_snapshot),''),nullif(trim(a.actor_job_title_snapshot),''))
            else nullif(trim(a.actor_job_title_snapshot),'') end as actor_title,
       a.comment,a.evidence_path,a.recorded_by_user_id,
       au.employee_id as recorded_by_employee_id,
       recorder.full_name_ar as recorded_by_name,
       a.recorded_at,a.source,
       a.action_code,a.action_label_snapshot,a.is_final_action,a.scenario_snapshot
from public.approvals a
left join public.employees e on e.id=a.actor_employee_id
left join public.app_users au on au.id=a.recorded_by_user_id
left join public.employees recorder on recorder.id=au.employee_id;
