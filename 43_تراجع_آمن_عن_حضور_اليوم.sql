-- 43_تراجع_آمن_عن_حضور_اليوم.sql
-- يسمح بالتراجع عن تسجيل الحضور اليومي قبل دخوله في تسوية قائمة.

create or replace function public.fn_clear_contractor_attendance_day(
  p_project_id uuid,
  p_contractor_id uuid,
  p_work_date date
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text := coalesce(public.current_app_role()::text,'');
  v_count integer := 0;
begin
  if v_role not in ('ceo','hr','accountant','supervisor') then
    raise exception 'غير مصرح بإلغاء الحضور';
  end if;

  if exists (
    select 1
      from public.contractor_settlements s
     where s.project_id=p_project_id
       and s.contractor_id=p_contractor_id
       and p_work_date between s.period_from and s.period_to
       and s.status not in ('rejected'::public.request_status,'cancelled'::public.request_status)
  ) then
    raise exception 'هذا اليوم داخل تسوية قائمة؛ استخدم حركة تصحيح بدلاً من المسح';
  end if;

  delete from public.attendance a
   using public.timesheet_days d
   where a.day_id=d.id
     and d.project_id=p_project_id
     and d.work_date=p_work_date
     and a.contractor_id_snapshot=p_contractor_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.fn_clear_contractor_attendance_day(uuid,uuid,date) to authenticated;

create or replace function public.fn_remove_attendance_entry(
  p_attendance_id uuid
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text := coalesce(public.current_app_role()::text,'');
  v_project uuid;
  v_contractor uuid;
  v_date date;
begin
  if v_role not in ('ceo','hr','accountant','supervisor') then
    raise exception 'غير مصرح بإلغاء الحضور';
  end if;

  select d.project_id,a.contractor_id_snapshot,d.work_date
    into v_project,v_contractor,v_date
    from public.attendance a
    join public.timesheet_days d on d.id=a.day_id
   where a.id=p_attendance_id;

  if v_project is null then return false; end if;

  if exists (
    select 1
      from public.contractor_settlements s
     where s.project_id=v_project
       and s.contractor_id=v_contractor
       and v_date between s.period_from and s.period_to
       and s.status not in ('rejected'::public.request_status,'cancelled'::public.request_status)
  ) then
    raise exception 'هذا اليوم داخل تسوية قائمة؛ استخدم حركة تصحيح بدلاً من المسح';
  end if;

  delete from public.attendance where id=p_attendance_id;
  return found;
end $$;

grant execute on function public.fn_remove_attendance_entry(uuid) to authenticated;
