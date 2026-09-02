create or replace function public.hr_analyze_attendance_import(p_import_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_from date;
  v_to date;
  v_settings public.hr_attendance_settings%rowtype;
  v_pair record;
  v_schedule public.hr_employee_work_schedules%rowtype;
  v_schedule_day public.hr_employee_work_schedule_days%rowtype;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_mid timestamp without time zone;
  v_check_in timestamp without time zone;
  v_check_out timestamp without time zone;
  v_count integer;
  v_status text;
  v_penalty numeric(5,2);
  v_note text;
  v_worked integer;
  v_arrival integer;
  v_departure integer;
  v_summary jsonb;
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.import') then
    raise exception 'لا تملك صلاحية تحليل ملفات الحضور والانصراف';
  end if;

  select * into v_settings from public.hr_attendance_settings where id = 1;
  if not found then raise exception 'إعدادات الحضور غير موجودة'; end if;

  select coalesce(i.period_from, p.min_date), coalesce(i.period_to, p.max_date)
    into v_from, v_to
  from public.hr_attendance_imports i
  left join lateral (
    select min(punch_date) as min_date, max(punch_date) as max_date
    from public.hr_attendance_punches p
    where p.import_id = i.id
  ) p on true
  where i.id = p_import_id;

  if v_from is null or v_to is null then
    raise exception 'لا يمكن تحديد فترة ملف الحضور';
  end if;
  if v_to < v_from then raise exception 'فترة ملف الحضور غير صحيحة'; end if;

  delete from public.hr_attendance_days where import_id = p_import_id;

  for v_pair in
    with dates as (
      select d::date as work_date from generate_series(v_from, v_to, interval '1 day') d
    ), scheduled as (
      select distinct s.employee_id, d.work_date
      from public.hr_employee_work_schedules s
      join dates d on s.valid_from <= d.work_date and (s.valid_to is null or s.valid_to >= d.work_date)
      where s.is_active
    ), punched as (
      select distinct p.employee_id, p.punch_date as work_date
      from public.hr_attendance_punches p
      where p.import_id = p_import_id and p.employee_id is not null
    )
    select distinct employee_id, work_date
    from (
      select * from scheduled
      union all
      select * from punched
    ) x
    order by employee_id, work_date
  loop
    v_schedule := null;
    v_schedule_day := null;
    v_start := null; v_end := null; v_mid := null;
    v_check_in := null; v_check_out := null;
    v_worked := null; v_arrival := null; v_departure := null;
    v_note := null; v_penalty := 0; v_status := 'no_schedule';

    select s.* into v_schedule
    from public.hr_employee_work_schedules s
    where s.employee_id = v_pair.employee_id
      and s.is_active
      and s.valid_from <= v_pair.work_date
      and (s.valid_to is null or s.valid_to >= v_pair.work_date)
    order by s.valid_from desc, s.created_at desc
    limit 1;

    select count(*) into v_count
    from public.hr_attendance_punches p
    where p.import_id = p_import_id
      and p.employee_id = v_pair.employee_id
      and p.punch_date = v_pair.work_date;

    if extract(dow from v_pair.work_date)::smallint = any(v_settings.weekly_off_days) then
      v_status := 'day_off';
      v_note := 'إجازة أسبوعية حسب إعدادات الحضور.';
    elsif v_schedule.id is null then
      v_status := 'no_schedule';
      v_note := 'لا يوجد روتين دوام ساري لهذا الموظف في هذا التاريخ.';
    else
      select sd.* into v_schedule_day
      from public.hr_employee_work_schedule_days sd
      where sd.schedule_id = v_schedule.id
        and sd.weekday = extract(dow from v_pair.work_date)::smallint
      limit 1;

      if v_schedule_day.id is null then
        v_status := 'no_schedule';
        v_note := 'روتين الموظف لا يحتوي إعدادًا لهذا اليوم من الأسبوع.';
      elsif not v_schedule_day.is_workday then
        v_status := 'day_off';
        v_note := 'إجازة حسب روتين الموظف.';
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

          if v_check_in is not null and v_check_out is not null and v_check_out > v_check_in then
            v_status := 'complete';
            v_worked := floor(extract(epoch from (v_check_out - v_check_in)) / 60)::integer;
            v_arrival := round(extract(epoch from (v_check_in - v_start)) / 60)::integer;
            v_departure := round(extract(epoch from (v_check_out - v_end)) / 60)::integer;
            v_note := case
              when v_count > 2 then format('تم اختيار بصمة الدخول والخروج المنطقيتين من %s حركات خام؛ الحركات الوسطية محفوظة ولا تدخل في الحساب.', v_count)
              else null
            end;
          elsif v_check_in is not null and v_check_out is null then
            v_status := 'missing_out';
            v_penalty := v_settings.missing_punch_deduction_days;
            v_arrival := round(extract(epoch from (v_check_in - v_start)) / 60)::integer;
            v_note := 'تم العثور على بصمة منطقية قرب بداية الدوام دون بصمة خروج منطقية.';
          elsif v_check_in is null and v_check_out is not null then
            v_status := 'missing_in';
            v_penalty := v_settings.missing_punch_deduction_days;
            v_departure := round(extract(epoch from (v_check_out - v_end)) / 60)::integer;
            v_note := 'تم العثور على بصمة منطقية قرب نهاية الدوام دون بصمة دخول منطقية.';
          else
            v_status := 'needs_review';
            v_penalty := 0;
            v_note := 'الحركات موجودة لكن لم يمكن تصنيفها بثقة بالنسبة لروتين الموظف.';
          end if;
        end if;
      end if;
    end if;

    insert into public.hr_attendance_days(
      import_id, employee_id, work_date, schedule_id,
      scheduled_start, scheduled_end, check_in, check_out,
      worked_minutes, arrival_delta_minutes, departure_delta_minutes,
      raw_punch_count, day_status, preliminary_deduction_days,
      analysis_note, analysis_version, analyzed_at
    ) values (
      p_import_id, v_pair.employee_id, v_pair.work_date, v_schedule.id,
      v_start, v_end, v_check_in, v_check_out,
      v_worked, v_arrival, v_departure,
      v_count, v_status, v_penalty,
      v_note, v_settings.analysis_version, now()
    );
  end loop;

  update public.hr_attendance_imports i
  set period_from = v_from,
      period_to = v_to,
      status = 'analyzed',
      rows_received = (select count(*) from public.hr_attendance_punches p where p.import_id = p_import_id),
      matched_punches = (select count(*) from public.hr_attendance_punches p where p.import_id = p_import_id and p.employee_id is not null),
      unmatched_punches = (select count(*) from public.hr_attendance_punches p where p.import_id = p_import_id and p.employee_id is null),
      analyzed_at = now()
  where i.id = p_import_id;

  select jsonb_build_object(
    'import_id', p_import_id,
    'period_from', v_from,
    'period_to', v_to,
    'days', count(*),
    'complete', count(*) filter (where day_status='complete'),
    'missing_in', count(*) filter (where day_status='missing_in'),
    'missing_out', count(*) filter (where day_status='missing_out'),
    'absent', count(*) filter (where day_status='absent'),
    'day_off', count(*) filter (where day_status='day_off'),
    'no_schedule', count(*) filter (where day_status='no_schedule'),
    'needs_review', count(*) filter (where day_status='needs_review'),
    'preliminary_deduction_days', coalesce(sum(preliminary_deduction_days),0)
  ) into v_summary
  from public.hr_attendance_days
  where import_id = p_import_id;

  return v_summary;
end;
$$;

revoke all on function public.hr_analyze_attendance_import(uuid) from public, anon;
grant execute on function public.hr_analyze_attendance_import(uuid) to authenticated;

create or replace function public.hr_attendance_justification_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.decision <> 'pending' and not public.fn_is_primary_user() then
      raise exception 'قرار قبول أو رفض تبرير الحضور خاص بالمستخدم الرئيسي';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.decision is distinct from old.decision
        or new.decided_by is distinct from old.decided_by
        or new.decided_at is distinct from old.decided_at)
       and not public.fn_is_primary_user() then
      raise exception 'قرار قبول أو رفض تبرير الحضور خاص بالمستخدم الرئيسي';
    end if;
  end if;

  if new.decision in ('accepted','rejected') then
    if not public.fn_is_primary_user() then
      raise exception 'قرار قبول أو رفض تبرير الحضور خاص بالمستخدم الرئيسي';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := coalesce(new.decided_at, now());
  else
    new.decided_by := null;
    new.decided_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_attendance_justification_guard on public.hr_attendance_justifications;
