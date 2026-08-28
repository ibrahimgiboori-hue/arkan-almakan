create extension if not exists btree_gist;
create schema if not exists private;

create table public.company_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_headquarters boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index company_branches_one_headquarters_uq on public.company_branches((is_headquarters)) where is_headquarters;

create table public.budget_item_definitions (
  id uuid primary key default gen_random_uuid(),
  parent_item_id uuid references public.budget_item_definitions(id) on delete restrict,
  node_type text not null check (node_type in ('group','item')),
  branch_scope_id uuid references public.company_branches(id) on delete restrict,
  group_key text not null,
  name text not null,
  unit_label text,
  calculation_type text,
  external_source text,
  is_active boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_item_definition_shape_ck check (
    (node_type='group' and calculation_type is null and external_source is null)
    or
    (node_type='item' and calculation_type in (
      'fixed_amount','quantity_x_unit_price','variable_monthly','tiered','percentage_of_base',
      'composite_formula','subscription_plus_usage','manual_actual','external_forecast_actual','employee_based_contribution'
    ))
  ),
  constraint budget_item_external_source_ck check (
    external_source is null or (calculation_type='external_forecast_actual' and external_source in ('payroll_run'))
  )
);

create table public.budget_item_schedules (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.budget_item_definitions(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  recurrence_unit text not null check (recurrence_unit in ('month','quarter','half_year','year','one_time')),
  recurrence_interval_count integer not null default 1 check (recurrence_interval_count > 0),
  anchor_date date not null,
  accrual_start_rule text not null default 'immediately_after_previous_due' check (accrual_start_rule in ('immediately_after_previous_due','fixed_months_before_due','from_period_start')),
  accrual_lead_months integer,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint budget_schedule_dates_ck check (valid_to is null or valid_to >= valid_from),
  constraint budget_schedule_lead_ck check ((accrual_start_rule='fixed_months_before_due' and accrual_lead_months is not null and accrual_lead_months > 0) or (accrual_start_rule<>'fixed_months_before_due' and accrual_lead_months is null))
);
alter table public.budget_item_schedules add constraint budget_item_schedules_no_overlap
  exclude using gist (item_id with =, daterange(valid_from, coalesce(valid_to,'infinity'::date),'[]') with &&);

create table public.budget_rate_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.budget_item_definitions(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  params jsonb not null default '{}'::jsonb,
  source text not null check (source in ('official_documented','actual_invoice','published_source','estimated','manual_entry')),
  source_note text,
  verified_at date,
  verified_by uuid references public.app_users(id),
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint budget_rate_dates_ck check (valid_to is null or valid_to >= valid_from)
);
alter table public.budget_rate_versions add constraint budget_rate_versions_no_overlap
  exclude using gist (item_id with =, daterange(valid_from, coalesce(valid_to,'infinity'::date),'[]') with &&);

create table public.budget_tariff_bands (
  id uuid primary key default gen_random_uuid(),
  rate_version_id uuid not null references public.budget_rate_versions(id) on delete cascade,
  band_order integer not null,
  min_count numeric not null,
  max_count numeric,
  band_mode text not null check (band_mode in ('flat_fee_on_entry','per_unit_in_band','per_unit_cumulative')),
  band_amount numeric not null check (band_amount >= 0),
  created_at timestamptz not null default now(),
  unique(rate_version_id, band_order),
  constraint budget_tariff_band_bounds_ck check (max_count is null or max_count > min_count)
);
alter table public.budget_tariff_bands add constraint budget_tariff_bands_no_overlap
  exclude using gist (rate_version_id with =, numrange(min_count, max_count, '[)') with &&);

create table public.budget_obligations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.budget_item_definitions(id) on delete restrict,
  schedule_id uuid not null references public.budget_item_schedules(id) on delete restrict,
  cycle_label text not null,
  accrual_start date not null,
  due_date date not null,
  expected_amount numeric not null default 0 check (expected_amount >= 0),
  status text not null default 'accumulating' check (status in ('accumulating','due_soon','settled','cancelled')),
  created_by_engine boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(item_id,due_date),
  constraint budget_obligation_dates_ck check (accrual_start <= due_date)
);

create table public.budget_obligation_estimate_events (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.budget_obligations(id) on delete restrict,
  previous_amount numeric not null check (previous_amount >= 0),
  new_amount numeric not null check (new_amount >= 0),
  reason text not null,
  changed_by uuid references public.app_users(id),
  changed_at timestamptz not null default now()
);

