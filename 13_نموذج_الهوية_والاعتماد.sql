-- ============================================================
-- الملف 13 : فصل مستخدم النظام عن صاحب الإجراء وصاحب الاعتماد
-- هذا الملف Additive فقط في المرحلة الأولى ولا يلغي الحقول القديمة
-- الهدف: دعم المستخدم الرئيسي الذي يسجل الإجراءات نيابة عن أصحابها
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

alter table approvals drop constraint if exists approvals_approval_method_check;
alter table approvals add constraint approvals_approval_method_check
  check (approval_method is null or approval_method in ('manual','electronic','email','other'));

comment on column approvals.actor_employee_id is
  'الشخص الذي اتخذ القرار الإداري فعليًا. لا يعني مستخدم النظام الذي سجل القرار.';
comment on column approvals.actor_position_snapshot is
  'لقطة المنصب الإداري وقت الاعتماد للحفاظ على التاريخ حتى لو تغير المنصب لاحقًا.';
comment on column approvals.actor_job_title_snapshot is
  'لقطة المسمى الوظيفي وقت الاعتماد.';
comment on column approvals.recorded_by_user_id is
  'حساب مستخدم النظام الذي سجل الاعتماد في البرنامج.';
comment on column approvals.decision_date is
  'تاريخ القرار أو التوقيع الفعلي، وقد يسبق وقت تسجيله في النظام.';

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
  'صلاحية تشغيل كاملة للبرنامج. مستقلة عن المنصب أو المسمى الوظيفي للموظف.';

-- لا نغيّر role الحالي هنا لأن وظائف وسياسات قائمة تعتمد عليه.
-- سيتم فصل نظام الدخول عن الأدوار الوظيفية في مرحلة لاحقة بعد تحديث الواجهة والـ RPCs.

-- ------------------------------------------------------------
-- 4. دالة مساعدة لاستخراج لقطة صفة الموظف الحالية
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
-- 5. تسجيل اعتماد يدوي عام
-- لا يغيّر حالة المعاملة تلقائيًا في هذه المرحلة.
-- تغيير الحالة يبقى بيد منطق كل عملية إلى أن يتم توحيده لاحقًا.
-- ------------------------------------------------------------
create or replace function record_manual_approval(
  p_entity_table text,
  p_entity_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null,
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
  v_legacy_role user_role;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول لتسجيل الاعتماد';
  end if;

  if p_entity_table is null or trim(p_entity_table) = '' then
    raise exception 'نوع المعاملة مطلوب';
  end if;

  if p_actor_employee_id is null then
    raise exception 'صاحب الاعتماد مطلوب';
  end if;

  if p_decision not in ('approved','rejected','reviewed','noted') then
    raise exception 'قرار غير مدعوم';
  end if;

  select * into v_snapshot
  from employee_identity_snapshot(p_actor_employee_id);

  if v_snapshot.employee_id is null then
    raise exception 'صاحب الاعتماد غير موجود في سجل الأشخاص';
  end if;

  v_legacy_role := current_app_role();
  if v_legacy_role is null then
    raise exception 'مستخدم النظام غير مفعّل';
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
    source
  ) values (
    p_entity_table,
    p_entity_id,
    v_step,
    v_legacy_role,
    p_decision,
    auth.uid(),
    now(),
    p_comment,
    p_actor_employee_id,
    v_snapshot.board_role,
    v_snapshot.job_title,
    'manual',
    p_decision_date,
    p_evidence_path,
    auth.uid(),
    now(),
    coalesce(nullif(trim(p_source), ''), 'manual')
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function record_manual_approval(text, uuid, uuid, text, date, text, text, text) from public;
grant execute on function record_manual_approval(text, uuid, uuid, text, date, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6. View للقراءة الإدارية الواضحة للاعتمادات
-- ------------------------------------------------------------
create or replace view v_approval_register
with (security_invoker = true)
as
select
  a.id,
  a.entity_table,
  a.entity_id,
  a.step_order,
  a.decision,
  a.decision_date,
  a.approval_method,
  a.actor_employee_id,
  e.full_name_ar as actor_name,
  a.actor_position_snapshot,
  a.actor_job_title_snapshot,
  concat_ws(' و', nullif(trim(a.actor_position_snapshot), ''), nullif(trim(a.actor_job_title_snapshot), '')) as actor_title,
  a.comment,
  a.evidence_path,
  a.recorded_by_user_id,
  au.employee_id as recorded_by_employee_id,
  recorder.full_name_ar as recorded_by_name,
  a.recorded_at,
  a.source,
  a.step_role as legacy_step_role,
  a.decided_by as legacy_decided_by
from approvals a
left join employees e on e.id = a.actor_employee_id
left join app_users au on au.id = a.recorded_by_user_id
left join employees recorder on recorder.id = au.employee_id;

-- ------------------------------------------------------------
-- 7. ملاحظة انتقالية
-- ------------------------------------------------------------
-- الحقول القديمة approvals.step_role و approvals.decided_by تبقى مؤقتًا للتوافق.
-- record_manual_approval يملؤها مؤقتًا بهوية مشغل النظام فقط حتى لا تنكسر القيود الحالية.
-- المصدر الإداري الصحيح لأي تطوير جديد هو actor_employee_id وحقول الـ snapshot.
-- approve_leave و approve_advance سيعاد تصميمهما لاحقًا ليستعملا هذا النموذج
-- ثم يطبقا الأثر المالي أو الإداري بعد تسجيل صاحب القرار الحقيقي.
