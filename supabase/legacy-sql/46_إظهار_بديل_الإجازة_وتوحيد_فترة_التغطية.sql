begin;

-- يظل تعيين البديل محكوماً بالدالة الأمنية، وتتاح القراءة فقط لمستخدمي النظام النشطين.
grant select on table public.leave_request_substitutes to authenticated;

drop policy if exists p_leave_request_substitutes_read on public.leave_request_substitutes;
create policy p_leave_request_substitutes_read
on public.leave_request_substitutes
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users u
    where u.id = auth.uid()
      and u.is_active
  )
);

-- صحح السجلات القديمة التي كانت تبدأ التغطية في اليوم التالي لبداية الإجازة.
update public.employees e
set planned_start_date = lr.start_date,
    updated_at = now()
from public.leave_requests lr
where e.employment_kind = 'temporary_replacement'
  and e.replacement_leave_request_id = lr.id
  and e.planned_start_date = lr.start_date + 1;

commit;
