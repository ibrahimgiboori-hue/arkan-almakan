-- إحلال وإلغاء: لا نسمح لمصدر مشروع أن يوقظ معاملة من بوابة أخرى.
-- التغيير في المشروع يبقى project_change، ولا يمكن أن يصبح عرضًا وظيفيًا أو مسير رواتب.

begin;

delete from public.transaction_hooks
where source_event = 'write'
  and (
    (source_table = 'change_orders' and transaction_key = 'job_offer')
    or (source_table = 'project_change_events' and transaction_key = 'payroll_run')
  );

do $$
begin
  if exists (
    select 1
    from public.transaction_hooks
    where source_event = 'write'
      and (
        (source_table = 'change_orders' and transaction_key = 'job_offer')
        or (source_table = 'project_change_events' and transaction_key = 'payroll_run')
      )
  ) then
    raise exception 'بقي ربط معاملات مشروع ببوابة غير صحيحة';
  end if;

  if not exists (
    select 1 from public.transaction_hooks
    where source_table = 'change_orders'
      and source_event = 'write'
      and transaction_key = 'project_change'
      and is_active
  ) then
    raise exception 'ربط change_orders الصحيح مع project_change مفقود';
  end if;

  if not exists (
    select 1 from public.transaction_hooks
    where source_table = 'project_change_events'
      and source_event = 'write'
      and transaction_key = 'project_change'
      and is_active
  ) then
    raise exception 'ربط project_change_events الصحيح مع project_change مفقود';
  end if;
end;
$$;

commit;
