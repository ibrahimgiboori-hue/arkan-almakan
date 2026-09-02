create or replace function public.hr_save_employee_work_schedule(
  p_schedule_id uuid,
  p_employee_id uuid,
  p_name text,
  p_valid_from date,
  p_valid_to date,
  p_days jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.schedule') then
    raise exception 'لا تملك صلاحية إدارة روتين الدوام';
  end if;
  if p_employee_id is null or p_valid_from is null then
    raise exception 'الموظف وتاريخ بداية السريان مطلوبان';
  end if;
  if p_valid_to is not null and p_valid_to < p_valid_from then
    raise exception 'نهاية السريان لا يمكن أن تسبق بدايته';
  end if;
  if jsonb_typeof(coalesce(p_days,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_days,'[]'::jsonb)) = 0 then
    raise exception 'أيام روتين الدوام مطلوبة';
  end if;

  if p_schedule_id is null then
    insert into public.hr_employee_work_schedules(employee_id,name,valid_from,valid_to,notes,created_by)
    values (p_employee_id,coalesce(nullif(trim(p_name),''),'الدوام الأساسي'),p_valid_from,p_valid_to,p_notes,auth.uid())
    returning id into v_id;
  else
    update public.hr_employee_work_schedules s
    set employee_id=p_employee_id,
        name=coalesce(nullif(trim(p_name),''),s.name),
        valid_from=p_valid_from,
        valid_to=p_valid_to,
        notes=p_notes,
        updated_at=now()
    where s.id=p_schedule_id
    returning id into v_id;
    if v_id is null then raise exception 'روتين الدوام غير موجود'; end if;
    delete from public.hr_employee_work_schedule_days where schedule_id=v_id;
  end if;

  insert into public.hr_employee_work_schedule_days(schedule_id,weekday,is_workday,start_time,end_time,notes)
  select
    v_id,
    (x->>'weekday')::smallint,
    coalesce((x->>'is_workday')::boolean,true),
    case when coalesce((x->>'is_workday')::boolean,true) then nullif(x->>'start_time','')::time else null end,
    case when coalesce((x->>'is_workday')::boolean,true) then nullif(x->>'end_time','')::time else null end,
    nullif(x->>'notes','')
  from jsonb_array_elements(p_days) x;

  if exists (
    select 1 from public.hr_employee_work_schedule_days
    where schedule_id=v_id and is_workday and (start_time is null or end_time is null)
  ) then
    raise exception 'كل يوم عمل يحتاج وقت بداية ونهاية';
  end if;

  return v_id;
end;
$$;

revoke all on function public.hr_save_employee_work_schedule(uuid,uuid,text,date,date,jsonb,text) from public, anon;
grant execute on function public.hr_save_employee_work_schedule(uuid,uuid,text,date,date,jsonb,text) to authenticated;

create or replace function public.hr_import_attendance_punches(
  p_file_name text,
  p_file_size bigint,
  p_file_hash text,
  p_rows jsonb,
  p_parser_version text default '1.0.0'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_import_id uuid;
  v_summary jsonb;
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.import') then
    raise exception 'لا تملك صلاحية رفع ملفات الحضور والانصراف';
  end if;
  if coalesce(nullif(trim(p_file_name),''),'') = '' then raise exception 'اسم الملف مطلوب'; end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rows,'[]'::jsonb)) = 0 then
    raise exception 'لم يتم العثور على حركات بصمة قابلة للاستيراد';
  end if;

  insert into public.hr_attendance_imports(source_file_name,source_file_size,source_file_hash,parser_version,status,uploaded_by)
  values (p_file_name,p_file_size,p_file_hash,coalesce(nullif(p_parser_version,''),'1.0.0'),'uploaded',auth.uid())
  returning id into v_import_id;

  with raw as (
    select
      nullif(trim(x->>'employee_no'),'') as employee_no,
      nullif(trim(x->>'employee_name'),'') as employee_name,
      nullif(x->>'punch_local','')::timestamp without time zone as punch_local,
      nullif(x->>'source_sheet','') as source_sheet,
      nullif(x->>'source_row','')::integer as source_row,
      coalesce(x->'raw_payload','{}'::jsonb) as raw_payload
    from jsonb_array_elements(p_rows) x
  ), matched as (
    select r.*,
      coalesce(en.id, nm.id) as employee_id,
      case when en.id is not null then 'employee_no'
           when nm.id is not null then 'name'
           else 'unmatched' end as match_method
    from raw r
    left join public.employees en on en.employee_no = r.employee_no
    left join lateral (
      select e.id
      from public.employees e
      where r.employee_name is not null
        and regexp_replace(lower(coalesce(e.full_name_ar,'')),'[^[:alnum:]]','','g') = regexp_replace(lower(r.employee_name),'[^[:alnum:]]','','g')
      group by e.id
      having (select count(*) from public.employees e2 where regexp_replace(lower(coalesce(e2.full_name_ar,'')),'[^[:alnum:]]','','g') = regexp_replace(lower(r.employee_name),'[^[:alnum:]]','','g')) = 1
      limit 1
    ) nm on en.id is null
    where r.punch_local is not null
  )
  insert into public.hr_attendance_punches(
    import_id,employee_id,external_employee_no,external_employee_name,punch_local,source_sheet,source_row,raw_payload,match_method
  )
  select v_import_id,employee_id,employee_no,employee_name,punch_local,source_sheet,source_row,raw_payload,match_method
  from matched
  on conflict do nothing;

  update public.hr_attendance_imports i
  set status='parsed',
      rows_received=(select count(*) from public.hr_attendance_punches p where p.import_id=v_import_id),
      matched_punches=(select count(*) from public.hr_attendance_punches p where p.import_id=v_import_id and p.employee_id is not null),
      unmatched_punches=(select count(*) from public.hr_attendance_punches p where p.import_id=v_import_id and p.employee_id is null),
      period_from=(select min(punch_date) from public.hr_attendance_punches p where p.import_id=v_import_id),
      period_to=(select max(punch_date) from public.hr_attendance_punches p where p.import_id=v_import_id)
  where i.id=v_import_id;

  v_summary := public.hr_analyze_attendance_import(v_import_id);
  return coalesce(v_summary,'{}'::jsonb) || jsonb_build_object('import_id',v_import_id);
