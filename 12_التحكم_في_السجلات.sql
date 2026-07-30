-- ============================================================
--  الملف 12 : التحكم في السجلات — تعديل وإلغاء وإبطال وحذف
--  القاعدة: المسودات تُحذف، والمعتمد يُلغى بسبب مسجَّل،
--           والمستند الصادر برقم يُبطَل ولا يُحذف
-- ============================================================

-- ------------------------------------------------------------
--  ١. حقول الإلغاء والإبطال
-- ------------------------------------------------------------
alter table leave_requests add column if not exists cancel_reason text;
alter table leave_requests add column if not exists cancelled_at timestamptz;
alter table leave_requests add column if not exists cancelled_by uuid references app_users(id);

alter table advances add column if not exists cancel_reason text;
alter table advances add column if not exists cancelled_at timestamptz;
alter table advances add column if not exists cancelled_by uuid references app_users(id);

alter table documents add column if not exists is_void boolean not null default false;
alter table documents add column if not exists void_reason text;
alter table documents add column if not exists voided_at timestamptz;
alter table documents add column if not exists voided_by uuid references app_users(id);

alter table quotations add column if not exists cancel_reason text;

-- ------------------------------------------------------------
--  ٢. إلغاء إجازة — ويسترجع الرصيد إن كانت معتمدة
-- ------------------------------------------------------------
create or replace function cancel_leave(p_id uuid, p_reason text)
returns request_status
language plpgsql security definer set search_path = public
as $$
declare
  v_row leave_requests;
  v_role user_role := current_app_role();
  v_year integer;
begin
  select * into v_row from leave_requests where id = p_id;
  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_row.status = 'cancelled' then raise exception 'الطلب ملغى سابقاً'; end if;

  if v_role not in ('ceo','hr') then
    raise exception 'إلغاء الإجازات للمدير التنفيذي والموارد البشرية';
  end if;
  if coalesce(trim(p_reason),'') = '' then
    raise exception 'يلزم تسجيل سبب الإلغاء';
  end if;

  -- استرجاع الرصيد إن كانت معتمدة وسنوية
  if v_row.status = 'ceo_approved' and v_row.leave_kind = 'annual' then
    v_year := extract(year from v_row.start_date)::int;
    update leave_balances
      set used_days = greatest(0, used_days - v_row.days_count)
      where employee_id = v_row.employee_id and year = v_year and leave_kind = 'annual';
  end if;

  update leave_requests
    set status = 'cancelled', cancel_reason = p_reason,
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = p_id;

  insert into approvals (entity_table, entity_id, step_order, step_role,
                         decision, decided_by, decided_at, comment)
  values ('leave_requests', p_id,
          (select coalesce(max(step_order),0)+1 from approvals
            where entity_table='leave_requests' and entity_id=p_id),
          v_role, 'rejected', auth.uid(), now(), 'إلغاء: ' || p_reason);

  return 'cancelled';
end $$;

-- ------------------------------------------------------------
--  ٣. إلغاء سلفة — ويحذف الأقساط غير المخصومة
-- ------------------------------------------------------------
create or replace function cancel_advance(p_id uuid, p_reason text)
returns request_status
language plpgsql security definer set search_path = public
as $$
declare
  v_row advances;
  v_role user_role := current_app_role();
  v_deducted numeric;
begin
  select * into v_row from advances where id = p_id;
  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_row.status = 'cancelled' then raise exception 'الطلب ملغى سابقاً'; end if;

  if v_role not in ('ceo','accountant') then
    raise exception 'إلغاء السلف للمدير التنفيذي والمحاسب';
  end if;
  if coalesce(trim(p_reason),'') = '' then
    raise exception 'يلزم تسجيل سبب الإلغاء';
  end if;

  select coalesce(sum(amount),0) into v_deducted
    from advance_installments where advance_id = p_id and is_deducted;

  if v_deducted > 0 then
    raise exception 'خُصم من هذه السلفة % ريال فعلاً. لا يصح إلغاؤها — سوِّ الرصيد المتبقي بدلاً من ذلك.', v_deducted;
  end if;

  delete from advance_installments where advance_id = p_id and not is_deducted;

  update advances
    set status = 'cancelled', cancel_reason = p_reason,
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = p_id;

  return 'cancelled';
end $$;

