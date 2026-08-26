-- إصلاح تاريخي عام لأي تنفيذ بدأ دون ملف مقاول للمشروع، ثم إغلاق باب حذف
-- تنفيذ بدأ بالفعل. لا توجد معرفات مشاريع/مقاولين ثابتة في هذا الترحيل.

with pair_stats as (
  select
    pi.project_id,
    ie.contractor_id,
    min(ie.start_date) filter (where ie.start_date is not null) as first_start,
    bool_or(ie.end_date is null) as has_open,
    max(ie.end_date) as last_end
  from public.item_execution ie
  join public.project_items pi on pi.id = ie.project_item_id
  where ie.contractor_id is not null
    and ie.start_date is not null
  group by pi.project_id, ie.contractor_id
), latest_terms as (
  select distinct on (pi.project_id, ie.contractor_id)
    pi.project_id,
    ie.contractor_id,
    ie.mode,
    ie.worker_daily,
    ie.tech_daily,
    ie.agreed_rate,
    ie.target_output,
    pi.unit
  from public.item_execution ie
  join public.project_items pi on pi.id = ie.project_item_id
  where ie.contractor_id is not null
    and ie.start_date is not null
  order by pi.project_id, ie.contractor_id,
           (ie.end_date is null) desc,
           ie.start_date desc nulls last,
           ie.decided_at desc nulls last
)
insert into public.project_contractors(
  project_id, contractor_id, basis,
  worker_daily, tech_daily, piece_rate, piece_unit,
  transport_charge_to, meals_charge_to, housing_charge_to, tools_charge_to,
  daily_target_output, target_unit,
  start_date, end_date, is_active,
  notes
)
select
  ps.project_id,
  ps.contractor_id,
  case lt.mode::text
    when 'piecework' then 'piecework'::public.pay_basis
    when 'sublet' then 'piecework'::public.pay_basis
    else 'daily'::public.pay_basis
  end,
  coalesce(lt.worker_daily, c.worker_daily),
  coalesce(lt.tech_daily, c.tech_daily),
  lt.agreed_rate,
  lt.unit,
  c.transport_charge_to,
  c.meals_charge_to,
  c.housing_charge_to,
  c.tools_charge_to,
  lt.target_output,
  lt.unit,
  ps.first_start,
  case when ps.has_open then null else ps.last_end end,
  ps.has_open,
  'تم إنشاء ملف المقاول تلقائيًا من سجل تنفيذ البنود أثناء توحيد دستور التشغيل.'
from pair_stats ps
join latest_terms lt
  on lt.project_id = ps.project_id and lt.contractor_id = ps.contractor_id
join public.contractors c on c.id = ps.contractor_id
left join public.project_contractors pc
  on pc.project_id = ps.project_id and pc.contractor_id = ps.contractor_id
where pc.id is null;

create or replace function public.fn_delete_item_execution_assignment(
  p_execution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exec public.item_execution;
  v_item public.project_items;
begin
  if (select auth.uid()) is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_exec
  from public.item_execution
  where id = p_execution_id
  for update;

  if v_exec.id is null then
    raise exception 'إسناد التنفيذ غير موجود';
  end if;

  select * into v_item
  from public.project_items
  where id = v_exec.project_item_id;

  if not public.has_project_capability('projects.execution.edit', v_item.project_id, v_exec.planned_cost) then
    raise exception 'لا تملك صلاحية إلغاء إسناد هذا البند';
  end if;

  if v_exec.start_date is not null then
    raise exception 'بدأ تنفيذ هذا الإسناد ولا يجوز حذفه؛ استخدم إنهاء الإسناد للحفاظ على التاريخ';
  end if;
  if v_exec.end_date is not null then
    raise exception 'الإسناد منتهٍ ولا يجوز حذف سجله التاريخي';
  end if;

  if exists(
    select 1
    from public.day_items di
    where di.project_item_id = v_exec.project_item_id
      and not di.contractor_id is distinct from v_exec.contractor_id
  ) then
    raise exception 'يوجد تشغيل يومي مسجل لهذا الإسناد؛ لا يجوز حذفه';
  end if;

  delete from public.item_execution where id = v_exec.id;

  return jsonb_build_object(
    'ok', true,
    'execution_id', v_exec.id,
    'project_item_id', v_exec.project_item_id,
    'contractor_id', v_exec.contractor_id
  );
end
$$;

revoke execute on function public.fn_delete_item_execution_assignment(uuid) from public, anon;
grant execute on function public.fn_delete_item_execution_assignment(uuid) to authenticated;
comment on function public.fn_delete_item_execution_assignment(uuid) is
  'يلغي قرار إسناد لم يبدأ فقط. أي إسناد بدأ أو له أثر تشغيل يومي يبقى تاريخيًا ويُنهى ولا يُحذف.';
