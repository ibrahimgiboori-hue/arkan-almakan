create or replace function public.issue_document_manual(
  p_id uuid,
  p_issuer_employee_id uuid default null::uuid,
  p_signatory_employee_id uuid default null::uuid,
  p_issue_method text default 'manual'::text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d public.documents;
  t public.document_templates;
  v_no text;
  v_issuer_position text;
  v_issuer_job_title text;
  v_signatory_position text;
  v_signatory_job_title text;
  v_task_creator uuid;
  v_approval public.workspace_document_approvals;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول لإصدار المستند'; end if;
  if p_issue_method not in ('manual','electronic','email','other') then raise exception 'طريقة الإصدار غير مدعومة'; end if;

  select * into d from public.documents where id=p_id for update;
  if d.id is null then raise exception 'المستند غير موجود'; end if;
  if d.status <> 'draft' or d.issued_at is not null then raise exception 'هذا المستند صادر سابقًا برقم %',d.doc_number; end if;

  if d.workspace_task_id is not null then
    select creator_user_id into v_task_creator from public.workspace_tasks where id=d.workspace_task_id;
    if v_task_creator is null then raise exception 'TASK_NOT_FOUND'; end if;
    if v_task_creator <> auth.uid() then raise exception 'TASK_CREATOR_ONLY'; end if;
    if d.internal_approval_status <> 'approved' then raise exception 'WORKSPACE_DOCUMENT_NOT_APPROVED'; end if;
    select * into v_approval from public.workspace_document_approvals where document_id=d.id;
    if v_approval.id is null or v_approval.status <> 'approved' then raise exception 'WORKSPACE_DOCUMENT_NOT_APPROVED'; end if;
    if public.workspace_document_fingerprint(d.id) is distinct from v_approval.document_fingerprint then
      raise exception 'DOCUMENT_CHANGED_AFTER_APPROVAL';
    end if;
    p_issue_method := 'electronic';
  end if;

  if p_issuer_employee_id is not null then
    select board_role, job_title
      into v_issuer_position, v_issuer_job_title
    from public.employee_identity_snapshot(p_issuer_employee_id);
    if not found then raise exception 'الشخص الصادر عنه المستند غير موجود'; end if;
  end if;

  if p_signatory_employee_id is not null then
    select board_role, job_title
      into v_signatory_position, v_signatory_job_title
    from public.employee_identity_snapshot(p_signatory_employee_id);
    if not found then raise exception 'الموقع على المستند غير موجود'; end if;
  end if;

  select * into t from public.document_templates where code=d.template_code;
  v_no:=public.next_document_number(d.template_code,coalesce(t.prefix,'DOC'));

  update public.documents set
    doc_number=v_no,
    status='submitted',
    issued_at=now(),
    issued_by=auth.uid(),
    issue_recorded_by_user_id=auth.uid(),
    issue_method=p_issue_method,
    issuer_employee_id=p_issuer_employee_id,
    issuer_position_snapshot=v_issuer_position,
    issuer_job_title_snapshot=v_issuer_job_title,
    signatory_employee_id=p_signatory_employee_id,
    signatory_position_snapshot=v_signatory_position,
    signatory_job_title_snapshot=v_signatory_job_title
  where id=p_id;

  return v_no;
end;
$function$;
