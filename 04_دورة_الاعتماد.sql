-- ============================================================
--  الملف 04 : دورة اعتماد الإجازات والسلف
--  الاعتماد يغيّر الأرصدة داخل القاعدة لا في الواجهة
-- ============================================================

-- ------------------------------------------------------------
--  ١. الخطوة التالية في دورة الاعتماد لكل نوع طلب
-- ------------------------------------------------------------
create or replace function next_step(p_kind text, p_status request_status)
returns text
language sql immutable
as $$
  select case
    -- الإجازة: الموارد البشرية ثم المدير التنفيذي
    when p_kind = 'leave' and p_status = 'draft'          then 'hr'
    when p_kind = 'leave' and p_status = 'submitted'      then 'hr'
    when p_kind = 'leave' and p_status = 'hr_reviewed'    then 'ceo'
    -- السلفة: الموارد البشرية ثم المحاسب ثم المدير التنفيذي
    when p_kind = 'advance' and p_status = 'draft'        then 'hr'
    when p_kind = 'advance' and p_status = 'submitted'    then 'hr'
    when p_kind = 'advance' and p_status = 'hr_reviewed'  then 'accountant'
    when p_kind = 'advance' and p_status = 'accountant_approved' then 'ceo'
    else null
  end
$$;

-- ------------------------------------------------------------
--  ٢. اعتماد إجازة
--  عند تعميد المدير التنفيذي يُخصم الرصيد تلقائياً
-- ------------------------------------------------------------
create or replace function approve_leave(p_id uuid, p_decision text, p_comment text default null)
returns request_status
language plpgsql security definer set search_path = public
as $$
declare
  v_role user_role := current_app_role();
  v_row  leave_requests;
  v_need text;
  v_new  request_status;
  v_year integer;
begin
  select * into v_row from leave_requests where id = p_id;
  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;

  if v_row.status in ('ceo_approved','rejected','cancelled') then
    raise exception 'هذا الطلب مغلق ولا يقبل إجراءً جديداً';
  end if;

  v_need := next_step('leave', v_row.status);
  if v_need is null or v_role::text <> v_need then
    raise exception 'الاعتماد في هذه المرحلة من صلاحية: %', coalesce(v_need,'—');
  end if;

  if p_decision = 'reject' then
    v_new := 'rejected';
  elsif v_need = 'hr' then
    v_new := 'hr_reviewed';
  else
    v_new := 'ceo_approved';
  end if;

  update leave_requests set status = v_new where id = p_id;

  insert into approvals (entity_table, entity_id, step_order, step_role, decision, decided_by, decided_at, comment)
  values ('leave_requests', p_id,
          (select coalesce(max(step_order),0)+1 from approvals
            where entity_table='leave_requests' and entity_id=p_id),
          v_role, case when p_decision='reject' then 'rejected' else 'approved' end,
          auth.uid(), now(), p_comment);

  -- خصم الرصيد عند التعميد النهائي للإجازة السنوية فقط
  if v_new = 'ceo_approved' and v_row.leave_kind = 'annual' then
    v_year := extract(year from v_row.start_date)::int;
    insert into leave_balances (employee_id, year, leave_kind, entitled_days, used_days)
    values (v_row.employee_id, v_year, 'annual', 21, v_row.days_count)
    on conflict (employee_id, year, leave_kind)
      do update set used_days = leave_balances.used_days + v_row.days_count;
  end if;

  return v_new;
end $$;

-- ------------------------------------------------------------
--  ٣. اعتماد سلفة
--  عند التعميد تُولَّد الأقساط تلقائياً
-- ------------------------------------------------------------
create or replace function approve_advance(p_id uuid, p_decision text, p_comment text default null)
returns request_status
language plpgsql security definer set search_path = public
as $$
declare
  v_role user_role := current_app_role();
  v_row  advances;
  v_need text;
  v_new  request_status;
  v_per  numeric(12,2);
  v_last numeric(12,2);
  v_start date;
  i integer;
begin
  select * into v_row from advances where id = p_id;
  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;

  if v_row.status in ('ceo_approved','rejected','cancelled') then
    raise exception 'هذا الطلب مغلق ولا يقبل إجراءً جديداً';
  end if;

  v_need := next_step('advance', v_row.status);
  if v_need is null or v_role::text <> v_need then
    raise exception 'الاعتماد في هذه المرحلة من صلاحية: %', coalesce(v_need,'—');
  end if;

  if p_decision = 'reject' then
    v_new := 'rejected';
  elsif v_need = 'hr' then
    v_new := 'hr_reviewed';
  elsif v_need = 'accountant' then
    v_new := 'accountant_approved';
  else
    v_new := 'ceo_approved';
  end if;

  update advances set status = v_new,
    disbursed_at = case when v_new = 'ceo_approved' then current_date else disbursed_at end
  where id = p_id;

  insert into approvals (entity_table, entity_id, step_order, step_role, decision, decided_by, decided_at, comment)
  values ('advances', p_id,
          (select coalesce(max(step_order),0)+1 from approvals
            where entity_table='advances' and entity_id=p_id),
          v_role, case when p_decision='reject' then 'rejected' else 'approved' end,
          auth.uid(), now(), p_comment);

  -- توليد الأقساط عند التعميد النهائي
  if v_new = 'ceo_approved' then
    delete from advance_installments where advance_id = p_id;
    v_per  := round(v_row.amount / v_row.installments, 2);
    v_last := v_row.amount - (v_per * (v_row.installments - 1));
    v_start := date_trunc('month',
      coalesce(v_row.first_deduction_month, current_date + interval '1 month'))::date;

    for i in 1..v_row.installments loop
      insert into advance_installments (advance_id, due_month, amount)
      values (p_id,
              (v_start + ((i - 1) || ' month')::interval)::date,
              case when i = v_row.installments then v_last else v_per end);
    end loop;
  end if;

  return v_new;
end $$;

-- ------------------------------------------------------------
--  ٤. سياسات تتيح للموظف تقديم طلب سلفة لنفسه
-- ------------------------------------------------------------
drop policy if exists p_advances_read on advances;
create policy p_advances_read on advances for select
  using (is_back_office() or employee_id = current_employee_id());

drop policy if exists p_advances_insert on advances;
create policy p_advances_insert on advances for insert
  with check (is_back_office() or employee_id = current_employee_id());

drop policy if exists p_adv_inst_read on advance_installments;
create policy p_adv_inst_read on advance_installments for select
  using (is_back_office()
         or exists (select 1 from advances a
                    where a.id = advance_id and a.employee_id = current_employee_id()));

-- ------------------------------------------------------------
--  ٥. التحقق
-- ------------------------------------------------------------
select next_step('leave','draft'::request_status)   as الإجازة_أول_خطوة,
       next_step('advance','hr_reviewed'::request_status) as السلفة_بعد_الموارد_البشرية;
