alter table public.cash_vouchers
  add column if not exists issuer_employee_id uuid references public.employees(id),
  add column if not exists issuer_name_snapshot text,
  add column if not exists issuer_title_snapshot text,
  add column if not exists approved_by_employee_id uuid references public.employees(id),
  add column if not exists approved_by_name_snapshot text,
  add column if not exists approved_by_title_snapshot text;

create index if not exists cash_vouchers_issuer_employee_idx
  on public.cash_vouchers(issuer_employee_id);
create index if not exists cash_vouchers_approved_by_employee_idx
  on public.cash_vouchers(approved_by_employee_id);

update public.cash_vouchers
set issuer_employee_id='0d5dbec7-0ed2-47d0-ba5e-43e62647ab68'::uuid,
    issuer_name_snapshot='محمد انتصار تركي',
    issuer_title_snapshot='المدير التنفيذي',
    approved_by_employee_id='0d5dbec7-0ed2-47d0-ba5e-43e62647ab68'::uuid,
    approved_by_name_snapshot='محمد انتصار تركي',
    approved_by_title_snapshot='المدير التنفيذي'
where voucher_no in ('PYV-002-001','PYV-002-002');

create or replace function public.fn_cash_voucher_issue_v2(
  p_voucher_type text,
  p_account_id uuid,
  p_amount numeric,
  p_amount_words text,
  p_voucher_date date default current_date,
  p_party_name text default null,
  p_party_id_kind text default null,
  p_party_id_number text default null,
  p_party_mobile text default null,
  p_party_address text default null,
  p_payment_method text default 'cash',
  p_bank_name text default null,
  p_payment_reference text default null,
  p_payment_date date default null,
  p_description text default null,
  p_supporting_reference text default null,
  p_project_id uuid default null,
  p_issuer_employee_id uuid default null,
  p_approved_by_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_voucher_id uuid;
  v_issuer public.employees%rowtype;
  v_approver public.employees%rowtype;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_issuer_employee_id is null then raise exception 'مصدر السند مطلوب'; end if;
  if p_approved_by_employee_id is null then raise exception 'اعتماد الإدارة مطلوب'; end if;

  select * into v_issuer from public.employees where id=p_issuer_employee_id and status='active';
  if v_issuer.id is null then raise exception 'مصدر السند غير موجود أو غير نشط'; end if;

  select * into v_approver from public.employees where id=p_approved_by_employee_id and status='active';
  if v_approver.id is null then raise exception 'المعتمد غير موجود أو غير نشط'; end if;

  v_result := public.fn_cash_voucher_issue(
    p_voucher_type,p_account_id,p_amount,p_amount_words,p_voucher_date,p_party_name,
    p_party_id_kind,p_party_id_number,p_party_mobile,p_party_address,p_payment_method,
    p_bank_name,p_payment_reference,p_payment_date,p_description,p_supporting_reference,p_project_id
  );

  v_voucher_id := (v_result->>'id')::uuid;

  update public.cash_vouchers
  set issuer_employee_id=v_issuer.id,
      issuer_name_snapshot=v_issuer.full_name_ar,
      issuer_title_snapshot=v_issuer.job_title,
      approved_by_employee_id=v_approver.id,
      approved_by_name_snapshot=v_approver.full_name_ar,
      approved_by_title_snapshot=v_approver.job_title
  where id=v_voucher_id;

  return v_result;
end;
$function$;
