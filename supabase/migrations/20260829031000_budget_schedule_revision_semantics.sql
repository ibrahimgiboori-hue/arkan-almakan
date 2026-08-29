-- الجدولة التقديرية لها وضعان:
-- 1) نفس valid_from = تصحيح للسجل التقديري، بشرط عدم وجود حقيقة مالية مقفلة.
-- 2) valid_from أحدث = تغيير من الدورة الجديدة، مع إبقاء الماضي كما كان.

create or replace function private.fn_budget_rpc_set_schedule_v2(
  p_item_id uuid,
  p_valid_from date,
  p_valid_to date,
  p_recurrence_unit text,
  p_recurrence_interval_count integer,
  p_anchor_date date,
  p_accrual_start_rule text,
  p_accrual_lead_months integer
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid;
  v_current public.budget_item_schedules;
  v_id uuid;
  v_months integer;
  v_due date;
  v_accrual date;
  v_name text;
  v_desired_dates date[] := array[]::date[];
  v_range_end date;
  i integer;
  r record;
  v_obligation public.budget_obligations;
  v_rate uuid;
  v_amount numeric;
  v_snapshot jsonb;
  v_effect text;
  v_req numeric;
  v_old numeric;
begin
  v_uid:=private.fn_budget_require('finance.operating_budget.edit');

  if not exists(
    select 1 from public.budget_item_definitions
    where id=p_item_id and node_type='item'
  ) then raise exception 'البند غير موجود'; end if;
  if p_valid_from is null or p_anchor_date is null then
    raise exception 'تاريخ السريان وتاريخ الاستحقاق المرجعي مطلوبان';
  end if;
  if p_valid_to is not null and p_valid_to<p_valid_from then
    raise exception 'نهاية السريان لا يمكن أن تسبق بدايته';
  end if;

  select name into v_name
  from public.budget_item_definitions
  where id=p_item_id;

  select * into v_current
  from public.budget_item_schedules
  where item_id=p_item_id
    and valid_from<=p_valid_from
    and (valid_to is null or valid_to>=p_valid_from)
  order by valid_from desc
  limit 1
  for update;

  if v_current.id is not null and v_current.valid_from=p_valid_from then
    if v_current.valid_to is not distinct from p_valid_to
       and v_current.recurrence_unit=p_recurrence_unit
       and v_current.recurrence_interval_count=coalesce(p_recurrence_interval_count,1)
       and v_current.anchor_date=p_anchor_date
       and v_current.accrual_start_rule=p_accrual_start_rule
       and v_current.accrual_lead_months is not distinct from p_accrual_lead_months then
      return v_current.id;
    end if;

    -- لا نعيد كتابة حقيقة مالية. في هذه الحالة يكون الخيار الصحيح تغييرًا من الدورة الحالية.
    if exists(
      select 1
      from public.budget_obligations o
      where o.schedule_id=v_current.id
        and (
          exists(
            select 1 from public.budget_period_lines l
            where l.obligation_id=o.id and l.confirmed_amount is not null
          )
          or exists(
            select 1
            from public.budget_line_settlements s
            join public.budget_period_lines l on l.id=s.period_line_id
            where l.obligation_id=o.id
          )
          or exists(
            select 1 from public.budget_reserve_movements rm
            where rm.obligation_id=o.id
          )
        )
    ) then
      raise exception 'لا يمكن تصحيح الجدولة بأثر رجعي بعد تسجيل قيمة فعلية أو سداد أو مخصص؛ استخدم تغييرًا من الدورة الحالية';
    end if;

    update public.budget_item_schedules
    set valid_to=p_valid_to,
        recurrence_unit=p_recurrence_unit,
        recurrence_interval_count=coalesce(p_recurrence_interval_count,1),
        anchor_date=p_anchor_date,
        accrual_start_rule=p_accrual_start_rule,
        accrual_lead_months=p_accrual_lead_months
    where id=v_current.id
    returning id into v_id;

    -- نبني مجموعة التواريخ الصحيحة بعد التصحيح، ونلغي التقديرات القديمة التي لم تصبح حقائق.
    v_range_end := greatest(
      coalesce(p_valid_to,(p_valid_from + interval '60 months')::date),
      (current_date + interval '36 months')::date,
      coalesce((select max(period_end) from public.budget_periods),p_valid_from)
    );

    if p_recurrence_unit='one_time' then
      if p_anchor_date>=p_valid_from and (p_valid_to is null or p_anchor_date<=p_valid_to) then
        v_desired_dates:=array_append(v_desired_dates,p_anchor_date);
        v_accrual:=case p_accrual_start_rule
          when 'fixed_months_before_due' then (p_anchor_date-make_interval(months=>coalesce(p_accrual_lead_months,1)))::date
          when 'from_period_start' then date_trunc('month',p_anchor_date)::date
          else p_valid_from
        end;
        insert into public.budget_obligations(
          item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine
        ) values(
          p_item_id,v_id,v_name||' — '||to_char(p_anchor_date,'YYYY-MM-DD'),
          least(v_accrual,p_anchor_date),p_anchor_date,true
        )
        on conflict(item_id,due_date) do update set
          schedule_id=excluded.schedule_id,
          cycle_label=excluded.cycle_label,
          accrual_start=excluded.accrual_start,
          status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
      end if;
    else
      v_months:=private.fn_budget_recurrence_months(
        p_recurrence_unit,coalesce(p_recurrence_interval_count,1)
      );
      for i in 0..240 loop
        v_due:=(p_anchor_date+make_interval(months=>i*v_months))::date;
        exit when v_due>v_range_end or (p_valid_to is not null and v_due>p_valid_to);
        continue when v_due<p_valid_from;
        v_desired_dates:=array_append(v_desired_dates,v_due);
        v_accrual:=case p_accrual_start_rule
          when 'fixed_months_before_due' then (v_due-make_interval(months=>coalesce(p_accrual_lead_months,1)))::date
          when 'from_period_start' then date_trunc('month',v_due)::date
          else (v_due-make_interval(months=>v_months)+interval '1 day')::date
        end;
        insert into public.budget_obligations(
          item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine
        ) values(
          p_item_id,v_id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),
          least(v_accrual,v_due),v_due,true
        )
        on conflict(item_id,due_date) do update set
          schedule_id=excluded.schedule_id,
          cycle_label=excluded.cycle_label,
          accrual_start=excluded.accrual_start,
          status=case when budget_obligations.status='cancelled' then 'accumulating' else budget_obligations.status end;
      end loop;
    end if;

    update public.budget_obligations
    set status='cancelled'
    where schedule_id=v_id
      and not (due_date=any(v_desired_dates))
      and status not in ('settled','cancelled');

    -- نعيد ربط سطور التقدير الموجودة بالدورات المصححة، حتى لو كان الشهر قديمًا؛
    -- confirmed_amount والتسويات غير موجودة هنا بحكم الحاجز أعلاه.
    for r in
      select l.*,p.period_start,p.period_end
      from public.budget_period_lines l
      join public.budget_periods p on p.id=l.period_id
      where l.item_id=p_item_id
        and p.period_end>=p_valid_from
        and (p_valid_to is null or p.period_start<=p_valid_to)
      order by p.period_start
    loop
      select * into v_obligation
      from public.budget_obligations o
      where o.item_id=p_item_id
        and o.schedule_id=v_id
        and o.status<>'cancelled'
        and o.accrual_start<=r.period_end
        and o.due_date>=r.period_start
      order by o.due_date
      limit 1;

      if v_obligation.id is null then
        delete from public.budget_period_lines where id=r.id;
        continue;
      end if;

      v_rate:=private.fn_budget_resolve_rate_version(p_item_id,r.period_start);
      select amount,snapshot into v_amount,v_snapshot
      from private.fn_budget_compute_line_amount(
        p_item_id,r.period_id,v_rate,r.variable_inputs,r.line_override_params
      );

      select expected_amount into v_old
      from public.budget_obligations
      where id=v_obligation.id
      for update;
      if v_old is distinct from v_amount then
        insert into public.budget_obligation_estimate_events(
          obligation_id,previous_amount,new_amount,reason,changed_by
        ) values(
          v_obligation.id,coalesce(v_old,0),v_amount,
          'تصحيح جدولة تقديرية من '||p_valid_from::text,v_uid
        );
        update public.budget_obligations
        set expected_amount=v_amount
        where id=v_obligation.id;
      end if;

      v_effect:=case when v_obligation.due_date between r.period_start and r.period_end
        then 'due_now' else 'reserve_only' end;
      v_req:=case when v_effect='reserve_only'
        then private.fn_budget_required_reserve(v_obligation.id,r.period_id)
        else 0 end;

      update public.budget_period_lines
      set obligation_id=v_obligation.id,
          rate_version_id=v_rate,
          calculation_snapshot=v_snapshot,
          due_date=v_obligation.due_date,
          cash_effect_type=v_effect,
          expected_amount=v_amount,
          required_reserve=v_req
      where id=r.id;
    end loop;

    return v_id;
  end if;

  -- إصدار جديد من هذه الدورة وما بعدها.
  if v_current.id is not null then
    update public.budget_item_schedules
    set valid_to=p_valid_from-1
    where id=v_current.id;
  end if;

  insert into public.budget_item_schedules(
    item_id,valid_from,valid_to,recurrence_unit,recurrence_interval_count,
    anchor_date,accrual_start_rule,accrual_lead_months,created_by
  ) values(
    p_item_id,p_valid_from,p_valid_to,p_recurrence_unit,
    coalesce(p_recurrence_interval_count,1),p_anchor_date,
    p_accrual_start_rule,p_accrual_lead_months,v_uid
  )
  returning id into v_id;

  perform private.fn_budget_ensure_obligation_cycles(p_item_id,p_valid_from,60);

  -- إذا كانت الدورة الحالية مولدة مسبقًا كتقدير، نربطها بالإصدار الجديد.
  -- أي سطر أصبح فعليًا أو مدفوعًا أو عليه مخصص يظل كما هو.
  for r in
    select l.*,p.period_start,p.period_end
    from public.budget_period_lines l
    join public.budget_periods p on p.id=l.period_id
    where l.item_id=p_item_id
      and p.period_end>=p_valid_from
      and (p_valid_to is null or p.period_start<=p_valid_to)
    order by p.period_start
  loop
    if r.confirmed_amount is not null
       or exists(select 1 from public.budget_line_settlements s where s.period_line_id=r.id)
       or exists(select 1 from public.budget_reserve_movements rm where rm.obligation_id=r.obligation_id) then
      continue;
    end if;

    select * into v_obligation
    from public.budget_obligations o
    where o.item_id=p_item_id
      and o.schedule_id=v_id
      and o.status<>'cancelled'
      and o.accrual_start<=r.period_end
      and o.due_date>=r.period_start
    order by o.due_date
    limit 1;

    if v_obligation.id is null then
      delete from public.budget_period_lines where id=r.id;
      continue;
    end if;

    v_rate:=private.fn_budget_resolve_rate_version(p_item_id,r.period_start);
    select amount,snapshot into v_amount,v_snapshot
    from private.fn_budget_compute_line_amount(
      p_item_id,r.period_id,v_rate,r.variable_inputs,r.line_override_params
    );

    select expected_amount into v_old
    from public.budget_obligations
    where id=v_obligation.id
    for update;
    if v_old is distinct from v_amount then
      insert into public.budget_obligation_estimate_events(
        obligation_id,previous_amount,new_amount,reason,changed_by
      ) values(
        v_obligation.id,coalesce(v_old,0),v_amount,
        'تغيير تقديري من دورة '||p_valid_from::text,v_uid
      );
      update public.budget_obligations
      set expected_amount=v_amount
      where id=v_obligation.id;
    end if;

    v_effect:=case when v_obligation.due_date between r.period_start and r.period_end
      then 'due_now' else 'reserve_only' end;
    v_req:=case when v_effect='reserve_only'
      then private.fn_budget_required_reserve(v_obligation.id,r.period_id)
      else 0 end;

    update public.budget_period_lines
    set obligation_id=v_obligation.id,
        rate_version_id=v_rate,
        calculation_snapshot=v_snapshot,
        due_date=v_obligation.due_date,
        cash_effect_type=v_effect,
        expected_amount=v_amount,
        required_reserve=v_req
    where id=r.id;
  end loop;

  return v_id;
end;
$$;

-- إبقاء الاسم القديم للداخل فقط؛ القبطان الجديد يمرر valid_to صراحةً.
create or replace function private.fn_budget_rpc_set_schedule(
  p_item_id uuid,
  p_valid_from date,
  p_recurrence_unit text,
  p_recurrence_interval_count integer,
  p_anchor_date date,
  p_accrual_start_rule text,
  p_accrual_lead_months integer
) returns uuid
language sql
security definer
set search_path=''
as $$
  select private.fn_budget_rpc_set_schedule_v2(
    p_item_id,p_valid_from,null,p_recurrence_unit,p_recurrence_interval_count,
    p_anchor_date,p_accrual_start_rule,p_accrual_lead_months
  )
$$;

revoke all on function private.fn_budget_rpc_set_schedule_v2(uuid,date,date,text,integer,date,text,integer) from public, anon, authenticated;