exception when others then
  if v_import_id is not null then
    update public.hr_attendance_imports set status='failed', notes=sqlerrm where id=v_import_id;
  end if;
  raise;
end;
$$;

revoke all on function public.hr_import_attendance_punches(text,bigint,text,jsonb,text) from public, anon;
grant execute on function public.hr_import_attendance_punches(text,bigint,text,jsonb,text) to authenticated;

create or replace function public.hr_submit_attendance_justification(
  p_attendance_day_id uuid,
  p_justification_text text,
  p_paper_reference text default null,
  p_paper_approved_on date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_id uuid;
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.review') then
    raise exception 'لا تملك صلاحية تسجيل تبرير الحضور';
  end if;
  select case day_status when 'missing_in' then 'missing_in' when 'missing_out' then 'missing_out' when 'absent' then 'absence' else 'other' end
    into v_kind
  from public.hr_attendance_days where id=p_attendance_day_id;
  if v_kind is null then raise exception 'سجل الحضور غير موجود'; end if;
  if coalesce(nullif(trim(p_justification_text),''),'')='' then raise exception 'نص التبرير مطلوب'; end if;

  insert into public.hr_attendance_justifications(attendance_day_id,issue_kind,justification_text,paper_reference,paper_approved_on,decision,submitted_by)
  values (p_attendance_day_id,v_kind,p_justification_text,p_paper_reference,p_paper_approved_on,'pending',auth.uid())
  on conflict (attendance_day_id,issue_kind) do update set
    justification_text=excluded.justification_text,
    paper_reference=excluded.paper_reference,
    paper_approved_on=excluded.paper_approved_on,
    decision='pending',
    decision_note=null,
    submitted_by=auth.uid(),
    submitted_at=now(),
    decided_by=null,
    decided_at=null
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.hr_submit_attendance_justification(uuid,text,text,date) from public, anon;
grant execute on function public.hr_submit_attendance_justification(uuid,text,text,date) to authenticated;

create or replace function public.hr_decide_attendance_justification(
  p_justification_id uuid,
  p_decision text,
  p_decision_note text default null,
  p_paper_reference text default null,
  p_paper_approved_on date default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.fn_is_primary_user() then
    raise exception 'قرار قبول أو رفض تبرير الحضور خاص بالمستخدم الرئيسي';
  end if;
  if p_decision not in ('accepted','rejected') then raise exception 'القرار يجب أن يكون قبول أو رفض'; end if;
  update public.hr_attendance_justifications
  set decision=p_decision,
      decision_note=p_decision_note,
      paper_reference=coalesce(nullif(trim(p_paper_reference),''),paper_reference),
      paper_approved_on=coalesce(p_paper_approved_on,paper_approved_on)
  where id=p_justification_id;
  if not found then raise exception 'التبرير غير موجود'; end if;
end;
$$;

revoke all on function public.hr_decide_attendance_justification(uuid,text,text,text,date) from public, anon;
grant execute on function public.hr_decide_attendance_justification(uuid,text,text,text,date) to authenticated;
