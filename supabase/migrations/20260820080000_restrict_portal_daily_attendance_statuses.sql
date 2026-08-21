-- عمال المقاولين باليومية: غياب أو نصف يوم أو يوم كامل فقط.
-- عدم وجود سجل حضور يعامل كتغيب بأجر صفر في العرض والتقارير.

create or replace function public.guard_portal_daily_attendance_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.portal_last_edited_by is not null
     and new.status::text not in ('absent','half','full') then
    raise exception 'عمال اليومية يقبلون غيابًا أو نصف يوم أو يومًا كاملًا فقط';
  end if;
  return new;
end
$$;

drop trigger if exists trg_portal_daily_attendance_status on public.attendance;
create trigger trg_portal_daily_attendance_status
before insert or update of status, portal_last_edited_by
on public.attendance
for each row execute function public.guard_portal_daily_attendance_status();

comment on function public.guard_portal_daily_attendance_status()
is 'يقصر تسجيل بوابة المقاول لعمال اليومية على الغياب والنصف والكامل.';
