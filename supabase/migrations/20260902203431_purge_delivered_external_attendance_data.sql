drop policy if exists hr_attendance_imports_delete_external_ready on public.hr_attendance_imports;
create policy hr_attendance_imports_delete_external_ready
on public.hr_attendance_imports
for delete
to authenticated
using (
  processing_scope = 'external'
  and status in ('ready_to_post','closed')
  and (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.review'))
);

create or replace function public.hr_close_external_attendance_import(p_import_id uuid)
returns void
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if not public.fn_is_primary_user() and not public.has_any_capability('hr.attendance.review') then
    raise exception 'لا تملك صلاحية تسليم وحذف المعالجة الخارجية';
  end if;

  if not exists (
    select 1 from public.hr_attendance_imports
    where id = p_import_id
      and processing_scope = 'external'
      and status = 'ready_to_post'
  ) then
    raise exception 'المعالجة الخارجية يجب أن تكون جاهزة للتسليم قبل حذفها';
  end if;

  if exists (
    select 1 from public.hr_attendance_posted_days
    where source_import_id = p_import_id
  ) then
    raise exception 'تعذر الحذف: توجد حركات حضور رسمية مرتبطة بهذه الدفعة';
  end if;

  delete from public.hr_attendance_imports
  where id = p_import_id
    and processing_scope = 'external'
    and status = 'ready_to_post';

  if not found then
    raise exception 'تعذر حذف المعالجة الخارجية';
  end if;
end;
$function$;

revoke execute on function public.hr_close_external_attendance_import(uuid) from public, anon;
grant execute on function public.hr_close_external_attendance_import(uuid) to authenticated, service_role;

-- One-time privacy cleanup for previously delivered external batches.
delete from public.hr_attendance_imports i
where i.processing_scope = 'external'
  and i.status = 'closed'
  and not exists (
    select 1 from public.hr_attendance_posted_days p
    where p.source_import_id = i.id
  );
