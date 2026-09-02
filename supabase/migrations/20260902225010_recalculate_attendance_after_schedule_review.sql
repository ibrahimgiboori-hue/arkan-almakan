create or replace function public.hr_recalculate_attendance_import(p_import_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_imp public.hr_attendance_imports%rowtype;
  v_settings public.hr_attendance_settings%rowtype;
  v_pair record;
  v_day_id uuid;
  v_schedule_id uuid;
  v_schedule_day record;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_mid timestamp without time zone;
  v_check_in timestamp without time zone;
  v_check_out timestamp without time zone;
  v_count integer;
  v_status text;
  v_penalty numeric(5,2);
  v_final_penalty numeric(5,2);
  v_note text;
  v_worked integer;
  v_arrival integer;
  v_departure integer;
  v_summary jsonb;
  v_bad integer;
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.review') then
    raise exception 'لا تملك صلاحية إعادة احتساب الحضور';
  end if;

  select * into v_imp
  from public.hr_attendance_imports
  where id = p_import_id;

  if not found or v_imp.status not in ('analyzed','justifications','recalculated','ready_to_post') then
    raise exception 'الدفعة ليست قابلة لإعادة الاحتساب';
  end if;

  select * into v_settings from public.hr_attendance_settings where id = 1;
  if not found then raise exception 'إعدادات الحضور غير موجودة'; end if;

  if v_imp.period_from is null or v_imp.period_to is null then
    raise exception 'فترة الملف غير محددة';
  end if;

  for v_pair in
    with dates as (
      select d::date as work_date
      from generate_series(v_imp.period_from, v_imp.period_to, interval '1 day') d
    ), internal_subjects as (
      select distinct 'internal'::text as subject_type, s.employee_id, null::uuid as external_person_id, d.work_date
      from public.hr_employee_work_schedules s
      join dates d on s.valid_from <= d.work_date and (s.valid_to is null or s.valid_to >= d.work_date)
      where v_imp.processing_scope = 'internal' and s.is_active
      union
      select distinct 'internal'::text, p.employee_id, null::uuid, p.punch_date
      from public.hr_attendance_punches p
      where v_imp.processing_scope = 'internal' and p.import_id = p_import_id and p.employee_id is not null
    ), external_subjects as (
      select distinct 'external'::text as subject_type, null::uuid as employee_id, s.external_person_id, d.work_date
      from public.hr_attendance_external_schedules s
      join dates d on s.valid_from <= d.work_date and (s.valid_to is null or s.valid_to >= d.work_date)
      where v_imp.processing_scope = 'external' and s.import_id = p_import_id and s.is_active
      union
      select distinct 'external'::text, null::uuid, p.external_person_id, p.punch_date
      from public.hr_attendance_punches p
      where v_imp.processing_scope = 'external' and p.import_id = p_import_id and p.external_person_id is not null
    ), existing_subjects as (
      select distinct
        case when d.employee_id is not null then 'internal'::text else 'external'::text end as subject_type,
        d.employee_id,
        d.external_person_id,
        d.work_date
      from public.hr_attendance_days d
      where d.import_id = p_import_id
    )
    select distinct subject_type, employee_id, external_person_id, work_date
    from (
      select * from internal_subjects
      union all
      select * from external_subjects
      union all
      select * from existing_subjects
    ) q
    order by work_date, subject_type, employee_id nulls last, external_person_id nulls last
  loop
    v_day_id := null;
    v_schedule_id := null;
    v_schedule_day := null;
    v_start := null;
    v_end := null;
    v_mid := null;
    v_check_in := null;
    v_check_out := null;
    v_worked := null;
    v_arrival := null;
    v_departure := null;
    v_count := 0;
    v_note := null;
    v_penalty := 0;
    v_final_penalty := 0;
    v_status := 'no_schedule';

    select d.id into v_day_id
    from public.hr_attendance_days d
    where d.import_id = p_import_id
      and d.work_date = v_pair.work_date
      and (
        (v_pair.subject_type = 'internal' and d.employee_id = v_pair.employee_id)
        or
        (v_pair.subject_type = 'external' and d.external_person_id = v_pair.external_person_id)
      )
    limit 1;

    if v_pair.subject_type = 'internal' then
      select s.id into v_schedule_id
      from public.hr_employee_work_schedules s
      where s.employee_id = v_pair.employee_id
        and s.is_active
        and s.valid_from <= v_pair.work_date
        and (s.valid_to is null or s.valid_to >= v_pair.work_date)
      order by s.valid_from desc, s.created_at desc
      limit 1;

      if v_schedule_id is not null then
        select sd.weekday, sd.is_workday, sd.start_time, sd.end_time
        into v_schedule_day
        from public.hr_employee_work_schedule_days sd
        where sd.schedule_id = v_schedule_id
          and sd.weekday = extract(dow from v_pair.work_date)::smallint
        limit 1;
      end if;

      select count(*) into v_count
      from public.hr_attendance_punches p
      where p.import_id = p_import_id
        and p.employee_id = v_pair.employee_id
        and p.punch_date = v_pair.work_date;
    else
      select s.id into v_schedule_id
      from public.hr_attendance_external_schedules s
      where s.import_id = p_import_id
        and s.external_person_id = v_pair.external_person_id
        and s.is_active
        and s.valid_from <= v_pair.work_date
        and (s.valid_to is null or s.valid_to >= v_pair.work_date)
      order by s.valid_from desc, s.created_at desc
      limit 1;

      if v_schedule_id is not null then
        select sd.weekday, sd.is_workday, sd.start_time, sd.end_time
        into v_schedule_day
        from public.hr_attendance_external_schedule_days sd
        where sd.schedule_id = v_schedule_id
          and sd.weekday = extract(dow from v_pair.work_date)::smallint
        limit 1;
      end if;

      select count(*) into v_count
      from public.hr_attendance_punches p
      where p.import_id = p_import_id
        and p.external_person_id = v_pair.external_person_id
        and p.punch_date = v_pair.work_date;
    end if;

    if extract(dow from v_pair.work_date)::smallint = any(v_settings.weekly_off_days) then
      v_status := 'day_off';
      v_note := case
        when extract(dow from v_pair.work_date)::smallint = 5 then 'الجمعة — عطلة أسبوعية حسب إعدادات الحضور.'
        else 'عطلة أسبوعية حسب إعدادات الحضور.'
      end;
    elsif v_schedule_id is null or v_schedule_day.weekday is null then
      v_status := 'no_schedule';
      v_note := 'لا يوجد روتين دوام ساري لهذا الشخص في هذا التاريخ.';
    elsif not v_schedule_day.is_workday then
      v_status := 'day_off';
      v_note := 'اليوم غير ضمن أيام العمل في روتين الشخص.';
    else
      v_start := v_pair.work_date::timestamp + v_schedule_day.start_time;
      v_end := v_pair.work_date::timestamp + v_schedule_day.end_time;
      if v_schedule_day.end_time <= v_schedule_day.start_time then
        v_end := v_end + interval '1 day';
      end if;
      v_mid := v_start + ((v_end - v_start) / 2);

      if v_count = 0 then
        v_status := 'absent';
        v_penalty := v_settings.absence_deduction_days;
        v_note := 'لا توجد أي حركة بصمة في يوم عمل.';
      else
        if v_pair.subject_type = 'internal' then
          select p.punch_local into v_check_in
          from public.hr_attendance_punches p
          where p.import_id = p_import_id
            and p.employee_id = v_pair.employee_id
            and p.punch_date = v_pair.work_date
            and p.punch_local <= v_mid
          order by abs(extract(epoch from (p.punch_local - v_start))) asc, p.punch_local asc
          limit 1;

          select p.punch_local into v_check_out
          from public.hr_attendance_punches p
          where p.import_id = p_import_id
            and p.employee_id = v_pair.employee_id
            and p.punch_date = v_pair.work_date
            and p.punch_local >= v_mid
          order by abs(extract(epoch from (p.punch_local - v_end))) asc, p.punch_local desc
          limit 1;
        else
          select p.punch_local into v_check_in
          from public.hr_attendance_punches p
          where p.import_id = p_import_id
            and p.external_person_id = v_pair.external_person_id
            and p.punch_date = v_pair.work_date
            and p.punch_local <= v_mid
          order by abs(extract(epoch from (p.punch_local - v_start))) asc, p.punch_local asc
          limit 1;

          select p.punch_local into v_check_out
          from public.hr_attendance_punches p
          where p.import_id = p_import_id
            and p.external_person_id = v_pair.external_person_id
            and p.punch_date = v_pair.work_date
            and p.punch_local >= v_mid
          order by abs(extract(epoch from (p.punch_local - v_end))) asc, p.punch_local desc
          limit 1;
        end if;

        if v_check_in is not null and v_check_out is not null and v_check_out > v_check_in then
          v_status := 'complete';
          v_worked := floor(extract(epoch from (v_check_out - v_check_in)) / 60)::integer;
          v_arrival := round(extract(epoch from (v_check_in - v_start)) / 60)::integer;
          v_departure := round(extract(epoch from (v_check_out - v_end)) / 60)::integer;
          if v_count > 2 then
            v_note := format('اختيرت بصمة الدخول والخروج المنطقيتان من %s حركات خام؛ الحركات الوسطية محفوظة ولا تدخل في الحساب.', v_count);
          end if;
        elsif v_check_in is not null then
          v_status := 'missing_out';
          v_penalty := v_settings.missing_punch_deduction_days;
          v_arrival := round(extract(epoch from (v_check_in - v_start)) / 60)::integer;
          v_note := 'وجدت بصمة دخول منطقية دون بصمة خروج منطقية.';
        elsif v_check_out is not null then
          v_status := 'missing_in';
          v_penalty := v_settings.missing_punch_deduction_days;
          v_departure := round(extract(epoch from (v_check_out - v_end)) / 60)::integer;
          v_note := 'وجدت بصمة خروج منطقية دون بصمة دخول منطقية.';
        else
          v_status := 'needs_review';
          v_note := 'الحركات موجودة لكن لم يمكن تصنيفها بثقة بالنسبة للروتين الحالي.';
        end if;
      end if;
    end if;

    if v_day_id is null then
      insert into public.hr_attendance_days(
        import_id, employee_id, external_person_id, work_date, schedule_id, external_schedule_id,
        scheduled_start, scheduled_end, check_in, check_out, worked_minutes, arrival_delta_minutes, departure_delta_minutes,
        raw_punch_count, day_status, preliminary_deduction_days, analysis_note, analysis_version, analyzed_at
      ) values (
        p_import_id, v_pair.employee_id, v_pair.external_person_id, v_pair.work_date,
        case when v_pair.subject_type = 'internal' then v_schedule_id end,
        case when v_pair.subject_type = 'external' then v_schedule_id end,
        v_start, v_end, v_check_in, v_check_out, v_worked, v_arrival, v_departure,
        v_count, v_status, v_penalty, v_note, v_settings.analysis_version, now()
      ) returning id into v_day_id;
    else
      update public.hr_attendance_days d
      set schedule_id = case when v_pair.subject_type = 'internal' then v_schedule_id else null end,
          external_schedule_id = case when v_pair.subject_type = 'external' then v_schedule_id else null end,
          scheduled_start = v_start,
          scheduled_end = v_end,
          check_in = v_check_in,
          check_out = v_check_out,
          worked_minutes = v_worked,
          arrival_delta_minutes = v_arrival,
          departure_delta_minutes = v_departure,
          raw_punch_count = v_count,
          day_status = v_status,
          preliminary_deduction_days = v_penalty,
          analysis_note = v_note,
          analysis_version = v_settings.analysis_version,
          analyzed_at = now()
      where d.id = v_day_id;
    end if;

    select coalesce((
      select case when j.decision = 'accepted' then 0::numeric else v_penalty end
      from public.hr_attendance_justifications j
      where j.attendance_day_id = v_day_id
        and j.issue_kind = case v_status
          when 'missing_in' then 'missing_in'
          when 'missing_out' then 'missing_out'
          when 'absent' then 'absence'
          else 'other'
        end
      order by j.submitted_at desc
      limit 1
    ), v_penalty)
    into v_final_penalty;

    update public.hr_attendance_days
    set recalculated_deduction_days = v_final_penalty,
        recalculated_at = now()
    where id = v_day_id;
  end loop;

  select count(*) into v_bad
  from public.hr_attendance_days
  where import_id = p_import_id and day_status = 'needs_review';

  select jsonb_build_object(
    'days', count(*),
    'preliminary_deduction_days', coalesce(sum(d.preliminary_deduction_days),0),
    'final_deduction_days', coalesce(sum(d.recalculated_deduction_days),0),
    'pending_justifications', count(*) filter (where j.decision='pending'),
    'accepted_justifications', count(*) filter (where j.decision='accepted'),
    'rejected_justifications', count(*) filter (where j.decision='rejected'),
    'needs_review', v_bad,
    'no_schedule', count(*) filter (where d.day_status='no_schedule')
  ) into v_summary
  from public.hr_attendance_days d
  left join lateral (
    select x.decision
    from public.hr_attendance_justifications x
    where x.attendance_day_id = d.id
      and x.issue_kind = case d.day_status
        when 'missing_in' then 'missing_in'
        when 'missing_out' then 'missing_out'
        when 'absent' then 'absence'
        else 'other'
      end
    order by x.submitted_at desc
    limit 1
  ) j on true
  where d.import_id = p_import_id;

  update public.hr_attendance_imports
  set status = 'recalculated',
      recalculated_at = now(),
      ready_to_post_at = null,
      review_revision = review_revision + 1
  where id = p_import_id;

  insert into public.hr_attendance_processing_events(import_id,stage,action_key,summary,actor_user_id)
  values(p_import_id,'recalculated','recalculate_with_current_schedule',v_summary,auth.uid());

  return v_summary;
end;
$$;

revoke all on function public.hr_recalculate_attendance_import(uuid) from public, anon;
grant execute on function public.hr_recalculate_attendance_import(uuid) to authenticated;
