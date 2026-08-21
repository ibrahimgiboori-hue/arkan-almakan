-- ============================================================
-- الملف 13 : فصل مستخدم النظام عن صاحب الإجراء وصاحب الاعتماد
-- المرحلة الأولى من نموذج التشغيل المركزي
--
-- القاعدة الأساسية:
-- من يستخدم البرنامج لا يُفترض أنه صاحب القرار الإداري.
-- مستخدم النظام يسجل ما حدث فعليًا، وصاحب القرار يُحفظ كشخص مستقل.
--
-- هذا الملف انتقالي ويحافظ على الحقول والحالات القديمة حتى لا يكسر النظام.
-- ============================================================

-- ------------------------------------------------------------
-- 1. تطوير سجل الاعتمادات دون كسر التصميم القديم
-- ------------------------------------------------------------
alter table approvals add column if not exists actor_employee_id uuid references employees(id);
alter table approvals add column if not exists actor_position_snapshot text;
alter table approvals add column if not exists actor_job_title_snapshot text;
alter table approvals add column if not exists approval_method text;
alter table approvals add column if not exists decision_date date;
alter table approvals add column if not exists evidence_path text;
alter table approvals add column if not exists recorded_by_user_id uuid;
alter table approvals add column if not exists recorded_at timestamptz not null default now();
alter table approvals add column if not exists source text;
alter table approvals add column if not exists stage_code text;
alter table approvals add column if not exists stage_label_snapshot text;

-- step_role كان يربط الاعتماد بدور مستخدم البرنامج.
-- نُبقي العمود للتوافق مع البيانات القديمة، لكن الاعتمادات الجديدة لا تحتاجه.
alter table approvals alter column step_role drop not null;

alter table approvals drop constraint if exists approvals_approval_method_check;
alter table approvals add constraint approvals_approval_method_check
  check (approval_method is null or approval_method in ('manual','electronic','email','other'));

comment on column approvals.actor_employee_id is
  'الشخص الذي اتخذ القرار الإداري فعليًا، وليس مستخدم النظام الذي سجل القرار.';
comment on column approvals.actor_position_snapshot is
  'لقطة المنصب الإداري وقت الاعتماد للحفاظ على التاريخ حتى لو تغير المنصب لاحقًا.';
comment on column approvals.actor_job_title_snapshot is
  'لقطة المسمى الوظيفي وقت الاعتماد.';
comment on column approvals.recorded_by_user_id is
  'حساب مستخدم النظام الذي سجل الاعتماد في البرنامج.';
comment on column approvals.decision_date is
  'تاريخ القرار أو التوقيع الفعلي، وقد يسبق وقت تسجيله في النظام.';
comment on column approvals.stage_code is
  'مرحلة الإجراء بصيغة محايدة مثل administrative_review أو financial_review أو final_approval.';

-- ------------------------------------------------------------
-- 2. تطوير المستندات: الإنشاء داخل النظام لا يساوي الإصدار الإداري
-- ------------------------------------------------------------
alter table documents add column if not exists issuer_employee_id uuid references employees(id);
alter table documents add column if not exists issuer_position_snapshot text;
alter table documents add column if not exists issuer_job_title_snapshot text;
alter table documents add column if not exists signatory_employee_id uuid references employees(id);
alter table documents add column if not exists signatory_position_snapshot text;
alter table documents add column if not exists signatory_job_title_snapshot text;
alter table documents add column if not exists issue_recorded_by_user_id uuid;
alter table documents add column if not exists issue_method text;

alter table documents drop constraint if exists documents_issue_method_check;
alter table documents add constraint documents_issue_method_check
  check (issue_method is null or issue_method in ('manual','electronic','email','other'));

comment on column documents.issuer_employee_id is
  'الشخص الذي صدر عنه المستند إداريًا، وليس بالضرورة من أنشأه داخل النظام.';
comment on column documents.signatory_employee_id is
  'الشخص الذي يوقع المستند رسميًا.';
comment on column documents.issue_recorded_by_user_id is
  'مستخدم النظام الذي سجل إصدار المستند.';

-- ------------------------------------------------------------
-- 3. حسابات النظام: إبقاء role القديم للتوافق وإضافة مفهوم المشغل
-- ------------------------------------------------------------
alter table app_users add column if not exists is_system_admin boolean not null default false;
alter table app_users add column if not exists access_note text;

