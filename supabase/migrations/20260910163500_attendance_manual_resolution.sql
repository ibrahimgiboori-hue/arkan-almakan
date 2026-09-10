-- Attendance manual resolution: preserve an operator's explicit punch classification
-- through later review recalculations, while keeping a visible audit trail.

alter table public.hr_attendance_days
  add column if not exists manual_resolution_note text null,
  add column if not exists manual_resolved_by uuid null references auth.users(id),
  add column if not exists manual_resolved_at timestamptz null;

comment on column public.hr_attendance_days.manual_resolution_note is
  'Operator note explaining an explicit manual resolution of an ambiguous attendance day.';
comment on column public.hr_attendance_days.manual_resolved_at is
  'When set, the selected check-in/check-out and derived day status are authoritative during review recalculation.';

create or replace function public.hr_preserve_manual_attendance_resolution()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_missing numeric(5,2) := 0;
  v_absence numeric(5,2) := 0;
  v_penalty numeric(5,2) := 0;
  v_decision text;
begin
  -- A manual resolution becomes authoritative only after it has been explicitly saved.
  -- Clearing manual_resolved_at intentionally releases the row back to the analysis engine.
  if old.manual_resolved_at is null or new.manual_resolved_at is null then
    return new;
  end if;

  select missing_punch_deduction_days, absence_deduction_days
    into v_missing, v_absence
  from public.hr_attendance_settings
  where id = 1;

  new.check_in := old.check_in;
  new.check_out := old.check_out;
  new.day_status := old.day_status;
  new.manual_resolution_note := old.manual_resolution_note;
  new.manual_resolved_by := old.manual_resolved_by;
  new.manual_resolved_at := old.manual_resolved_at;

  new.worked_minutes := case
    when old.check_in is not null and old.check_out is not null and old.check_out > old.check_in
      then floor(extract(epoch from (old.check_out - old.check_in)) / 60)::integer
    else null
  end;
  new.arrival_delta_minutes := case
    when old.check_in is not null and new.scheduled_start is not null
      then round(extract(epoch from (old.check_in - new.scheduled_start)) / 60)::integer
    else null
  end;
  new.departure_delta_minutes := case
    when old.check_out is not null and new.scheduled_end is not null
      then round(extract(epoch from (old.check_out - new.scheduled_end)) / 60)::integer
    else null
  end;

  v_penalty := case old.day_status
    when 'missing_in' then coalesce(v_missing,0)
    when 'missing_out' then coalesce(v_missing,0)
    when 'absent' then coalesce(v_absence,0)
    else 0
  end;
  new.preliminary_deduction_days := v_penalty;
  new.analysis_note := 'تم اعتماد معالجة يدوية للحالة' ||
    case when nullif(trim(coalesce(old.manual_resolution_note,'')),'') is not null
      then ': ' || trim(old.manual_resolution_note)
      else '.' end;

  -- hr_recalculate_attendance_import derives a candidate status from raw punches first.
  -- Recalculate the final penalty from the authoritative manual status instead.
  if new.recalculated_at is not null then
    select j.decision into v_decision
    from public.hr_attendance_justifications j
    where j.attendance_day_id = old.id
      and j.issue_kind = case old.day_status
        when 'missing_in' then 'missing_in'
        when 'missing_out' then 'missing_out'
        when 'absent' then 'absence'
        else 'other'
      end
    order by j.submitted_at desc
    limit 1;

    new.recalculated_deduction_days := case
      when v_decision = 'accepted' then 0::numeric
      else v_penalty
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hr_preserve_manual_attendance_resolution on public.hr_attendance_days;
create trigger trg_hr_preserve_manual_attendance_resolution
before update on public.hr_attendance_days
for each row execute function public.hr_preserve_manual_attendance_resolution();