create table public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','open','closed')),
  opening_bank_balance numeric,
  opened_at timestamptz,
  opened_by uuid references public.app_users(id),
  closed_at timestamptz,
  closed_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  unique(period_start,period_end),
  constraint budget_period_calendar_month_ck check (
    period_start = date_trunc('month', period_start)::date
    and period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date
  )
);

create table public.budget_period_reopen_log (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.budget_periods(id) on delete restrict,
  reopened_by uuid not null references public.app_users(id),
  reopened_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) > 0),
  reclosed_at timestamptz,
  reclosed_by uuid references public.app_users(id)
);

create table public.budget_period_cash_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.budget_periods(id) on delete restrict,
  event_date date not null,
  direction text not null check (direction in ('in','out')),
  amount numeric not null check (amount > 0),
  label text not null,
  source_type text,
  source_id uuid,
  lifecycle_status text not null default 'planned' check (lifecycle_status in ('planned','realized','cancelled')),
  treasury_movement_id uuid references public.treasury_movements(id) on delete restrict,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_cash_event_realized_ck check ((lifecycle_status='realized' and treasury_movement_id is not null) or lifecycle_status<>'realized')
);

create table public.budget_period_lines (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.budget_periods(id) on delete restrict,
  item_id uuid not null references public.budget_item_definitions(id) on delete restrict,
  obligation_id uuid not null references public.budget_obligations(id) on delete restrict,
  rate_version_id uuid references public.budget_rate_versions(id) on delete restrict,
  calculation_snapshot jsonb not null,
  variable_inputs jsonb,
  line_override_params jsonb,
  override_reason text,
  overridden_by uuid references public.app_users(id),
  overridden_at timestamptz,
  due_date date not null,
  cash_effect_type text not null check (cash_effect_type in ('reserve_only','due_now')),
  expected_amount numeric not null check (expected_amount >= 0),
  confirmed_amount numeric check (confirmed_amount is null or confirmed_amount >= 0),
  confirmed_source text check (confirmed_source is null or confirmed_source in ('manual','external_actual','invoice')),
  confirmed_by uuid references public.app_users(id),
  confirmed_at timestamptz,
  required_reserve numeric not null default 0 check (required_reserve >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_id,item_id)
);

create table public.budget_line_settlements (
  id uuid primary key default gen_random_uuid(),
  period_line_id uuid not null references public.budget_period_lines(id) on delete restrict,
  treasury_movement_id uuid not null references public.treasury_movements(id) on delete restrict,
  amount numeric not null check (amount > 0),
  settlement_mode text not null check (settlement_mode in ('engine_initiated','linked_existing')),
  settled_at timestamptz not null default now(),
  recorded_by uuid references public.app_users(id)
);

create table public.budget_reserve_movements (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.budget_obligations(id) on delete restrict,
  period_id uuid not null references public.budget_periods(id) on delete restrict,
  direction text not null check (direction in ('reserve','release')),
  amount numeric not null check (amount > 0),
  reason text,
  is_auto_release boolean not null default false,
  source_settlement_id uuid references public.budget_line_settlements(id) on delete restrict,
  reverses_movement_id uuid references public.budget_reserve_movements(id) on delete restrict,
  recorded_by uuid references public.app_users(id),
  recorded_at timestamptz not null default now()
);

create index budget_item_definitions_parent_idx on public.budget_item_definitions(parent_item_id);
create index budget_item_definitions_branch_idx on public.budget_item_definitions(branch_scope_id);
create index budget_schedules_item_idx on public.budget_item_schedules(item_id,valid_from);
create index budget_rates_item_idx on public.budget_rate_versions(item_id,valid_from);
create index budget_obligations_item_due_idx on public.budget_obligations(item_id,due_date,status);
create index budget_lines_period_idx on public.budget_period_lines(period_id);
create index budget_lines_obligation_idx on public.budget_period_lines(obligation_id);
create index budget_settlements_line_idx on public.budget_line_settlements(period_line_id);
create index budget_settlements_treasury_idx on public.budget_line_settlements(treasury_movement_id);
create index budget_reserves_obligation_idx on public.budget_reserve_movements(obligation_id,recorded_at);
create index budget_cash_events_period_date_idx on public.budget_period_cash_events(period_id,event_date);