comment on column app_users.is_system_admin is
  'صلاحية تشغيل كاملة للبرنامج، مستقلة عن المنصب أو المسمى الوظيفي للموظف.';

-- لا نغيّر role الحالي هنا لأن وظائف وسياسات قائمة تعتمد عليه.
-- سيتم فصل نظام الدخول عن الأدوار الوظيفية تدريجيًا بعد تحديث الواجهة والـ RPCs.

-- ------------------------------------------------------------
-- 4. السلف: فصل الاعتماد عن الصرف الفعلي
-- ------------------------------------------------------------
alter table advances add column if not exists disbursement_reference text;
alter table advances add column if not exists disbursement_evidence_path text;
alter table advances add column if not exists disbursement_recorded_by_user_id uuid;
alter table advances add column if not exists disbursement_recorded_at timestamptz;

comment on column advances.disbursed_at is
  'تاريخ الصرف الفعلي للسلفة، ولا يُملأ بمجرد الاعتماد النهائي.';
comment on column advances.disbursement_recorded_by_user_id is
  'مستخدم النظام الذي سجل واقعة الصرف الفعلية.';

-- ------------------------------------------------------------
-- 5. دالة مساعدة لاستخراج لقطة صفة الشخص الحالية
-- ------------------------------------------------------------
create or replace function employee_identity_snapshot(p_employee uuid)
returns table (
  employee_id uuid,
  full_name_ar text,
  person_kind text,
  board_role text,
  job_title text,
  display_title text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id,
    e.full_name_ar,
    e.person_kind::text,
    nullif(trim(e.board_role), ''),
    nullif(trim(e.job_title), ''),
    case
      when e.person_kind::text = 'board' then
        concat_ws(' و', nullif(trim(e.board_role), ''), nullif(trim(e.job_title), ''))
      else
        nullif(trim(e.job_title), '')
    end
  from employees e
  where e.id = p_employee
$$;

-- ------------------------------------------------------------
-- 6. تسجيل اعتماد يدوي عام
-- هذه الدالة توثق القرار فقط ولا تغيّر حالة المعاملة بنفسها.
-- ------------------------------------------------------------
create or replace function record_manual_approval(
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
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_snapshot record;
  v_step smallint;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول لتسجيل الاعتماد';
  end if;

  if p_entity_table is null or trim(p_entity_table) = '' then
    raise exception 'نوع المعاملة مطلوب';
  end if;

  if p_actor_employee_id is null then
    raise exception 'صاحب القرار مطلوب';
  end if;

  if p_decision not in ('approved','rejected','reviewed','noted') then
    raise exception 'قرار غير مدعوم';
  end if;

  select * into v_snapshot
  from employee_identity_snapshot(p_actor_employee_id);

  if v_snapshot.employee_id is null then
    raise exception 'صاحب القرار غير موجود في سجل الأشخاص';
  end if;

  select coalesce(max(step_order), 0) + 1
    into v_step
    from approvals
   where entity_table = p_entity_table
     and entity_id = p_entity_id;

  insert into approvals (
    entity_table,
    entity_id,
    step_order,
    step_role,
    decision,
    decided_by,
    decided_at,
    comment,
    actor_employee_id,
    actor_position_snapshot,
    actor_job_title_snapshot,
    approval_method,
    decision_date,
    evidence_path,
    recorded_by_user_id,
    recorded_at,
    source,
    stage_code,
    stage_label_snapshot
  ) values (
    p_entity_table,
    p_entity_id,
    v_step,
    null,
    p_decision,
    auth.uid(),
    now(),
    p_comment,
    p_actor_employee_id,
    v_snapshot.board_role,
    v_snapshot.job_title,
    'manual',
    coalesce(p_decision_date, current_date),
    p_evidence_path,
    auth.uid(),
    now(),
    coalesce(nullif(trim(p_source), ''), 'manual'),
    nullif(trim(p_stage_code), ''),
    nullif(trim(p_stage_label), '')
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function record_manual_approval(text, uuid, uuid, text, date, text, text, text, text, text) from public;
grant execute on function record_manual_approval(text, uuid, uuid, text, date, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 7. تسجيل قرار إجازة يدوي وتطبيق أثره بصورة ذرية
-- نحافظ مؤقتًا على أسماء الحالات القديمة للتوافق، لكننا لا نربطها بدور المستخدم الحالي.
-- ------------------------------------------------------------
create or replace function record_leave_manual_decision(
  p_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null
)
returns request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row leave_requests;
  v_new request_status;
  v_year integer;
  v_stage_code text;
  v_stage_label text;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_row
    from leave_requests
   where id = p_id
   for update;

  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_row.status in ('ceo_approved','rejected','cancelled') then
    raise exception 'هذا الطلب مغلق ولا يقبل قرارًا جديدًا';
  end if;

  if v_row.status in ('draft','submitted') then
    v_stage_code := 'administrative_review';
    v_stage_label := 'مراجعة الطلب';
  elsif v_row.status = 'hr_reviewed' then
    v_stage_code := 'final_approval';
    v_stage_label := 'الاعتماد النهائي';
  else
    raise exception 'حالة الطلب الحالية غير مدعومة';
  end if;

  if p_decision = 'rejected' then
    v_new := 'rejected';
  elsif p_decision = 'approved' then
    if v_row.status in ('draft','submitted') then
      v_new := 'hr_reviewed';
    else
      v_new := 'ceo_approved';
    end if;
  else
    raise exception 'القرار يجب أن يكون approved أو rejected';
  end if;

  perform record_manual_approval(
    'leave_requests', p_id, p_actor_employee_id, p_decision,
    p_decision_date, p_comment, p_evidence_path,
    v_stage_code, v_stage_label, 'leave_request'
  );

  update leave_requests set status = v_new where id = p_id;

  -- خصم الرصيد عند الاعتماد النهائي للإجازة السنوية فقط.
  if v_new = 'ceo_approved' and v_row.leave_kind = 'annual' then
    v_year := extract(year from v_row.start_date)::int;
    insert into leave_balances (employee_id, year, leave_kind, entitled_days, used_days)
    values (v_row.employee_id, v_year, 'annual', 21, v_row.days_count)
    on conflict (employee_id, year, leave_kind)
      do update set used_days = leave_balances.used_days + v_row.days_count;
  end if;

  return v_new;
end $$;

revoke all on function record_leave_manual_decision(uuid, uuid, text, date, text, text) from public;
grant execute on function record_leave_manual_decision(uuid, uuid, text, date, text, text) to authenticated;

-- ------------------------------------------------------------
-- 8. تسجيل قرار سلفة يدوي
-- الاعتماد النهائي لا يعني أن المال صُرف.
-- ------------------------------------------------------------
create or replace function record_advance_manual_decision(
  p_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null
)
returns request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row advances;
  v_new request_status;
  v_stage_code text;
  v_stage_label text;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_row
    from advances
   where id = p_id
   for update;

  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_row.status in ('ceo_approved','rejected','cancelled') then
    raise exception 'هذا الطلب مغلق ولا يقبل قرارًا جديدًا';
  end if;

  if v_row.status in ('draft','submitted') then
    v_stage_code := 'administrative_review';
    v_stage_label := 'المراجعة الإدارية';
  elsif v_row.status = 'hr_reviewed' then
    v_stage_code := 'financial_review';
    v_stage_label := 'المراجعة المالية';
  elsif v_row.status = 'accountant_approved' then
    v_stage_code := 'final_approval';
    v_stage_label := 'الاعتماد النهائي';
  else
    raise exception 'حالة الطلب الحالية غير مدعومة';
  end if;

  if p_decision = 'rejected' then
    v_new := 'rejected';
  elsif p_decision = 'approved' then
    if v_row.status in ('draft','submitted') then
      v_new := 'hr_reviewed';
    elsif v_row.status = 'hr_reviewed' then
      v_new := 'accountant_approved';
    else
      v_new := 'ceo_approved';
    end if;
  else
    raise exception 'القرار يجب أن يكون approved أو rejected';
  end if;

  perform record_manual_approval(
    'advances', p_id, p_actor_employee_id, p_decision,
    p_decision_date, p_comment, p_evidence_path,
    v_stage_code, v_stage_label, 'advance_request'
  );

  update advances
     set status = v_new
   where id = p_id;

  return v_new;
end $$;

revoke all on function record_advance_manual_decision(uuid, uuid, text, date, text, text) from public;
grant execute on function record_advance_manual_decision(uuid, uuid, text, date, text, text) to authenticated;

-- ------------------------------------------------------------
-- 9. تسجيل صرف السلفة بعد الاعتماد النهائي
-- هنا فقط تتحول السلفة إلى مديونية فعلية وتُنشأ الأقساط.
-- ------------------------------------------------------------
create or replace function record_advance_disbursement(
  p_id uuid,
  p_disbursed_date date default current_date,
  p_reference text default null,
  p_evidence_path text default null
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row advances;
  v_per numeric(12,2);
  v_last numeric(12,2);
  v_start date;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_row
    from advances
   where id = p_id
   for update;

  if v_row.id is null then raise exception 'السلفة غير موجودة'; end if;
  if v_row.status <> 'ceo_approved' then
    raise exception 'لا يمكن تسجيل الصرف قبل الاعتماد النهائي';
  end if;
  if v_row.disbursed_at is not null then
    raise exception 'تم تسجيل صرف هذه السلفة سابقًا بتاريخ %', v_row.disbursed_at;
  end if;
  if v_row.installments is null or v_row.installments < 1 then
    raise exception 'عدد الأقساط غير صحيح';
  end if;

  update advances set
    disbursed_at = coalesce(p_disbursed_date, current_date),
    disbursement_reference = nullif(trim(p_reference), ''),
    disbursement_evidence_path = nullif(trim(p_evidence_path), ''),
    disbursement_recorded_by_user_id = auth.uid(),
    disbursement_recorded_at = now()
  where id = p_id;

  delete from advance_installments where advance_id = p_id;

  v_per := round(v_row.amount / v_row.installments, 2);
  v_last := v_row.amount - (v_per * (v_row.installments - 1));
  v_start := date_trunc(
    'month',
    coalesce(v_row.first_deduction_month, coalesce(p_disbursed_date, current_date) + interval '1 month')
  )::date;

  for i in 1..v_row.installments loop
    insert into advance_installments (advance_id, due_month, amount)
    values (
      p_id,
      (v_start + ((i - 1) || ' month')::interval)::date,
      case when i = v_row.installments then v_last else v_per end
    );
  end loop;

  return coalesce(p_disbursed_date, current_date);
end $$;

revoke all on function record_advance_disbursement(uuid, date, text, text) from public;
grant execute on function record_advance_disbursement(uuid, date, text, text) to authenticated;

-- ------------------------------------------------------------
-- 10. View للقراءة الإدارية الواضحة للاعتمادات
-- ------------------------------------------------------------
create or replace view v_approval_register
with (security_invoker = true)
as
select
  a.id,
  a.entity_table,
  a.entity_id,
  a.step_order,
  a.stage_code,
  a.stage_label_snapshot,
  a.decision,
  a.decision_date,
  a.approval_method,
  a.actor_employee_id,
  e.full_name_ar as actor_name,
  a.actor_position_snapshot,
  a.actor_job_title_snapshot,
  case
    when e.person_kind::text = 'board' then
      concat_ws(' و', nullif(trim(a.actor_position_snapshot), ''), nullif(trim(a.actor_job_title_snapshot), ''))
    else
      nullif(trim(a.actor_job_title_snapshot), '')
  end as actor_title,
  a.comment,
  a.evidence_path,
  a.recorded_by_user_id,
  au.employee_id as recorded_by_employee_id,
  recorder.full_name_ar as recorded_by_name,
  a.recorded_at,
  a.source
from approvals a
left join employees e on e.id = a.actor_employee_id
left join app_users au on au.id = a.recorded_by_user_id
left join employees recorder on recorder.id = au.employee_id;

-- ------------------------------------------------------------
-- 11. ملاحظة انتقالية
-- ------------------------------------------------------------
-- الحقول القديمة approvals.step_role و approvals.decided_by تبقى مؤقتًا للتوافق.
-- approve_leave و approve_advance القديمتان تبقيان مؤقتًا حتى اكتمال تحديث الواجهة.
-- التطوير الجديد يستخدم record_leave_manual_decision و record_advance_manual_decision.
-- بعد انتقال جميع الشاشات سنوقف الوظائف القديمة بمراجعة مستقلة.
