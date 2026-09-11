create or replace function public.hr_assert_attendance_review_open(p_import_id uuid)
returns void
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.hr_attendance_imports
  where id = p_import_id;

  if not found then
    raise exception 'دفعة الحضور غير موجودة';
  end if;

  if v_status not in ('analyzed','justifications','recalculated','ready_to_post') then
    raise exception 'دفعة الحضور ليست في مرحلة تسمح بالمراجعة';
  end if;
end;
$$;

create or replace function public.hr_submit_attendance_justification_v2(
  p_attendance_day_id uuid,
  p_justification_type text,
  p_justification_text text default null::text,
  p_paper_reference text default null::text,
  p_paper_approved_on date default null::date
)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_kind text;
  v_id uuid;
  v_import uuid;
  v_label text;
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.review') then
    raise exception 'لا تملك صلاحية تسجيل تبرير الحضور';
  end if;

  if p_justification_type not in (
    'sick_leave','approved_leave','non_working_day','outside_work','biometric_device_issue','forgot_punch',
    'approved_shift_change','approved_late_early_permission','training_meeting_assignment','other_site_branch','other'
  ) then
    raise exception 'نوع التبرير غير معتمد';
  end if;

  if p_justification_type='other' and coalesce(nullif(trim(p_justification_text),''),'')='' then
    raise exception 'اكتب تفاصيل التبرير عند اختيار أخرى';
  end if;

  select import_id,
         case day_status
           when 'missing_in' then 'missing_in'
           when 'missing_out' then 'missing_out'
           when 'absent' then 'absence'
           else 'other'
         end
  into v_import,v_kind
  from public.hr_attendance_days
  where id=p_attendance_day_id;

  if v_import is null then
    raise exception 'سجل الحضور غير موجود';
  end if;

  perform public.hr_assert_attendance_review_open(v_import);

  v_label := case p_justification_type
    when 'sick_leave' then 'إجازة مرضية'
    when 'approved_leave' then 'إجازة معتمدة'
    when 'non_working_day' then 'اليوم غير ضمن أيام العمل'
    when 'outside_work' then 'عمل خارج المركز'
    when 'biometric_device_issue' then 'مشكلة تقنية في جهاز البصمة'
    when 'forgot_punch' then 'نسيان البصمة'
    when 'approved_shift_change' then 'تغيير ساعات دوام / شفت معتمد'
    when 'approved_late_early_permission' then 'إذن تأخير أو خروج معتمد'
    when 'training_meeting_assignment' then 'تدريب / اجتماع / تكليف رسمي'
    when 'other_site_branch' then 'العمل في فرع أو موقع آخر'
    else 'أخرى'
  end;

  insert into public.hr_attendance_justifications(
    attendance_day_id,issue_kind,justification_type,justification_text,
    paper_reference,paper_approved_on,decision,submitted_by
  ) values (
    p_attendance_day_id,v_kind,p_justification_type,
    coalesce(nullif(trim(p_justification_text),''),v_label),
    p_paper_reference,p_paper_approved_on,'pending',auth.uid()
  )
  on conflict(attendance_day_id,issue_kind) do update set
    justification_type=excluded.justification_type,
    justification_text=excluded.justification_text,
    paper_reference=excluded.paper_reference,
    paper_approved_on=excluded.paper_approved_on,
    decision='pending',decision_note=null,submitted_by=auth.uid(),submitted_at=now(),decided_by=null,decided_at=null
  returning id into v_id;

  update public.hr_attendance_imports
  set status='justifications',
      review_started_at=coalesce(review_started_at,now()),
      recalculated_at=null,
      ready_to_post_at=null
  where id=v_import;

  insert into public.hr_attendance_processing_events(import_id,stage,action_key,summary,actor_user_id)
  values(
    v_import,'justifications','submit_justification',
    jsonb_build_object('attendance_day_id',p_attendance_day_id,'justification_type',p_justification_type),
    auth.uid()
  );

  return v_id;
end;
$$;

create or replace function public.hr_decide_attendance_justification(
  p_justification_id uuid,
  p_decision text,
  p_decision_note text default null::text,
  p_paper_reference text default null::text,
  p_paper_approved_on date default null::date
)
returns void
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_import uuid;
begin
  if not public.fn_is_primary_user() then
    raise exception 'قرار قبول أو رفض تبرير الحضور خاص بالمستخدم الرئيسي';
  end if;

  if p_decision not in ('accepted','rejected') then
    raise exception 'القرار يجب أن يكون قبول أو رفض';
  end if;

  select d.import_id into v_import
  from public.hr_attendance_justifications j
  join public.hr_attendance_days d on d.id=j.attendance_day_id
  where j.id=p_justification_id;

  if v_import is null then
    raise exception 'التبرير غير موجود';
  end if;

  perform public.hr_assert_attendance_review_open(v_import);

  update public.hr_attendance_justifications
  set decision=p_decision,
      decision_note=p_decision_note,
      paper_reference=coalesce(nullif(trim(p_paper_reference),''),paper_reference),
      paper_approved_on=coalesce(p_paper_approved_on,paper_approved_on)
  where id=p_justification_id;

  update public.hr_attendance_imports
  set status='justifications',recalculated_at=null,ready_to_post_at=null
  where id=v_import;

  insert into public.hr_attendance_processing_events(import_id,stage,action_key,summary,actor_user_id)
  values(
    v_import,'justifications','decide_justification',
    jsonb_build_object('justification_id',p_justification_id,'decision',p_decision),
    auth.uid()
  );
end;
$$;

comment on function public.hr_assert_attendance_review_open(uuid)
is 'Central attendance-review state guard. Review actions may run only after analysis and may intentionally reopen recalculated/ready_to_post batches to justifications.';