create trigger trg_hr_attendance_justification_guard
before insert or update on public.hr_attendance_justifications
for each row execute function public.hr_attendance_justification_guard();

create or replace view public.v_hr_attendance_employee_monthly
with (security_invoker = true)
as
select
  d.employee_id,
  d.employee_no,
  d.employee_name,
  date_trunc('month', d.work_date)::date as month_start,
  count(*) filter (where d.day_status not in ('day_off','no_schedule')) as scheduled_days,
  count(*) filter (where d.day_status='complete') as complete_days,
  count(*) filter (where d.day_status='absent') as absence_days,
  count(*) filter (where d.day_status='missing_in') as missing_in_days,
  count(*) filter (where d.day_status='missing_out') as missing_out_days,
  count(*) filter (where d.day_status='needs_review') as review_days,
  coalesce(sum(d.worked_minutes),0) as worked_minutes,
  coalesce(sum(d.late_arrival_minutes),0) as late_arrival_minutes,
  coalesce(sum(d.early_arrival_minutes),0) as early_arrival_minutes,
  coalesce(sum(d.early_departure_minutes),0) as early_departure_minutes,
  coalesce(sum(d.late_departure_minutes),0) as late_departure_minutes,
  coalesce(sum(d.preliminary_deduction_days),0) as preliminary_deduction_days,
  coalesce(sum(d.final_deduction_days),0) as final_deduction_days
from public.v_hr_attendance_days d
group by d.employee_id,d.employee_no,d.employee_name,date_trunc('month', d.work_date)::date;

grant select on public.v_hr_attendance_employee_monthly to authenticated;