create or replace function private.fn_budget_guard_item_parent() returns trigger
language plpgsql set search_path = '' as $$
declare v_type text;
begin
  if new.parent_item_id is not null then
    select node_type into v_type from public.budget_item_definitions where id=new.parent_item_id;
    if v_type is distinct from 'group' then raise exception 'البند الأب يجب أن يكون مجموعة'; end if;
  end if;
  return new;
end;$$;
create trigger trg_budget_item_parent before insert or update of parent_item_id on public.budget_item_definitions for each row execute function private.fn_budget_guard_item_parent();

create or replace function private.fn_budget_guard_item_only() returns trigger
language plpgsql set search_path = '' as $$
declare v_id uuid; v_type text;
begin
  v_id := case tg_table_name
    when 'budget_item_schedules' then new.item_id
    when 'budget_rate_versions' then new.item_id
    when 'budget_obligations' then new.item_id
    when 'budget_period_lines' then new.item_id
  end;
  select node_type into v_type from public.budget_item_definitions where id=v_id;
  if v_type is distinct from 'item' then raise exception 'لا يمكن إنشاء سجل مالي لمجموعة تجميعية'; end if;
  return new;
end;$$;
create trigger trg_budget_schedule_item_only before insert or update of item_id on public.budget_item_schedules for each row execute function private.fn_budget_guard_item_only();
create trigger trg_budget_rate_item_only before insert or update of item_id on public.budget_rate_versions for each row execute function private.fn_budget_guard_item_only();
create trigger trg_budget_obligation_item_only before insert or update of item_id on public.budget_obligations for each row execute function private.fn_budget_guard_item_only();
create trigger trg_budget_line_item_only before insert or update of item_id on public.budget_period_lines for each row execute function private.fn_budget_guard_item_only();

create or replace function private.fn_budget_guard_rate_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.item_id is distinct from old.item_id or new.valid_from is distinct from old.valid_from or new.params is distinct from old.params
     or new.source is distinct from old.source or new.source_note is distinct from old.source_note or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'إصدار التعرفة غير قابل للتعديل؛ أغلقه وأنشئ إصدارًا جديدًا';
  end if;
  if new.valid_to is not null and new.valid_to < new.valid_from then raise exception 'تاريخ نهاية التعرفة غير صحيح'; end if;
  return new;
end;$$;
create trigger trg_budget_rate_immutable before update on public.budget_rate_versions for each row execute function private.fn_budget_guard_rate_immutable();

create or replace function private.fn_budget_guard_band_immutable_when_used() returns trigger
language plpgsql set search_path = '' as $$
declare v_rate uuid := coalesce(old.rate_version_id,new.rate_version_id);
begin
  if exists(select 1 from public.budget_period_lines where rate_version_id=v_rate) then
    raise exception 'لا يمكن تعديل شرائح تعرفة استُخدمت في كشف شهري';
  end if;
  return coalesce(new,old);
end;$$;
create trigger trg_budget_band_immutable before update or delete on public.budget_tariff_bands for each row execute function private.fn_budget_guard_band_immutable_when_used();

create or replace function private.fn_budget_guard_cash_event_period() returns trigger
language plpgsql set search_path = '' as $$
declare v_start date; v_end date; v_status text;
begin
  select period_start,period_end,status into v_start,v_end,v_status from public.budget_periods where id=new.period_id;
  if new.event_date < v_start or new.event_date > v_end then raise exception 'تاريخ التدفق يجب أن يكون داخل الشهر'; end if;
  if v_status='closed' then raise exception 'الشهر مقفل'; end if;
  return new;
end;$$;
create trigger trg_budget_cash_event_period before insert or update on public.budget_period_cash_events for each row execute function private.fn_budget_guard_cash_event_period();

create trigger trg_budget_item_touch before update on public.budget_item_definitions for each row execute function public.fn_touch_updated_at();
create trigger trg_budget_obligation_touch before update on public.budget_obligations for each row execute function public.fn_touch_updated_at();
create trigger trg_budget_line_touch before update on public.budget_period_lines for each row execute function public.fn_touch_updated_at();
create trigger trg_budget_cash_event_touch before update on public.budget_period_cash_events for each row execute function public.fn_touch_updated_at();