create or replace function public.hr_resolve_attendance_day_manual(
  p_attendance_day_id uuid,
  p_check_in timestamp without time zone default null,
  p_check_out timestamp without time zone default null,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_day public.hr_attendance_days%rowtype;
  v_import_status text;
  v_status text;
  v_missing numeric(5,2) := 0;
  v_penalty numeric(5,2) := 0;
  v_worked integer;
  v_arrival integer;
  v_departure integer;
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.review') then
    raise exception 'لا تملك صلاحية معالجة حالات الحضور يدويًا';
  end if;

  select d.* into v_day
  from public.hr_attendance_days d
  where d.id = p_attendance_day_id
  for update;
  if not found then raise exception 'حالة الحضور غير موجودة'; end if;

  select i.status into v_import_status
  from public.hr_attendance_imports i
  where i.id = v_day.import_id
  for update;

  if v_import_status not in ('analyzed','justifications','recalculated','ready_to_post') then
    raise exception 'لا يمكن تعديل هذه الحالة في المرحلة الحالية';
  end if;

  if exists (
    select 1 from public.hr_attendance_justifications j
    where j.attendance_day_id = v_day.id
  ) then
    raise exception 'هذه الحالة لها تبرير مسجل. عالج التبرير أولًا قبل تغيير تصنيف البصمة يدويًا';
  end if;

  if p_check_in is null and p_check_out is null then
    raise exception 'حدد بصمة دخول أو خروج واحدة على الأقل';
  end if;
  if p_check_in is not null and p_check_in::date not in (v_day.work_date, v_day.work_date + 1) then
    raise exception 'وقت الدخول يجب أن يكون ضمن يوم الحالة أو اليوم التالي للشفت الليلي';
  end if;
  if p_check_out is not null and p_check_out::date not in (v_day.work_date, v_day.work_date + 1) then
    raise exception 'وقت الخروج يجب أن يكون ضمن يوم الحالة أو اليوم التالي للشفت الليلي';
  end if;
  if p_check_in is not null and p_check_out is not null and p_check_out <= p_check_in then
    raise exception 'وقت الخروج يجب أن يكون بعد وقت الدخول';
  end if;

  select missing_punch_deduction_days into v_missing
  from public.hr_attendance_settings where id = 1;

  if p_check_in is not null and p_check_out is not null then
    v_status := 'complete';
    v_penalty := 0;
    v_worked := floor(extract(epoch from (p_check_out - p_check_in)) / 60)::integer;
  elsif p_check_in is not null then
    v_status := 'missing_out';
    v_penalty := coalesce(v_missing,0);
  else
    v_status := 'missing_in';
    v_penalty := coalesce(v_missing,0);
  end if;

  v_arrival := case when p_check_in is not null and v_day.scheduled_start is not null
    then round(extract(epoch from (p_check_in - v_day.scheduled_start)) / 60)::integer end;
  v_departure := case when p_check_out is not null and v_day.scheduled_end is not null
    then round(extract(epoch from (p_check_out - v_day.scheduled_end)) / 60)::integer end;

  update public.hr_attendance_days
  set check_in = p_check_in,
      check_out = p_check_out,
      worked_minutes = v_worked,
      arrival_delta_minutes = v_arrival,
      departure_delta_minutes = v_departure,
      day_status = v_status,
      preliminary_deduction_days = v_penalty,
      recalculated_deduction_days = null,
      recalculated_at = null,
      analysis_note = 'تم اعتماد معالجة يدوية للحالة' ||
        case when nullif(trim(coalesce(p_note,'')),'') is not null then ': ' || trim(p_note) else '.' end,
      manual_resolution_note = nullif(trim(coalesce(p_note,'')),''),
      manual_resolved_by = auth.uid(),
      manual_resolved_at = now()
  where id = v_day.id;

  update public.hr_attendance_imports
  set status = 'justifications',
      recalculated_at = null,
      ready_to_post_at = null,
      review_revision = review_revision + 1
  where id = v_day.import_id;

  insert into public.hr_attendance_processing_events(import_id,stage,action_key,summary,actor_user_id)
  values(
    v_day.import_id,
    'justifications',
    'manual_day_resolution',
    jsonb_build_object(
      'attendance_day_id',v_day.id,
      'work_date',v_day.work_date,
      'previous_status',v_day.day_status,
      'new_status',v_status,
      'check_in',p_check_in,
      'check_out',p_check_out
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'attendance_day_id',v_day.id,
    'day_status',v_status,
    'check_in',p_check_in,
    'check_out',p_check_out,
    'worked_minutes',v_worked,
    'preliminary_deduction_days',v_penalty
  );
end;
$$;

revoke all on function public.hr_resolve_attendance_day_manual(uuid,timestamp without time zone,timestamp without time zone,text) from public, anon;
grant execute on function public.hr_resolve_attendance_day_manual(uuid,timestamp without time zone,timestamp without time zone,text) to authenticated;
