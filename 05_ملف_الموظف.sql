-- ============================================================
--  الملف 05 : مخزن مستندات الموظفين (خاص وليس عاماً)
-- ============================================================

-- ------------------------------------------------------------
--  ١. المخزن — غير عام: لا يُقرأ إلا برابط موقّع مؤقت
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('hr-docs', 'hr-docs', false)
on conflict (id) do nothing;

-- القراءة والرفع للإدارة فقط (المدير التنفيذي والموارد البشرية والمحاسب)
drop policy if exists p_hrdocs_read on storage.objects;
create policy p_hrdocs_read on storage.objects for select to authenticated
  using (bucket_id = 'hr-docs' and is_back_office());

drop policy if exists p_hrdocs_insert on storage.objects;
create policy p_hrdocs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-docs' and current_app_role() in ('ceo','hr'));

drop policy if exists p_hrdocs_update on storage.objects;
create policy p_hrdocs_update on storage.objects for update to authenticated
  using (bucket_id = 'hr-docs' and current_app_role() in ('ceo','hr'));

drop policy if exists p_hrdocs_delete on storage.objects;
create policy p_hrdocs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hr-docs' and current_app_role() in ('ceo','hr'));

-- ------------------------------------------------------------
--  ٢. المدير التنفيذي يستطيع تجاوز أي خطوة اعتماد
--     (منطقي في شركة محدودة العدد، ومسجَّل في سجل التدقيق)
-- ------------------------------------------------------------
create or replace function next_step(p_kind text, p_status request_status)
returns text
language sql immutable
as $$
  select case
    when p_kind = 'leave' and p_status in ('draft','submitted')   then 'hr'
    when p_kind = 'leave' and p_status = 'hr_reviewed'            then 'ceo'
    when p_kind = 'advance' and p_status in ('draft','submitted') then 'hr'
    when p_kind = 'advance' and p_status = 'hr_reviewed'          then 'accountant'
    when p_kind = 'advance' and p_status = 'accountant_approved'  then 'ceo'
    else null
  end
$$;

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
  -- المدير التنفيذي يعمّد من أي مرحلة
  if v_role <> 'ceo' and (v_need is null or v_role::text <> v_need) then
    raise exception 'الاعتماد في هذه المرحلة من صلاحية: %', coalesce(v_need,'—');
  end if;

  if p_decision = 'reject' then v_new := 'rejected';
  elsif v_role = 'ceo' then v_new := 'ceo_approved';
  else v_new := 'hr_reviewed';
  end if;

  update leave_requests set status = v_new where id = p_id;

  insert into approvals (entity_table, entity_id, step_order, step_role, decision, decided_by, decided_at, comment)
  values ('leave_requests', p_id,
          (select coalesce(max(step_order),0)+1 from approvals
            where entity_table='leave_requests' and entity_id=p_id),
          v_role, case when p_decision='reject' then 'rejected' else 'approved' end,
          auth.uid(), now(), p_comment);

  if v_new = 'ceo_approved' and v_row.leave_kind = 'annual' then
    v_year := extract(year from v_row.start_date)::int;
    insert into leave_balances (employee_id, year, leave_kind, entitled_days, used_days)
    values (v_row.employee_id, v_year, 'annual', 21, v_row.days_count)
    on conflict (employee_id, year, leave_kind)
      do update set used_days = leave_balances.used_days + v_row.days_count;
  end if;

  return v_new;
end $$;

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
  if v_role <> 'ceo' and (v_need is null or v_role::text <> v_need) then
    raise exception 'الاعتماد في هذه المرحلة من صلاحية: %', coalesce(v_need,'—');
  end if;

  if p_decision = 'reject' then v_new := 'rejected';
  elsif v_role = 'ceo' then v_new := 'ceo_approved';
  elsif v_need = 'hr' then v_new := 'hr_reviewed';
  else v_new := 'accountant_approved';
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

  if v_new = 'ceo_approved' then
    delete from advance_installments where advance_id = p_id;
    v_per  := round(v_row.amount / v_row.installments, 2);
    v_last := v_row.amount - (v_per * (v_row.installments - 1));
    v_start := date_trunc('month',
      coalesce(v_row.first_deduction_month, current_date + interval '1 month'))::date;
    for i in 1..v_row.installments loop
      insert into advance_installments (advance_id, due_month, amount)
      values (p_id, (v_start + ((i - 1) || ' month')::interval)::date,
              case when i = v_row.installments then v_last else v_per end);
    end loop;
  end if;

  return v_new;
end $$;

-- ------------------------------------------------------------
--  ٣. عرض المستندات المنتهية أو القريبة من الانتهاء
-- ------------------------------------------------------------
create or replace view v_expiring_docs with (security_invoker = true) as
select d.id, d.employee_id, e.employee_no, e.full_name_ar,
       d.doc_type, d.doc_number, d.expiry_date,
       (d.expiry_date - current_date) as days_left
from employee_documents d
join employees e on e.id = d.employee_id
where d.expiry_date is not null
  and d.expiry_date <= current_date + (d.alert_days_before || ' days')::interval
order by d.expiry_date;

select 'مخزن مستندات الموظفين' as البيان,
       (select count(*) from storage.buckets where id = 'hr-docs')::text as جاهز;
