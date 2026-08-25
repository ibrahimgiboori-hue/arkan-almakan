-- توحيد المصروفات: تعديل آمن + مصروف عام/مرتبط ببند + دفع موظف نيابة عن المنشأة
-- لا يعدل السجلات التاريخية تلقائياً.

alter table public.contractor_expenses
  add column if not exists paid_by_employee_id uuid references public.employees(id) on delete restrict,
  add column if not exists beneficiary_kind text not null default 'contractor',
  add column if not exists beneficiary_contractor_id uuid references public.contractors(id) on delete restrict,
  add column if not exists reimbursement_status text not null default 'not_applicable',
  add column if not exists reimbursement_paid_at timestamptz,
  add column if not exists reimbursement_notes text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.app_users(id) on delete restrict;

alter table public.contractor_expenses
  drop constraint if exists contractor_expenses_beneficiary_kind_chk,
  add constraint contractor_expenses_beneficiary_kind_chk
    check (beneficiary_kind in ('contractor','supplier','employee','other')),
  drop constraint if exists contractor_expenses_reimbursement_status_chk,
  add constraint contractor_expenses_reimbursement_status_chk
    check (reimbursement_status in ('not_applicable','due','paid','cancelled'));

create index if not exists ix_contractor_expenses_employee_due
  on public.contractor_expenses(paid_by_employee_id,reimbursement_status,expense_date)
  where paid_by_employee_id is not null;

create or replace view public.v_employee_expense_reimbursements
with (security_invoker=true)
as
select e.id as expense_id,
       e.project_id,
       e.contractor_id,
       e.project_item_id,
       e.expense_date,
       e.category,
       e.amount,
       e.notes,
       e.paid_by_employee_id as employee_id,
       emp.full_name as employee_name,
       e.beneficiary_kind,
       e.beneficiary_contractor_id,
       c.name_ar as beneficiary_contractor_name,
       e.reimbursement_status,
       case when e.reimbursement_status='due' then e.amount else 0 end as amount_due,
       e.reimbursement_paid_at,
       e.reimbursement_notes
  from public.contractor_expenses e
  join public.employees emp on emp.id=e.paid_by_employee_id
  left join public.contractors c on c.id=e.beneficiary_contractor_id
 where e.paid_by_employee_id is not null;

grant select on public.v_employee_expense_reimbursements to authenticated;

create or replace function public.fn_update_project_expense(
  p_expense_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_category text,
  p_notes text,
  p_project_item_id uuid default null,
  p_paid_by_employee_id uuid default null,
  p_beneficiary_kind text default 'contractor',
  p_beneficiary_contractor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_role text := coalesce((select public.current_app_role())::text,'');
  v_row public.contractor_expenses;
begin
  if v_role not in ('ceo','hr','accountant','supervisor') then raise exception 'غير مصرح بتعديل المصروفات.'; end if;
  if p_expense_id is null then raise exception 'المصروف غير محدد.'; end if;
  if p_expense_date is null then raise exception 'تاريخ المصروف مطلوب.'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'مبلغ المصروف يجب أن يكون أكبر من صفر.'; end if;
  if coalesce(p_beneficiary_kind,'') not in ('contractor','supplier','employee','other') then raise exception 'نوع المستفيد غير صحيح.'; end if;

  select * into v_row from public.contractor_expenses where id=p_expense_id for update;
  if v_row.id is null then raise exception 'المصروف غير موجود.'; end if;

  update public.contractor_expenses
     set expense_date=p_expense_date,
         amount=p_amount,
         category=coalesce(nullif(btrim(p_category),''),'أخرى'),
         notes=nullif(btrim(p_notes),''),
         project_item_id=p_project_item_id,
         paid_by_employee_id=p_paid_by_employee_id,
         beneficiary_kind=p_beneficiary_kind,
         beneficiary_contractor_id=case when p_beneficiary_kind='contractor' then coalesce(p_beneficiary_contractor_id,contractor_id) else p_beneficiary_contractor_id end,
         reimbursement_status=case when p_paid_by_employee_id is not null then 'due' else 'not_applicable' end,
         updated_at=now(),updated_by=auth.uid()
   where id=p_expense_id
   returning * into v_row;
  return to_jsonb(v_row);
end $$;

grant execute on function public.fn_update_project_expense(uuid,date,numeric,text,text,uuid,uuid,text,uuid) to authenticated;

create or replace function public.fn_mark_employee_expense_reimbursed(
  p_expense_id uuid,
  p_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_role text := coalesce((select public.current_app_role())::text,'');
  v_row public.contractor_expenses;
begin
  if v_role not in ('ceo','accountant') then raise exception 'تسوية مستحق الموظف للحسابات أو المدير.'; end if;
  select * into v_row from public.contractor_expenses where id=p_expense_id for update;
  if v_row.id is null or v_row.paid_by_employee_id is null then raise exception 'لا يوجد مستحق موظف مرتبط بهذا المصروف.'; end if;
  if v_row.reimbursement_status='paid' then return to_jsonb(v_row); end if;
  update public.contractor_expenses
     set reimbursement_status='paid',reimbursement_paid_at=now(),reimbursement_notes=nullif(btrim(p_notes),''),updated_at=now(),updated_by=auth.uid()
   where id=p_expense_id returning * into v_row;
  return to_jsonb(v_row);
end $$;

grant execute on function public.fn_mark_employee_expense_reimbursed(uuid,text) to authenticated;

-- إبقاء التدقيق على أي تصحيح للمصروف.
drop trigger if exists trg_audit_contractor_expenses on public.contractor_expenses;
create trigger trg_audit_contractor_expenses
after insert or update or delete on public.contractor_expenses
for each row execute function public.fn_audit();

notify pgrst,'reload schema';
