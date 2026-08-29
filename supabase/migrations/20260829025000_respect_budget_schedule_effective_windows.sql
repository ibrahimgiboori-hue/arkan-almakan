-- لا يجوز لمحرك الالتزامات إنشاء دورات خارج نافذة سريان الجدولة.
-- يخدم ذلك العقود المحددة المدة مثل إيجار مكتب لمدة ستة أشهر.

create or replace function private.fn_budget_ensure_obligation_cycles(
  p_item_id uuid,
  p_from_date date,
  p_horizon_months integer default 24
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.budget_item_schedules;
  v_months int;
  i int;
  v_due date;
  v_accrual date;
  v_name text;
  v_horizon_end date;
  v_window_start date;
  v_window_end date;
begin
  select name into v_name
  from public.budget_item_definitions
  where id=p_item_id and node_type='item';
  if v_name is null then return; end if;

  v_horizon_end := (p_from_date + make_interval(months=>p_horizon_months))::date;

  for s in
    select *
    from public.budget_item_schedules
    where item_id=p_item_id
      and valid_from<=v_horizon_end
      and (valid_to is null or valid_to>=p_from_date)
    order by valid_from
  loop
    v_window_start := greatest(p_from_date,s.valid_from);
    v_window_end := least(v_horizon_end,coalesce(s.valid_to,v_horizon_end));

    if s.recurrence_unit='one_time' then
      v_due:=s.anchor_date;
      if v_due between v_window_start and v_window_end then
        v_accrual:=case s.accrual_start_rule
          when 'fixed_months_before_due' then (v_due-make_interval(months=>s.accrual_lead_months))::date
          when 'from_period_start' then date_trunc('month',v_due)::date
          else s.valid_from
        end;
        insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
        values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),least(v_accrual,v_due),v_due,true)
        on conflict(item_id,due_date) do nothing;
      end if;
      continue;
    end if;

    v_months:=private.fn_budget_recurrence_months(s.recurrence_unit,s.recurrence_interval_count);
    for i in 0..240 loop
      v_due:=(s.anchor_date+make_interval(months=>i*v_months))::date;
      exit when v_due>v_window_end;
      continue when v_due<v_window_start;
      v_accrual:=case s.accrual_start_rule
        when 'fixed_months_before_due' then (v_due-make_interval(months=>s.accrual_lead_months))::date
        when 'from_period_start' then date_trunc('month',v_due)::date
        else (v_due-make_interval(months=>v_months)+interval '1 day')::date
      end;
      insert into public.budget_obligations(item_id,schedule_id,cycle_label,accrual_start,due_date,created_by_engine)
      values(p_item_id,s.id,v_name||' — '||to_char(v_due,'YYYY-MM-DD'),least(v_accrual,v_due),v_due,true)
      on conflict(item_id,due_date) do nothing;
    end loop;
  end loop;
end;
$function$;
