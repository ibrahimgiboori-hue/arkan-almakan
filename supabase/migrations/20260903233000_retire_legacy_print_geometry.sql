-- إحلال وإلغاء: بعد أن أصبح ConstitutionPagedFrame المالك الوحيد لهندسة الورقة،
-- لا تبقى هوامش أو مواضع ختم/توقيع خاصة بالسجلات كجزء من نموذج البيانات.
-- هذه migration يجب أن تطبق مع الكود الجديد، لا قبل نشره على البيئة المقصودة.

create or replace function public.duplicate_document(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d documents;
  v_new uuid;
begin
  select * into d from documents where id = p_id;
  if d.id is null then raise exception 'المستند غير موجود'; end if;
  if current_app_role() not in ('ceo','hr','accountant') then
    raise exception 'لا تملك صلاحية النسخ';
  end if;

  insert into documents (
    doc_number, template_code, language, subject,
    employee_id, project_id, payload, status,
    show_stamp, show_bank, created_by
  )
  values (
    'DRAFT-' || substr(gen_random_uuid()::text, 1, 8),
    d.template_code, d.language, d.subject || ' (نسخة)',
    d.employee_id, d.project_id, d.payload, 'draft',
    d.show_stamp, d.show_bank, auth.uid()
  )
  returning id into v_new;

  return v_new;
end
$function$;

create or replace function public.fn_lock_workspace_approved_document()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.internal_approval_status in ('pending','approved') then
    if new.template_code is distinct from old.template_code
      or new.language is distinct from old.language
      or new.subject is distinct from old.subject
      or new.employee_id is distinct from old.employee_id
      or new.project_id is distinct from old.project_id
      or new.payload is distinct from old.payload
      or new.parties is distinct from old.parties
      or new.issuer_employee_id is distinct from old.issuer_employee_id
      or new.signatory_employee_id is distinct from old.signatory_employee_id
      or new.workspace_task_id is distinct from old.workspace_task_id then
      raise exception 'DOCUMENT_LOCKED_BY_APPROVAL';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.workspace_document_fingerprint(p_document_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select md5(concat_ws('|',
    d.id::text,
    d.template_code,
    d.language::text,
    coalesce(d.subject,''),
    coalesce(d.payload::text,''),
    coalesce(d.parties::text,''),
    coalesce(d.employee_id::text,''),
    coalesce(d.project_id::text,''),
    coalesce(d.issuer_employee_id::text,''),
    coalesce(d.signatory_employee_id::text,'')
  ))
  from public.documents d
  where d.id=p_document_id;
$function$;

create or replace function public.fn_portal_print_settings()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_allowed boolean;
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'سجل الدخول أولاً'; end if;
  select public.has_module_access('projects') or exists (
    select 1 from public.contractor_portal_accounts a
    where a.auth_user_id=(select auth.uid()) and a.is_active
  ) into v_allowed;
  if not v_allowed then raise exception 'الحساب غير مفعل'; end if;

  select jsonb_build_object(
    'company_name_ar',s.company_name_ar,
    'letterhead_image_path',s.letterhead_image_path,
    'header_image_path',s.header_image_path,
    'footer_image_path',s.footer_image_path,
    'watermark_image_path',s.watermark_image_path,
    'header_height_mm',s.header_height_mm,
    'footer_height_mm',s.footer_height_mm
  ) into v_result
  from public.app_settings s
  where s.id=1;

  return v_result;
end
$function$;

-- لا نسمح لقالب قديم بإعادة كتابة مفاتيح هندسة متقاعدة بعد حذف الأعمدة.
update public.quote_presets
set switches = coalesce(switches,'{}'::jsonb)
  - array[
      'show_letterhead',
      'margin_top_mm','margin_bottom_mm','margin_side_mm',
      'stamp_size_mm','stamp_x_mm','stamp_y_mm',
      'sign_size_mm','sign_x_mm','sign_y_mm'
    ]::text[]
where switches ?| array[
  'show_letterhead',
  'margin_top_mm','margin_bottom_mm','margin_side_mm',
  'stamp_size_mm','stamp_x_mm','stamp_y_mm',
  'sign_size_mm','sign_x_mm','sign_y_mm'
];

alter table public.app_settings
  drop column if exists letterhead_top_mm,
  drop column if exists letterhead_bottom_mm,
  drop column if exists letterhead_side_mm;

alter table public.document_templates
  drop column if exists margin_top_mm,
  drop column if exists margin_bottom_mm,
  drop column if exists margin_side_mm;

alter table public.documents
  drop column if exists margin_top_mm,
  drop column if exists margin_bottom_mm,
  drop column if exists margin_side_mm,
  drop column if exists show_letterhead,
  drop column if exists stamp_x_mm,
  drop column if exists stamp_y_mm,
  drop column if exists sign_x_mm,
  drop column if exists sign_y_mm,
  drop column if exists stamp_size_mm,
  drop column if exists sign_size_mm;

alter table public.quotations
  drop column if exists show_letterhead,
  drop column if exists margin_top_mm,
  drop column if exists margin_bottom_mm,
  drop column if exists margin_side_mm,
  drop column if exists stamp_x_mm,
  drop column if exists stamp_y_mm,
  drop column if exists sign_x_mm,
  drop column if exists sign_y_mm,
  drop column if exists stamp_size_mm,
  drop column if exists sign_size_mm;