insert into public.permission_capabilities(capability_key,module_key,module_label_ar,resource_key,resource_label_ar,action_key,description_ar,risk_level,is_active)
values
('finance.operating_budget.view','finance','المالية','operating_budget','ميزانية وتشغيل الشركة','view','عرض ميزانية وتشغيل الشركة',1,true),
('finance.operating_budget.edit','finance','المالية','operating_budget','ميزانية وتشغيل الشركة','edit','إدارة بنود وفترات ومخصصات ميزانية التشغيل',2,true),
('finance.operating_budget.reopen','finance','المالية','operating_budget','ميزانية وتشغيل الشركة','reopen','إعادة فتح شهر ميزانية مقفل مع تسجيل السبب',3,true)
on conflict (capability_key) do update set is_active=excluded.is_active,description_ar=excluded.description_ar;

insert into public.permission_bundle_capabilities(bundle_id,capability_key,amount_limit)
select b.id,c.capability_key,null from public.permission_bundles b
cross join (values ('finance.operating_budget.view'),('finance.operating_budget.edit')) c(capability_key)
where b.bundle_key in ('finance_full_access','financial_controller')
on conflict (bundle_id,capability_key) do nothing;
insert into public.permission_bundle_capabilities(bundle_id,capability_key,amount_limit)
select b.id,'finance.operating_budget.reopen',null from public.permission_bundles b where b.bundle_key='finance_full_access'
on conflict (bundle_id,capability_key) do nothing;

alter table public.company_branches enable row level security;
alter table public.budget_item_definitions enable row level security;
alter table public.budget_item_schedules enable row level security;
alter table public.budget_rate_versions enable row level security;
alter table public.budget_tariff_bands enable row level security;
alter table public.budget_obligations enable row level security;
alter table public.budget_obligation_estimate_events enable row level security;
alter table public.budget_periods enable row level security;
alter table public.budget_period_reopen_log enable row level security;
alter table public.budget_period_cash_events enable row level security;
alter table public.budget_period_lines enable row level security;
alter table public.budget_line_settlements enable row level security;
alter table public.budget_reserve_movements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['company_branches','budget_item_definitions','budget_item_schedules','budget_rate_versions','budget_tariff_bands','budget_obligations','budget_obligation_estimate_events','budget_periods','budget_period_reopen_log','budget_period_cash_events','budget_period_lines','budget_line_settlements','budget_reserve_movements'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.has_any_capability(''finance.operating_budget.view''))', 'budget_read_'||t, t);
  end loop;
end$$;
create policy budget_edit_branches on public.company_branches for all to authenticated using (public.has_capability('finance.operating_budget.edit','all',null,null)) with check (public.has_capability('finance.operating_budget.edit','all',null,null));
create policy budget_edit_definitions on public.budget_item_definitions for all to authenticated using (public.has_capability('finance.operating_budget.edit','all',null,null)) with check (public.has_capability('finance.operating_budget.edit','all',null,null));
create policy budget_edit_schedules on public.budget_item_schedules for all to authenticated using (public.has_capability('finance.operating_budget.edit','all',null,null)) with check (public.has_capability('finance.operating_budget.edit','all',null,null));
create policy budget_edit_bands on public.budget_tariff_bands for all to authenticated using (public.has_capability('finance.operating_budget.edit','all',null,null)) with check (public.has_capability('finance.operating_budget.edit','all',null,null));

revoke all on public.company_branches,public.budget_item_definitions,public.budget_item_schedules,public.budget_rate_versions,public.budget_tariff_bands,public.budget_obligations,public.budget_obligation_estimate_events,public.budget_periods,public.budget_period_reopen_log,public.budget_period_cash_events,public.budget_period_lines,public.budget_line_settlements,public.budget_reserve_movements from anon;
grant select,insert,update,delete on public.company_branches,public.budget_item_definitions,public.budget_item_schedules,public.budget_tariff_bands to authenticated;
grant select on public.budget_rate_versions,public.budget_obligations,public.budget_obligation_estimate_events,public.budget_periods,public.budget_period_reopen_log,public.budget_period_cash_events,public.budget_period_lines,public.budget_line_settlements,public.budget_reserve_movements to authenticated;
grant all on public.company_branches,public.budget_item_definitions,public.budget_item_schedules,public.budget_rate_versions,public.budget_tariff_bands,public.budget_obligations,public.budget_obligation_estimate_events,public.budget_periods,public.budget_period_reopen_log,public.budget_period_cash_events,public.budget_period_lines,public.budget_line_settlements,public.budget_reserve_movements to service_role;
