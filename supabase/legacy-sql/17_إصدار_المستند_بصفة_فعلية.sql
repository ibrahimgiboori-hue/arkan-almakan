-- ============================================================
-- الملف 17 : إصدار المستند بصفته الإدارية الفعلية
--
-- يفصل بين:
-- 1. مستخدم النظام الذي سجل الإصدار
-- 2. الشخص الذي صدر عنه المستند
-- 3. الشخص الذي يوقع المستند
-- ============================================================

create or replace function issue_document_manual(
  p_id uuid,
  p_issuer_employee_id uuid default null,
  p_signatory_employee_id uuid default null,
  p_issue_method text default 'manual'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d documents;
  t document_templates;
  v_no text;
  v_issuer record;
  v_signatory record;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول لإصدار المستند';
  end if;

  if p_issue_method not in ('manual','electronic','email','other') then
    raise exception 'طريقة الإصدار غير مدعومة';
  end if;

  select * into d
    from documents
   where id = p_id
   for update;

  if d.id is null then raise exception 'المستند غير موجود'; end if;
  if d.status <> 'draft' or d.issued_at is not null then
    raise exception 'هذا المستند صادر سابقًا برقم %', d.doc_number;
  end if;

  if p_issuer_employee_id is not null then
    select * into v_issuer from employee_identity_snapshot(p_issuer_employee_id);
    if v_issuer.employee_id is null then
      raise exception 'الشخص الصادر عنه المستند غير موجود';
    end if;
  end if;

  if p_signatory_employee_id is not null then
    select * into v_signatory from employee_identity_snapshot(p_signatory_employee_id);
    if v_signatory.employee_id is null then
      raise exception 'الموقع على المستند غير موجود';
    end if;
  end if;

  select * into t
    from document_templates
   where code = d.template_code;

  v_no := next_document_number(d.template_code, coalesce(t.prefix, 'DOC'));

  update documents set
    doc_number = v_no,
    status = 'submitted',
    issued_at = now(),

    -- الحقل القديم يبقى كتتبع تقني لمستخدم النظام للتوافق.
    issued_by = auth.uid(),
    issue_recorded_by_user_id = auth.uid(),
    issue_method = p_issue_method,

    issuer_employee_id = p_issuer_employee_id,
    issuer_position_snapshot = case when p_issuer_employee_id is null then null else v_issuer.board_role end,
    issuer_job_title_snapshot = case when p_issuer_employee_id is null then null else v_issuer.job_title end,

    signatory_employee_id = p_signatory_employee_id,
    signatory_position_snapshot = case when p_signatory_employee_id is null then null else v_signatory.board_role end,
    signatory_job_title_snapshot = case when p_signatory_employee_id is null then null else v_signatory.job_title end
  where id = p_id;

  return v_no;
end $$;

revoke all on function issue_document_manual(uuid, uuid, uuid, text) from public;
grant execute on function issue_document_manual(uuid, uuid, uuid, text) to authenticated;

comment on function issue_document_manual(uuid, uuid, uuid, text) is
  'إصدار مستند مع فصل مستخدم النظام عن الشخص الصادر عنه والموقع الفعلي.';