-- ------------------------------------------------------------
--  ٤. إبطال مستند صادر — الرقم لا يُعاد استخدامه
-- ------------------------------------------------------------
create or replace function void_document(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_role user_role := current_app_role();
begin
  if v_role not in ('ceo','hr','accountant') then
    raise exception 'إبطال المستندات للمدير التنفيذي والموارد البشرية والمحاسب';
  end if;
  if coalesce(trim(p_reason),'') = '' then
    raise exception 'يلزم تسجيل سبب الإبطال';
  end if;

  update documents
    set is_void = true, void_reason = p_reason,
        voided_at = now(), voided_by = auth.uid(), status = 'cancelled'
    where id = p_id;

  return true;
end $$;

-- ------------------------------------------------------------
--  ٥. تعطيل موظف بدل حذفه حين يكون له سجل
-- ------------------------------------------------------------
create or replace function employee_has_records(p_emp uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from payroll_lines where employee_id = p_emp)
      or exists (select 1 from end_of_service where employee_id = p_emp)
      or exists (select 1 from documents where employee_id = p_emp)
      or exists (select 1 from custodies where employee_id = p_emp)
      or exists (select 1 from advances where employee_id = p_emp
                   and status = 'ceo_approved')
$$;

create or replace function delete_employee_safe(p_emp uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_role user_role := current_app_role();
begin
  if v_role not in ('ceo','hr') then
    raise exception 'حذف الموظفين للمدير التنفيذي والموارد البشرية';
  end if;

  if employee_has_records(p_emp) then
    update employees set status = 'terminated' where id = p_emp;
    return 'له سجلات مالية أو مستندات صادرة، فعُطِّل بدل حذفه';
  end if;

  delete from employees where id = p_emp;
  return 'حُذف نهائياً';
end $$;

-- ------------------------------------------------------------
--  ٦. حذف نموذج مخصص إن لم يصدر منه مستند
-- ------------------------------------------------------------
create or replace function delete_template_safe(p_code text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  if current_app_role() not in ('ceo','hr') then
    raise exception 'حذف النماذج للمدير التنفيذي والموارد البشرية';
  end if;

  select count(*) into v_count from documents where template_code = p_code;
  if v_count > 0 then
    raise exception 'صدر من هذا النموذج % مستنداً ولا يصح حذفه. عطّله بدل ذلك.', v_count;
  end if;

  if exists (select 1 from document_templates where code = p_code and not is_custom) then
    raise exception 'لا يمكن حذف النماذج المدمجة';
  end if;

  delete from document_templates where code = p_code;
  return 'حُذف النموذج';
end $$;

alter table document_templates add column if not exists is_active boolean not null default true;

-- ------------------------------------------------------------
--  ٧. نسخ عرض سعر
-- ------------------------------------------------------------
create or replace function duplicate_quotation(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  q quotations;
  v_no text;
  v_new uuid;
begin
  select * into q from quotations where id = p_id;
  if q.id is null then raise exception 'العرض غير موجود'; end if;
  if current_app_role() not in ('ceo','hr','accountant') then
    raise exception 'لا تملك صلاحية نسخ العروض';
  end if;

  v_no := next_document_number(case when q.doc_kind='boq' then 'BOQ' else 'QUOTE' end,
                               case when q.doc_kind='boq' then 'BOQ' else 'QT' end);

  insert into quotations (
    quote_no, doc_kind, language, status, client_name, client_contact, entity_id,
    project_ref, site_location, quote_date, valid_days,
    show_unit, show_qty, show_unit_price, show_line_total, show_en_desc,
    show_intro, show_payments, show_terms, show_closing, show_bank, show_stamp,
    show_signature, show_letterhead, vat_mode, vat_rate, discount_pct, discount_amount,
    title_override, intro_text, closing_text, terms_text, supply_scope)
  select v_no, doc_kind, language, 'draft', client_name || ' (نسخة)', client_contact, entity_id,
    project_ref, site_location, current_date, valid_days,
    show_unit, show_qty, show_unit_price, show_line_total, show_en_desc,
    show_intro, show_payments, show_terms, show_closing, show_bank, show_stamp,
    show_signature, show_letterhead, vat_mode, vat_rate, discount_pct, discount_amount,
    title_override, intro_text, closing_text, terms_text, supply_scope
  from quotations where id = p_id
  returning id into v_new;

  insert into quotation_lines (quotation_id, sort_order, kind, description_ar,
    description_en, unit, qty, unit_price, work_item_id, cost_price, notes)
  select v_new, sort_order, kind, description_ar, description_en, unit, qty,
         unit_price, work_item_id, cost_price, notes
  from quotation_lines where quotation_id = p_id;

  insert into quotation_payments (quotation_id, sort_order, label, percent, amount, trigger_note)
  select v_new, sort_order, label, percent, amount, trigger_note
  from quotation_payments where quotation_id = p_id;

  return v_new;
end $$;

-- ------------------------------------------------------------
--  ٨. صلاحيات الحذف الصريحة
-- ------------------------------------------------------------
drop policy if exists p_leave_delete on leave_requests;
create policy p_leave_delete on leave_requests for delete
  using (current_app_role() in ('ceo','hr') and status in ('draft','submitted'));

drop policy if exists p_advances_delete on advances;
create policy p_advances_delete on advances for delete
  using (current_app_role() in ('ceo','accountant') and status in ('draft','submitted'));

drop policy if exists p_docs_delete on documents;
create policy p_docs_delete on documents for delete
  using (current_app_role() in ('ceo','hr') and status = 'draft' and not is_void);

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.routines
    where routine_name in ('cancel_leave','cancel_advance','void_document',
      'delete_employee_safe','delete_template_safe','duplicate_quotation')) as "الدوال",
  (select count(*) from information_schema.columns
    where table_name='documents' and column_name='is_void') as "حقل الإبطال";
