-- 44_حماية_الحضور_التاريخي.sql
-- يمنع إنشاء حضور جديد خارج إسناد العامل التاريخي، دون تعديل أي سجل قديم.

create or replace function public.guard_attendance_historical_assignment()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_project uuid;
  v_date date;
begin
  select project_id, work_date
    into v_project, v_date
    from public.timesheet_days
   where id = new.day_id;

  if v_project is null or v_date is null then
    raise exception 'يوم العمل غير صحيح';
  end if;

  if not exists (
    select 1
      from public.labor_project_assignments a
     where a.laborer_id = new.laborer_id
       and a.project_id = v_project
       and a.valid_from <= v_date
       and (a.valid_to is null or a.valid_to >= v_date)
  ) then
    raise exception 'لا يوجد إسناد تاريخي للعامل في هذا المشروع بتاريخ %؛ راجع فترة إسناده أولاً', v_date;
  end if;

  return new;
end $$;

drop trigger if exists trg_attendance_historical_assignment on public.attendance;
create trigger trg_attendance_historical_assignment
before insert on public.attendance
for each row execute function public.guard_attendance_historical_assignment();
