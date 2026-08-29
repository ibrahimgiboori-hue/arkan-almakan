-- Financial Clock v1: unify contractor settlement, financial case, treasury payment,
-- and net outstanding without creating a parallel ledger.
-- Canonical grain for contractor financial subjects: project × contractor × bounded settlement period.

create sequence if not exists public.financial_case_no_seq;

create table if not exists public.financial_cases (
  id uuid primary key default gen_random_uuid(),
  case_no text not null unique default (
    'FIN-' || to_char(current_date::timestamptz, 'YYYY') || '-' ||
    lpad(nextval('public.financial_case_no_seq'::regclass)::text, 6, '0')
  ),
  source_type text not null,
  source_ref text not null,
  source_department text not null,
  source_label text not null,
  project_id uuid references public.projects(id) on delete set null,
  counterparty_type text,
  counterparty_id uuid,
  counterparty_name text,
  status text not null default 'submitted'
    check (status in ('submitted','in_review','returned_to_source','on_hold','finance_approved','final_approved','paid','cancelled','closed')),
  current_owner text not null default 'finance'
    check (current_owner in ('source','finance','final_approval','treasury','closed')),
  current_version_no integer not null default 1 check (current_version_no > 0),
  created_by uuid not null,
  finance_reviewer_id uuid,
  finance_reviewed_at timestamptz,
  final_approver_id uuid,
  final_approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_owner_user_id uuid
);

create table if not exists public.financial_case_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.financial_cases(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  source_snapshot jsonb not null default '{}'::jsonb,
  requested_amount numeric not null default 0,
  verified_amount numeric,
  additions_amount numeric not null default 0,
  deductions_amount numeric not null default 0,
  approved_amount numeric,
  source_note text,
  finance_note text,
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  unique(case_id, version_no)
);

create table if not exists public.financial_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.financial_cases(id) on delete cascade,
  version_no integer,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid not null,
  actor_role text,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.financial_case_events
  add column if not exists amount numeric,
  add column if not exists reverses_event_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.financial_case_events'::regclass
      and conname='financial_case_events_reverses_event_id_fkey'
  ) then
    alter table public.financial_case_events
      add constraint financial_case_events_reverses_event_id_fkey
      foreign key (reverses_event_id)
      references public.financial_case_events(id)
      on delete restrict;
  end if;
end
$$;

create index if not exists financial_cases_project_idx
  on public.financial_cases(project_id, updated_at desc);
create index if not exists financial_cases_status_idx
  on public.financial_cases(status, updated_at desc);
create index if not exists financial_cases_counterparty_idx
  on public.financial_cases(counterparty_type, counterparty_id, updated_at desc);
create index if not exists financial_cases_source_owner_idx
  on public.financial_cases(source_owner_user_id, status, updated_at desc);
create index if not exists financial_case_versions_case_idx
  on public.financial_case_versions(case_id, version_no desc);
create index if not exists financial_case_events_case_idx
  on public.financial_case_events(case_id, created_at desc);

alter table public.financial_cases enable row level security;
alter table public.financial_case_versions enable row level security;
alter table public.financial_case_events enable row level security;

drop policy if exists financial_cases_select on public.financial_cases;
create policy financial_cases_select on public.financial_cases
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or source_owner_user_id = (select auth.uid())
    or public.has_capability(
      'finance.cases.view',
      case when project_id is null then 'all' else 'project' end,
      case when project_id is null then null else project_id::text end,
      null
    )
  );

drop policy if exists financial_case_versions_select on public.financial_case_versions;
create policy financial_case_versions_select on public.financial_case_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.financial_cases fc
      where fc.id = financial_case_versions.case_id
        and (
          fc.created_by = (select auth.uid())
          or fc.source_owner_user_id = (select auth.uid())
          or public.has_capability(
            'finance.cases.view',
            case when fc.project_id is null then 'all' else 'project' end,
            case when fc.project_id is null then null else fc.project_id::text end,
            null
          )
        )
    )
  );

drop policy if exists financial_case_events_select on public.financial_case_events;
create policy financial_case_events_select on public.financial_case_events
  for select to authenticated
  using (
    exists (
      select 1 from public.financial_cases fc
      where fc.id = financial_case_events.case_id
        and (
          fc.created_by = (select auth.uid())
          or fc.source_owner_user_id = (select auth.uid())
          or public.has_capability(
            'finance.cases.view',
            case when fc.project_id is null then 'all' else 'project' end,
            case when fc.project_id is null then null else fc.project_id::text end,
            null
          )
        )
    )
  );

revoke all on public.financial_cases, public.financial_case_versions, public.financial_case_events from public, anon;
grant select on public.financial_cases, public.financial_case_versions, public.financial_case_events to authenticated;
grant all on public.financial_cases, public.financial_case_versions, public.financial_case_events to service_role;

-- One bounded settlement owns at most one financial case.
alter table public.contractor_settlements
  add column if not exists case_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contractor_settlements'::regclass
      and conname='contractor_settlements_case_id_fkey'
  ) then
    alter table public.contractor_settlements
      add constraint contractor_settlements_case_id_fkey
      foreign key(case_id)
      references public.financial_cases(id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists contractor_settlements_case_id_uidx
  on public.contractor_settlements(case_id)
  where case_id is not null;

create unique index if not exists financial_cases_contractor_settlement_source_uidx
  on public.financial_cases(source_ref)
  where source_type='contractor_settlement';

-- Treasury payment is the canonical cash fact. Keep the operational payment row linked to it.
alter table public.contractor_payments
  add column if not exists treasury_movement_id uuid,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.contractor_payments'::regclass
      and conname='contractor_payments_treasury_movement_id_fkey'
  ) then
    alter table public.contractor_payments
      add constraint contractor_payments_treasury_movement_id_fkey
      foreign key(treasury_movement_id)
      references public.treasury_movements(id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists contractor_payments_treasury_movement_uidx
  on public.contractor_payments(treasury_movement_id)
  where treasury_movement_id is not null;

create index if not exists contractor_payments_settlement_clock_idx
  on public.contractor_payments(settlement_id, payment_date)
  where voided_at is null;

-- Snapshot helper: the settlement is the amount authority; the source rows remain the raw truth.
create or replace function private.fn_contractor_settlement_snapshot(p_settlement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'settlement_id', s.id,
    'settlement_no', s.settlement_no,
    'project_id', s.project_id,
    'contractor_id', s.contractor_id,
    'period_from', s.period_from,
    'period_to', s.period_to,
    'works_amount', coalesce(s.works_amount,0),
    'reimbursable_amount', coalesce(s.reimbursable_amount,0),
    'charged_amount', coalesce(s.charged_amount,0),
    'advances_amount', coalesce(s.advances_amount,0),
    'penalty_amount', coalesce(s.penalty_amount,0),
    'other_additions', coalesce(s.other_additions,0),
    'net_payable', coalesce(s.net_payable,0),
    'settlement_status', s.status::text,
    'captured_at', now()
  )
  from public.contractor_settlements s
  where s.id=p_settlement_id
$$;

revoke all on function private.fn_contractor_settlement_snapshot(uuid) from public, anon, authenticated;
grant execute on function private.fn_contractor_settlement_snapshot(uuid) to service_role;

-- Final settlements are facts. Descriptive fields remain editable; financial fields require governed reversal/correction.
create or replace function private.fn_guard_final_contractor_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status::text='ceo_approved'
     and current_setting('app.financial_clock_governed_correction', true) is distinct from 'on'
     and (
       old.status is distinct from new.status
       or old.project_id is distinct from new.project_id
       or old.contractor_id is distinct from new.contractor_id
       or old.period_from is distinct from new.period_from
       or old.period_to is distinct from new.period_to
       or old.works_amount is distinct from new.works_amount
       or old.reimbursable_amount is distinct from new.reimbursable_amount
       or old.charged_amount is distinct from new.charged_amount
       or old.advances_amount is distinct from new.advances_amount
       or old.penalty_amount is distinct from new.penalty_amount
       or old.other_additions is distinct from new.other_additions
       or old.net_payable is distinct from new.net_payable
     )
  then
    raise exception 'التسوية معتمدة نهائيًا؛ لا تُعدّل قيمتها بصمت. استخدم مسار العكس/التصحيح المالي المحكوم.';
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_final_contractor_settlement on public.contractor_settlements;
create trigger trg_guard_final_contractor_settlement
before update on public.contractor_settlements
for each row execute function private.fn_guard_final_contractor_settlement();

-- Build/rebuild one settlement case per bounded period. This replaces the cumulative account as a financial subject.
create or replace function public.fn_build_period_settlement(
  p_project_id uuid,
  p_contractor_id uuid,
  p_from date,
  p_to date,
  p_basis text default 'item',
  p_penalty numeric default 0,
  p_other numeric default 0,
  p_settlement_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid := p_settlement_id;
  v_existing public.contractor_settlements;
  v_base numeric := 0;
  v_open_adv numeric := 0;
  v_adv_apply numeric := 0;
  v_left numeric := 0;
  v_take numeric := 0;
  adv record;
  oldded record;
  v_case public.financial_cases;
  v_case_id uuid;
  v_next integer;
  v_snapshot jsonb;
  v_contractor_name text;
  v_source_owner uuid;
  v_net numeric;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select au.role::text into v_role
  from public.app_users au
  where au.id=v_uid and au.is_active=true;
  if v_role is null then raise exception 'حساب المستخدم غير نشط'; end if;

  if not public.has_capability('finance.projects.review','project',p_project_id::text,null) then
    raise exception 'لا تملك صلاحية المراجعة المالية لهذا المشروع.';
  end if;
  if p_from is null or p_to is null or p_to<p_from then
    raise exception 'مدة التسوية غير صحيحة';
  end if;

  if exists(
    select 1
    from public.contractor_settlements s
    where s.project_id=p_project_id
      and s.contractor_id=p_contractor_id
      and s.id is distinct from v_id
      and s.period_from<=p_to
      and s.period_to>=p_from
      and coalesce(s.status::text,'draft') not in('rejected','cancelled')
  ) then
    raise exception 'توجد تسوية أخرى لهذا المقاول تتداخل مع الفترة المطلوبة';
  end if;

  if v_id is not null then
    select * into v_existing
    from public.contractor_settlements
    where id=v_id
    for update;
    if v_existing.id is null then raise exception 'التسوية غير موجودة'; end if;
    if v_existing.project_id is distinct from p_project_id
       or v_existing.contractor_id is distinct from p_contractor_id then
      raise exception 'لا يمكن نقل التسوية إلى مشروع أو مقاول آخر.';
    end if;
    if v_existing.status::text in ('accountant_approved','ceo_approved') then
      raise exception 'التسوية المعتمدة لا يعاد بناؤها مباشرة؛ أعدها للمصدر أو استخدم تصحيحًا محكومًا.';
    end if;
    if v_existing.status::text in ('rejected','cancelled') then
      raise exception 'التسوية الملغاة/المرفوضة لا يعاد استخدامها؛ أنشئ تسوية جديدة.';
    end if;

    update public.contractor_expenses
    set is_settled=false, settlement_id=null
    where settlement_id=v_id;

    for oldded in
      select advance_id,sum(amount) amount
      from public.contractor_advance_deductions
      where settlement_id=v_id
      group by advance_id
    loop
      update public.contractor_advances
      set deducted=greatest(coalesce(deducted,0)-oldded.amount,0),
          is_closed=false
      where id=oldded.advance_id;
    end loop;
    delete from public.contractor_advance_deductions where settlement_id=v_id;
  end if;

  select * into r
  from public.fn_settlement_preview(p_project_id,p_contractor_id,p_from,p_to,p_basis);

  v_base:=coalesce(r.works_amount,0)
        + coalesce(r.reimbursable_amount,0)
        - coalesce(r.charged_amount,0)
        - coalesce(p_penalty,0)
        + coalesce(p_other,0);

  select coalesce(sum(remaining),0) into v_open_adv
  from public.contractor_advances
  where project_id=p_project_id
    and contractor_id=p_contractor_id
    and coalesce(is_closed,false)=false
    and advance_date<=p_to;

  v_adv_apply:=least(v_open_adv,greatest(v_base,0));
  v_net:=v_base-v_adv_apply;

  if v_id is null then
    insert into public.contractor_settlements(
      settlement_no,project_id,contractor_id,period_from,period_to,
      works_amount,reimbursable_amount,charged_amount,advances_amount,
      penalty_amount,other_additions,net_payable,status,created_by
    )
    values(
      public.fn_next_settlement_no(),p_project_id,p_contractor_id,p_from,p_to,
      r.works_amount,r.reimbursable_amount,r.charged_amount,v_adv_apply,
      coalesce(p_penalty,0),coalesce(p_other,0),v_net,'draft',v_uid
    )
    returning id into v_id;
  else
    update public.contractor_settlements
    set period_from=p_from,
        period_to=p_to,
        works_amount=r.works_amount,
        reimbursable_amount=r.reimbursable_amount,
        charged_amount=r.charged_amount,
        advances_amount=v_adv_apply,
        penalty_amount=coalesce(p_penalty,0),
        other_additions=coalesce(p_other,0),
        net_payable=v_net,
        status='draft'
    where id=v_id;
  end if;

  update public.contractor_expenses ce
  set is_settled=true,
      settlement_id=v_id
  where ce.project_id=p_project_id
    and ce.contractor_id=p_contractor_id
    and ce.expense_date between p_from and p_to
    and coalesce(ce.is_settled,false)=false
    and (
      (ce.payer::text='contractor' and ce.charge_to::text in ('owner','arkan'))
      or
      (ce.payer::text in ('arkan_custody','arkan_direct') and ce.charge_to::text='contractor')
    );

  v_left:=v_adv_apply;
  for adv in
    select id,remaining
    from public.contractor_advances
    where project_id=p_project_id
      and contractor_id=p_contractor_id
      and coalesce(is_closed,false)=false
      and advance_date<=p_to
      and remaining>0
    order by advance_date,id
  loop
    exit when v_left<=0;
    v_take:=least(v_left,adv.remaining);
    insert into public.contractor_advance_deductions(settlement_id,advance_id,amount)
    values(v_id,adv.id,v_take);
    update public.contractor_advances
    set deducted=coalesce(deducted,0)+v_take,
        is_closed=(amount-(coalesce(deducted,0)+v_take)<=0)
    where id=adv.id;
    v_left:=v_left-v_take;
  end loop;

  select name_ar into v_contractor_name
  from public.contractors
  where id=p_contractor_id;

  select au.id into v_source_owner
  from public.projects p
  join public.app_users au
    on au.employee_id=p.supervisor_id and au.is_active=true
  where p.id=p_project_id
  order by au.created_at
  limit 1;

  select case_id into v_case_id
  from public.contractor_settlements
  where id=v_id;

  v_snapshot:=private.fn_contractor_settlement_snapshot(v_id);

  if v_case_id is null then
    insert into public.financial_cases(
      source_type,source_ref,source_department,source_label,
      project_id,counterparty_type,counterparty_id,counterparty_name,
      status,current_owner,current_version_no,created_by,source_owner_user_id
    )
    values(
      'contractor_settlement','contractor_settlement:'||v_id::text,
      'projects','تسوية مستحقات مقاول',
      p_project_id,'contractor',p_contractor_id,coalesce(v_contractor_name,'مقاول'),
      'in_review','finance',1,v_uid,v_source_owner
    )
    returning id into v_case_id;

    insert into public.financial_case_versions(
      case_id,version_no,source_snapshot,requested_amount,submitted_by,source_note
    )
    values(
      v_case_id,1,v_snapshot,v_net,v_uid,
      'لقطة من تسوية محددة الفترة؛ التسوية هي سلطة مبلغ الاستحقاق.'
    );

    update public.contractor_settlements
    set case_id=v_case_id
    where id=v_id;

    insert into public.financial_case_events(
      case_id,version_no,event_type,from_status,to_status,
      actor_user_id,actor_role,note,payload,amount
    )
    values(
      v_case_id,1,'settlement_opened',null,'in_review',
      v_uid,v_role,'فتح الساعة المالية من تسوية المقاول',
      jsonb_build_object('settlement_id',v_id,'period_from',p_from,'period_to',p_to),
      v_net
    );
  else
    select * into v_case
    from public.financial_cases
    where id=v_case_id
    for update;

    if v_case.id is null or v_case.source_type<>'contractor_settlement' then
      raise exception 'ربط الساعة المالية لهذه التسوية غير صالح.';
    end if;
    if v_case.status in ('finance_approved','final_approved','paid','closed','cancelled') then
      raise exception 'المعاملة المالية تجاوزت مرحلة التصحيح المباشر.';
    end if;

    v_next:=v_case.current_version_no+1;
    insert into public.financial_case_versions(
      case_id,version_no,source_snapshot,requested_amount,submitted_by,source_note
    )
    values(
      v_case_id,v_next,v_snapshot,v_net,v_uid,
      'إعادة احتساب تسوية قبل الاعتماد النهائي.'
    );

    update public.financial_cases
    set current_version_no=v_next,
        status='in_review',
        current_owner='finance',
        updated_at=now()
    where id=v_case_id;

    insert into public.financial_case_events(
      case_id,version_no,event_type,from_status,to_status,
      actor_user_id,actor_role,note,payload,amount
    )
    values(
      v_case_id,v_next,'settlement_recalculated',v_case.status,'in_review',
      v_uid,v_role,'إعادة احتساب التسوية قبل الاعتماد',
      jsonb_build_object('settlement_id',v_id,'period_from',p_from,'period_to',p_to),
      v_net
    );
  end if;

  return v_id;
end
$$;

revoke execute on function public.fn_build_period_settlement(uuid,uuid,date,date,text,numeric,numeric,uuid) from public, anon;
grant execute on function public.fn_build_period_settlement(uuid,uuid,date,date,text,numeric,numeric,uuid) to authenticated;

create or replace function public.fn_open_contractor_financial_case(
  p_project_id uuid,
  p_contractor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  raise exception 'تم إيقاف فتح معاملة مالية من الحساب التراكمي. أنشئ تسوية محددة الفترة؛ الحساب التراكمي مخصص للمراقبة فقط.';
end
$$;

revoke execute on function public.fn_open_contractor_financial_case(uuid,uuid) from public, anon;
grant execute on function public.fn_open_contractor_financial_case(uuid,uuid) to authenticated;

create or replace function public.fn_refresh_contractor_financial_case(
  p_case_id uuid,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_case public.financial_cases;
  v_settlement public.contractor_settlements;
  v_next integer;
  v_snapshot jsonb;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select au.role::text into v_role
  from public.app_users au
  where au.id=v_uid and au.is_active=true;
  if v_role is null then raise exception 'حساب المستخدم غير نشط'; end if;

  select * into v_case
  from public.financial_cases
  where id=p_case_id
  for update;
  if v_case.id is null then raise exception 'المعاملة المالية غير موجودة'; end if;
  if v_case.source_type<>'contractor_settlement' then
    raise exception 'المسار التراكمي القديم متوقف؛ أعد بناء تسوية محددة الفترة.';
  end if;
  if v_case.status<>'returned_to_source' then
    raise exception 'يجب أن تكون المعاملة معادة للمصدر قبل إعادة الإرسال';
  end if;

  select * into v_settlement
  from public.contractor_settlements
  where case_id=p_case_id
  for update;
  if v_settlement.id is null then raise exception 'التسوية المرتبطة غير موجودة'; end if;

  v_next:=v_case.current_version_no+1;
  v_snapshot:=private.fn_contractor_settlement_snapshot(v_settlement.id);

  insert into public.financial_case_versions(
    case_id,version_no,source_snapshot,requested_amount,submitted_by,source_note
  )
  values(
    p_case_id,v_next,v_snapshot,coalesce(v_settlement.net_payable,0),v_uid,p_note
  );

  update public.financial_cases
  set current_version_no=v_next,
      status='in_review',
      current_owner='finance',
      updated_at=now()
  where id=p_case_id;

  update public.contractor_settlements
  set status='draft'
  where id=v_settlement.id;

  insert into public.financial_case_events(
    case_id,version_no,event_type,from_status,to_status,
    actor_user_id,actor_role,note,payload,amount
  )
  values(
    p_case_id,v_next,'source_refreshed','returned_to_source','in_review',
    v_uid,v_role,p_note,jsonb_build_object('settlement_id',v_settlement.id),
    coalesce(v_settlement.net_payable,0)
  );

  return v_next;
end
$$;

revoke execute on function public.fn_refresh_contractor_financial_case(uuid,text) from public, anon;
grant execute on function public.fn_refresh_contractor_financial_case(uuid,text) to authenticated;

create or replace function public.fn_financial_case_action(
  p_case_id uuid,
  p_action text,
  p_note text default null,
  p_verified_amount numeric default null,
  p_additions_amount numeric default 0,
  p_deductions_amount numeric default 0
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_case public.financial_cases;
  v_ver public.financial_case_versions;
  v_settlement public.contractor_settlements;
  v_is_settlement boolean:=false;
  v_from text;
  v_to text;
  v_event text;
  v_scope_type text;
  v_scope_key text;
  v_amount numeric;
  v_cap text;
  oldded record;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select au.role::text into v_role
  from public.app_users au
  where au.id=v_uid and au.is_active=true;
  if v_role is null then raise exception 'حساب المستخدم غير نشط'; end if;

  select * into v_case
  from public.financial_cases
  where id=p_case_id
  for update;
  if not found then raise exception 'المعاملة المالية غير موجودة'; end if;

  select * into v_ver
  from public.financial_case_versions
  where case_id=p_case_id
    and version_no=v_case.current_version_no;

  if v_case.source_type='contractor_settlement' then
    select * into v_settlement
    from public.contractor_settlements
    where case_id=p_case_id
    for update;
    if v_settlement.id is null then raise exception 'التسوية المرتبطة غير موجودة'; end if;
    v_is_settlement:=true;
    v_amount:=greatest(0,coalesce(v_settlement.net_payable,0));

    if p_action in ('save_review','finance_approve')
       and (
         (p_verified_amount is not null and p_verified_amount is distinct from v_amount)
         or coalesce(p_additions_amount,0)<>0
         or coalesce(p_deductions_amount,0)<>0
       ) then
      raise exception 'قيمة حالة المقاول تأتي من التسوية نفسها. صحح التسوية بدل إنشاء مبلغ موازٍ داخل المعاملة المالية.';
    end if;
  else
    v_amount:=greatest(
      0,
      coalesce(p_verified_amount,v_ver.verified_amount,v_ver.requested_amount,0)
      + coalesce(p_additions_amount,0)
      - coalesce(p_deductions_amount,0)
    );
  end if;

  v_from:=v_case.status;
  v_scope_type:=case when v_case.project_id is null then 'all' else 'project' end;
  v_scope_key:=v_case.project_id::text;
  v_cap:=case p_action
    when 'save_review' then 'finance.cases.review'
    when 'hold' then 'finance.cases.hold'
    when 'resume' then 'finance.cases.release'
    when 'return_to_source' then 'finance.cases.return'
    when 'finance_approve' then 'finance.cases.approve'
    when 'final_approve' then 'finance.cases.final_approve'
    when 'cancel' then 'finance.cases.reject'
    else null
  end;

  if v_cap is null then raise exception 'إجراء مالي غير مدعوم'; end if;
  if not public.has_capability(v_cap,v_scope_type,v_scope_key,v_amount) then
    raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء أو أن المبلغ يتجاوز حد صلاحيتك';
  end if;

  if p_action='save_review' then
    if v_from not in ('in_review','submitted','on_hold') then
      raise exception 'المعاملة ليست في مرحلة مراجعة';
    end if;
    update public.financial_case_versions
    set verified_amount=case when v_is_settlement then v_amount else coalesce(p_verified_amount,requested_amount) end,
        additions_amount=case when v_is_settlement then 0 else coalesce(p_additions_amount,0) end,
        deductions_amount=case when v_is_settlement then 0 else coalesce(p_deductions_amount,0) end,
        finance_note=p_note,
        reviewed_by=v_uid,
        reviewed_at=now()
    where case_id=p_case_id and version_no=v_case.current_version_no;
    update public.financial_cases set updated_at=now() where id=p_case_id;
    v_to:=v_from;
    v_event:='review_saved';

  elsif p_action='hold' then
    if v_from not in ('in_review','submitted') then
      raise exception 'لا يمكن تعليق المعاملة من حالتها الحالية';
    end if;
    if nullif(btrim(coalesce(p_note,'')),'') is null then
      raise exception 'سبب التعليق مطلوب';
    end if;
    update public.financial_cases
    set status='on_hold',current_owner='finance',updated_at=now()
    where id=p_case_id;
    v_to:='on_hold'; v_event:='held';

  elsif p_action='resume' then
    if v_from<>'on_hold' then raise exception 'المعاملات المعلقة فقط يمكن استئنافها'; end if;
    update public.financial_cases
    set status='in_review',current_owner='finance',updated_at=now()
    where id=p_case_id;
    v_to:='in_review'; v_event:='resumed';

  elsif p_action='return_to_source' then
    if v_from not in ('in_review','on_hold','submitted','finance_approved') then
      raise exception 'لا يمكن إرجاع المعاملة من حالتها الحالية';
    end if;
    if nullif(btrim(coalesce(p_note,'')),'') is null then
      raise exception 'سبب الإرجاع مطلوب';
    end if;
    update public.financial_cases
    set status='returned_to_source',current_owner='source',updated_at=now()
    where id=p_case_id;
    if v_is_settlement then
      update public.contractor_settlements set status='draft' where id=v_settlement.id;
    end if;
    v_to:='returned_to_source'; v_event:='returned_to_source';

    if v_case.source_owner_user_id is not null and v_case.source_owner_user_id<>v_uid then
      insert into public.notifications(user_id,title,body,link,severity,is_read)
      values(
        v_case.source_owner_user_id,
        'طلب تصحيح من المالية',
        v_case.case_no||' · '||coalesce(v_case.counterparty_name,v_case.source_label)||' · '||p_note,
        '/dashboard/finance/cases/'||p_case_id::text,
        'warning',
        false
      );
    end if;

  elsif p_action='finance_approve' then
    if v_from not in ('in_review','submitted') then
      raise exception 'المعاملة ليست جاهزة للاعتماد المالي';
    end if;
    update public.financial_case_versions
    set verified_amount=case when v_is_settlement then v_amount else coalesce(p_verified_amount,requested_amount) end,
        additions_amount=case when v_is_settlement then 0 else coalesce(p_additions_amount,0) end,
        deductions_amount=case when v_is_settlement then 0 else coalesce(p_deductions_amount,0) end,
        approved_amount=v_amount,
        finance_note=p_note,
        reviewed_by=v_uid,
        reviewed_at=now()
    where case_id=p_case_id and version_no=v_case.current_version_no;

    update public.financial_cases
    set status='finance_approved',
        current_owner='final_approval',
        finance_reviewer_id=v_uid,
        finance_reviewed_at=now(),
        updated_at=now()
    where id=p_case_id;

    if v_is_settlement then
      update public.contractor_settlements
      set status='accountant_approved'
      where id=v_settlement.id;
    end if;
    v_to:='finance_approved'; v_event:='finance_approved';

  elsif p_action='final_approve' then
    if v_from<>'finance_approved' then raise exception 'يلزم الاعتماد المالي أولًا'; end if;

    update public.financial_cases
    set status='final_approved',
        current_owner='treasury',
        final_approver_id=v_uid,
        final_approved_at=now(),
        updated_at=now()
    where id=p_case_id;

    if v_is_settlement then
      update public.contractor_settlements
      set status='ceo_approved'
      where id=v_settlement.id;
    end if;
    v_to:='final_approved'; v_event:='final_approved';

  elsif p_action='cancel' then
    if v_from in ('paid','closed','cancelled') then raise exception 'المعاملة مغلقة بالفعل'; end if;
    if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'سبب الإلغاء مطلوب'; end if;
    if v_is_settlement and v_from='final_approved' then
      raise exception 'التسوية معتمدة نهائيًا؛ استخدم عكس التسوية المحكوم بدل الإلغاء المباشر.';
    end if;

    if v_is_settlement then
      update public.contractor_expenses
      set is_settled=false,settlement_id=null
      where settlement_id=v_settlement.id;

      for oldded in
        select advance_id,sum(amount) amount
        from public.contractor_advance_deductions
        where settlement_id=v_settlement.id
        group by advance_id
      loop
        update public.contractor_advances
        set deducted=greatest(coalesce(deducted,0)-oldded.amount,0),
            is_closed=false
        where id=oldded.advance_id;
      end loop;
      delete from public.contractor_advance_deductions where settlement_id=v_settlement.id;

      update public.contractor_settlements
      set status='cancelled'
      where id=v_settlement.id;
    end if;

    update public.financial_cases
    set status='cancelled',current_owner='closed',closed_at=now(),updated_at=now()
    where id=p_case_id;
    v_to:='cancelled'; v_event:='cancelled';
  end if;

  insert into public.financial_case_events(
    case_id,version_no,event_type,from_status,to_status,
    actor_user_id,actor_role,note,payload,amount
  )
  values(
    p_case_id,v_case.current_version_no,v_event,v_from,v_to,
    v_uid,v_role,p_note,
    jsonb_build_object(
      'verified_amount',case when v_is_settlement then v_amount else p_verified_amount end,
      'additions_amount',case when v_is_settlement then 0 else coalesce(p_additions_amount,0) end,
      'deductions_amount',case when v_is_settlement then 0 else coalesce(p_deductions_amount,0) end,
      'capability',v_cap,
      'settlement_id',case when v_is_settlement then v_settlement.id else null end
    ),
    case when v_event in ('finance_approved','final_approved') then v_amount else null end
  );

  return v_to;
end
$$;

revoke execute on function public.fn_financial_case_action(uuid,text,text,numeric,numeric,numeric) from public, anon;
grant execute on function public.fn_financial_case_action(uuid,text,text,numeric,numeric,numeric) to authenticated;

create or replace function public.fn_financial_case_pay_from_treasury(
  p_case_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_date date default current_date,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_case public.financial_cases;
  v_settlement public.contractor_settlements;
  v_acc public.treasury_accounts;
  v_bal numeric;
  v_total numeric;
  v_paid numeric;
  v_outstanding numeric;
  v_amount numeric;
  v_movement uuid;
  v_payment uuid;
  v_source public.payment_source;
  v_scope_type text;
  v_scope_key text;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select au.role::text into v_role
  from public.app_users au
  where au.id=v_uid and au.is_active=true;

  select * into v_case
  from public.financial_cases
  where id=p_case_id
  for update;
  if v_case.id is null then raise exception 'المعاملة المالية غير موجودة'; end if;
  if v_case.source_type<>'contractor_settlement' then
    raise exception 'الصرف التراكمي القديم متوقف؛ الصرف يتم من تسوية محددة الفترة.';
  end if;
  if v_case.status<>'final_approved' then
    raise exception 'المعاملة تحتاج اعتمادًا نهائيًا قبل الصرف';
  end if;

  select * into v_settlement
  from public.contractor_settlements
  where case_id=p_case_id
  for update;
  if v_settlement.id is null then raise exception 'التسوية المرتبطة غير موجودة'; end if;
  if v_settlement.status::text<>'ceo_approved' then raise exception 'التسوية ليست معتمدة نهائيًا'; end if;

  v_total:=greatest(0,coalesce(v_settlement.net_payable,0));
  select coalesce(sum(cp.amount),0) into v_paid
  from public.contractor_payments cp
  join public.treasury_movements tm on tm.id=cp.treasury_movement_id
  where cp.settlement_id=v_settlement.id
    and cp.voided_at is null
    and tm.status='posted';

  v_outstanding:=greatest(v_total-v_paid,0);
  v_amount:=coalesce(p_amount,v_outstanding);
  if v_amount<=0 then raise exception 'لا يوجد مبلغ صالح للصرف'; end if;
  if v_amount>v_outstanding then
    raise exception 'مبلغ الصرف % يتجاوز المتبقي %',v_amount,v_outstanding;
  end if;

  v_scope_type:=case when v_case.project_id is null then 'all' else 'project' end;
  v_scope_key:=v_case.project_id::text;
  if not public.has_capability('finance.treasury.pay',v_scope_type,v_scope_key,v_amount) then
    raise exception 'لا تملك صلاحية صرف هذه المعاملة';
  end if;

  select * into v_acc
  from public.treasury_accounts
  where id=p_account_id and is_active=true
  for update;
  if v_acc.id is null then raise exception 'حساب الخزينة غير موجود أو غير نشط'; end if;

  v_bal:=coalesce(public.fn_treasury_current_balance(p_account_id),0);
  if not v_acc.allow_negative and v_bal<v_amount then
    raise exception 'رصيد الحساب لا يكفي للصرف';
  end if;

  v_source:=case when v_acc.account_type='cash'
    then 'cash'::public.payment_source
    else 'bank'::public.payment_source
  end;

  insert into public.treasury_movements(
    account_id,movement_date,direction,amount,movement_type,
    source_type,source_id,source_ref,project_id,
    counterparty_type,counterparty_name,reference,notes,recorded_by
  )
  values(
    p_account_id,coalesce(p_payment_date,current_date),'outflow',v_amount,
    'financial_case_payment','financial_case',p_case_id,v_case.case_no,v_case.project_id,
    v_case.counterparty_type,v_case.counterparty_name,
    nullif(trim(p_reference),''),nullif(trim(p_note),''),v_uid
  )
  returning id into v_movement;

  insert into public.contractor_payments(
    contractor_id,project_id,settlement_id,treasury_movement_id,
    payment_date,amount,kind,source,reference,notes,created_by
  )
  values(
    v_settlement.contractor_id,v_settlement.project_id,v_settlement.id,v_movement,
    coalesce(p_payment_date,current_date),v_amount,
    'settlement'::public.contractor_payment_kind,v_source,
    nullif(trim(p_reference),''),nullif(trim(p_note),''),v_uid
  )
  returning id into v_payment;

  insert into public.financial_case_events(
    case_id,version_no,event_type,from_status,to_status,
    actor_user_id,actor_role,note,payload,amount
  )
  values(
    p_case_id,v_case.current_version_no,'payment_recorded','final_approved',
    case when v_amount=v_outstanding then 'paid' else 'final_approved' end,
    v_uid,coalesce(v_role,'capability'),p_note,
    jsonb_build_object(
      'settlement_id',v_settlement.id,
      'contractor_payment_id',v_payment,
      'treasury_movement_id',v_movement,
      'reference',p_reference
    ),
    v_amount
  );

  if v_amount=v_outstanding then
    update public.financial_cases
    set status='paid',current_owner='closed',closed_at=now(),updated_at=now()
    where id=p_case_id;

    update public.contractor_settlements
    set paid_at=coalesce(p_payment_date,current_date),
        payment_ref=nullif(trim(p_reference),'')
    where id=v_settlement.id;
  else
    update public.financial_cases
    set status='final_approved',current_owner='treasury',updated_at=now()
    where id=p_case_id;
  end if;

  return v_movement;
end
$$;

revoke execute on function public.fn_financial_case_pay_from_treasury(uuid,uuid,numeric,date,text,text) from public, anon;
grant execute on function public.fn_financial_case_pay_from_treasury(uuid,uuid,numeric,date,text,text) to authenticated;

create or replace function public.fn_financial_case_pay_from_treasury(
  p_case_id uuid,
  p_account_id uuid,
  p_payment_date date default current_date,
  p_reference text default null,
  p_note text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.fn_financial_case_pay_from_treasury(
    p_case_id,p_account_id,null::numeric,p_payment_date,p_reference,p_note
  )
$$;

revoke execute on function public.fn_financial_case_pay_from_treasury(uuid,uuid,date,text,text) from public, anon;
grant execute on function public.fn_financial_case_pay_from_treasury(uuid,uuid,date,text,text) to authenticated;

create or replace function public.fn_reverse_contractor_settlement(
  p_settlement_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_settlement public.contractor_settlements;
  v_case public.financial_cases;
  oldded record;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'سبب العكس مطلوب'; end if;

  select * into v_settlement
  from public.contractor_settlements
  where id=p_settlement_id
  for update;
  if v_settlement.id is null then raise exception 'التسوية غير موجودة'; end if;

  v_amount:=coalesce(v_settlement.net_payable,0);
  if not public.has_capability('finance.cases.reject','project',v_settlement.project_id::text,v_amount) then
    raise exception 'لا تملك صلاحية عكس هذه التسوية';
  end if;
  if v_settlement.status::text<>'ceo_approved' then
    raise exception 'العكس المحكوم مخصص للتسوية المعتمدة نهائيًا.';
  end if;

  if exists(
    select 1
    from public.contractor_payments cp
    join public.treasury_movements tm on tm.id=cp.treasury_movement_id
    where cp.settlement_id=p_settlement_id
      and cp.voided_at is null
      and tm.status='posted'
  ) then
    raise exception 'اعكس دفعات الخزينة المرتبطة أولًا، ثم اعكس التسوية.';
  end if;

  perform set_config('app.financial_clock_governed_correction','on',true);

  update public.contractor_expenses
  set is_settled=false,settlement_id=null
  where settlement_id=p_settlement_id;

  for oldded in
    select advance_id,sum(amount) amount
    from public.contractor_advance_deductions
    where settlement_id=p_settlement_id
    group by advance_id
  loop
    update public.contractor_advances
    set deducted=greatest(coalesce(deducted,0)-oldded.amount,0),
        is_closed=false
    where id=oldded.advance_id;
  end loop;
  delete from public.contractor_advance_deductions where settlement_id=p_settlement_id;

  update public.contractor_settlements
  set status='cancelled'
  where id=p_settlement_id;

  if v_settlement.case_id is not null then
    select * into v_case from public.financial_cases where id=v_settlement.case_id for update;
    update public.financial_cases
    set status='cancelled',current_owner='closed',closed_at=now(),updated_at=now()
    where id=v_settlement.case_id;

    select au.role::text into v_role
    from public.app_users au
    where au.id=v_uid and au.is_active=true;

    insert into public.financial_case_events(
      case_id,version_no,event_type,from_status,to_status,
      actor_user_id,actor_role,note,payload,amount
    )
    values(
      v_settlement.case_id,v_case.current_version_no,'settlement_reversed',
      v_case.status,'cancelled',v_uid,v_role,p_reason,
      jsonb_build_object('settlement_id',p_settlement_id),
      -v_amount
    );
  end if;

  return true;
end
$$;

revoke execute on function public.fn_reverse_contractor_settlement(uuid,text) from public, anon;
grant execute on function public.fn_reverse_contractor_settlement(uuid,text) to authenticated;

create or replace function public.fn_treasury_void_movement(
  p_movement_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_movement public.treasury_movements;
  v_payment public.contractor_payments;
  v_settlement public.contractor_settlements;
  v_case public.financial_cases;
  v_reversed_event bigint;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'سبب الإلغاء مطلوب'; end if;

  select * into v_movement
  from public.treasury_movements
  where id=p_movement_id and status='posted'
  for update;
  if v_movement.id is null then raise exception 'الحركة غير موجودة أو ملغاة سابقًا'; end if;

  if not public.has_capability('finance.treasury.reverse','all',null,v_movement.amount) then
    raise exception 'لا تملك صلاحية عكس هذه الحركة';
  end if;

  update public.treasury_movements
  set status='void',voided_by=v_uid,voided_at=now(),void_reason=trim(p_reason)
  where id=p_movement_id and status='posted';
  if not found then raise exception 'الحركة غير موجودة أو ملغاة سابقًا'; end if;

  select * into v_payment
  from public.contractor_payments
  where treasury_movement_id=p_movement_id
  for update;

  if v_payment.id is not null then
    update public.contractor_payments
    set voided_at=now(),voided_by=v_uid,void_reason=trim(p_reason)
    where id=v_payment.id;

    if v_payment.settlement_id is not null then
      select * into v_settlement
      from public.contractor_settlements
      where id=v_payment.settlement_id
      for update;

      if v_settlement.id is not null and v_settlement.case_id is not null then
        select * into v_case
        from public.financial_cases
        where id=v_settlement.case_id
        for update;

        if v_case.id is not null then
          if v_case.status='paid' then
            update public.financial_cases
            set status='final_approved',
                current_owner='treasury',
                closed_at=null,
                updated_at=now()
            where id=v_case.id;
          end if;

          update public.contractor_settlements
          set paid_at=null,payment_ref=null
          where id=v_settlement.id;

          select e.id into v_reversed_event
          from public.financial_case_events e
          where e.case_id=v_case.id
            and e.event_type='payment_recorded'
            and e.payload->>'treasury_movement_id'=p_movement_id::text
          order by e.id desc
          limit 1;

          select au.role::text into v_role
          from public.app_users au
          where au.id=v_uid and au.is_active=true;

          insert into public.financial_case_events(
            case_id,version_no,event_type,from_status,to_status,
            actor_user_id,actor_role,note,payload,amount,reverses_event_id
          )
          values(
            v_case.id,v_case.current_version_no,'payment_reversed',
            v_case.status,'final_approved',v_uid,v_role,p_reason,
            jsonb_build_object(
              'settlement_id',v_settlement.id,
              'contractor_payment_id',v_payment.id,
              'treasury_movement_id',p_movement_id
            ),
            -v_payment.amount,
            v_reversed_event
          );
        end if;
      end if;
    end if;
  end if;

  return true;
end
$$;

revoke execute on function public.fn_treasury_void_movement(uuid,text) from public, anon;
grant execute on function public.fn_treasury_void_movement(uuid,text) to authenticated;

create or replace view public.v_contractor_settlement_clock
with (security_invoker=true)
as
select
  s.id as settlement_id,
  s.case_id,
  s.settlement_no,
  s.project_id,
  s.contractor_id,
  s.period_from,
  s.period_to,
  s.status::text as settlement_status,
  coalesce(s.works_amount,0) + coalesce(s.reimbursable_amount,0) as gross_earned,
  coalesce(s.other_additions,0)
    - coalesce(s.charged_amount,0)
    - coalesce(s.advances_amount,0)
    - coalesce(s.penalty_amount,0) as approved_adjustments,
  coalesce(s.net_payable,0) as settled_amount,
  coalesce(pay.paid_amount,0) as paid_amount,
  greatest(coalesce(s.net_payable,0)-coalesce(pay.paid_amount,0),0) as net_outstanding,
  s.paid_at,
  s.payment_ref
from public.contractor_settlements s
left join lateral (
  select coalesce(sum(cp.amount),0) as paid_amount
  from public.contractor_payments cp
  join public.treasury_movements tm on tm.id=cp.treasury_movement_id
  where cp.settlement_id=s.id
    and cp.voided_at is null
    and tm.status='posted'
) pay on true
where s.status::text not in ('rejected','cancelled');

revoke all on public.v_contractor_settlement_clock from public, anon;
grant select on public.v_contractor_settlement_clock to authenticated, service_role;

create or replace view public.v_financial_case_clock
with (security_invoker=true)
as
select
  fc.id as case_id,
  fc.case_no,
  fc.source_type,
  fc.source_ref,
  fc.project_id,
  fc.counterparty_type,
  fc.counterparty_id,
  fc.counterparty_name,
  fc.status,
  fc.current_owner,
  fc.current_version_no,
  case
    when fc.source_type='contractor_settlement' then coalesce(sc.gross_earned,0)
    else coalesce(v.requested_amount,0)
  end as earned_amount,
  case
    when fc.status in ('final_approved','paid','closed') then
      case
        when fc.source_type='contractor_settlement' then coalesce(sc.settled_amount,0)
        else coalesce(v.approved_amount,0)
      end
    else 0
  end as actual_amount,
  coalesce(pay.paid_amount,0) as paid_amount,
  greatest(
    case
      when fc.status in ('final_approved','paid','closed') then
        case
          when fc.source_type='contractor_settlement' then coalesce(sc.settled_amount,0)
          else coalesce(v.approved_amount,0)
        end
      else 0
    end - coalesce(pay.paid_amount,0),
    0
  ) as net_outstanding,
  sc.settlement_id,
  sc.period_from,
  sc.period_to,
  fc.created_at,
  fc.updated_at
from public.financial_cases fc
left join public.financial_case_versions v
  on v.case_id=fc.id and v.version_no=fc.current_version_no
left join public.v_contractor_settlement_clock sc
  on sc.case_id=fc.id
left join lateral (
  select coalesce(sum(tm.amount),0) as paid_amount
  from public.treasury_movements tm
  where tm.source_type='financial_case'
    and tm.source_id=fc.id
    and tm.direction='outflow'
    and tm.status='posted'
) pay on true;

revoke all on public.v_financial_case_clock from public, anon;
grant select on public.v_financial_case_clock to authenticated, service_role;

create or replace view public.v_contractor_project_account
with (security_invoker=true)
as
with keys as (
  select distinct project_id,contractor_id from public.v_day_contractor_value
  union
  select distinct project_id,contractor_id from public.v_contractor_expense_split
  union
  select distinct project_id,contractor_id from public.contractor_advances
  union
  select distinct project_id,contractor_id from public.contractor_settlements
  union
  select distinct project_id,contractor_id from public.contractor_payments
),
raw_works as (
  select
    d.project_id,
    d.contractor_id,
    count(*)::integer as days_worked,
    coalesce(sum(d.daywork_value),0) as daywork_value,
    coalesce(sum(d.piecework_value),0) as piecework_value,
    coalesce(sum(d.by_item_value),0) as by_item_value
  from public.v_day_contractor_value d
  where not exists (
    select 1
    from public.contractor_settlements s
    where s.project_id=d.project_id
      and s.contractor_id=d.contractor_id
      and s.status::text not in ('rejected','cancelled')
      and d.work_date between s.period_from and s.period_to
  )
  group by d.project_id,d.contractor_id
),
raw_exp as (
  select
    e.project_id,
    e.contractor_id,
    coalesce(sum(e.reimbursable),0) as reimbursable_amount,
    coalesce(sum(e.charged),0) as charged_amount
  from public.v_contractor_expense_split e
  where not exists (
    select 1
    from public.contractor_settlements s
    where s.project_id=e.project_id
      and s.contractor_id=e.contractor_id
      and s.status::text not in ('rejected','cancelled')
      and e.expense_date between s.period_from and s.period_to
  )
  group by e.project_id,e.contractor_id
),
adv as (
  select
    project_id,contractor_id,
    coalesce(sum(remaining),0) as advances_amount
  from public.contractor_advances
  where coalesce(is_closed,false)=false
  group by project_id,contractor_id
),
settled as (
  select
    s.project_id,s.contractor_id,
    coalesce(sum(sc.paid_amount),0) as paid_amount,
    coalesce(sum(sc.net_outstanding),0) as settlement_outstanding
  from public.contractor_settlements s
  join public.v_contractor_settlement_clock sc on sc.settlement_id=s.id
  group by s.project_id,s.contractor_id
),
legacy_pay as (
  select
    cp.project_id,cp.contractor_id,
    coalesce(sum(cp.amount),0) as paid_amount
  from public.contractor_payments cp
  where cp.settlement_id is null
    and cp.voided_at is null
  group by cp.project_id,cp.contractor_id
)
select
  k.project_id,
  k.contractor_id,
  coalesce(w.days_worked,0) as days_worked,
  coalesce(w.daywork_value,0) as works_amount,
  coalesce(w.by_item_value,0) as by_item_value,
  coalesce(w.piecework_value,0) as piecework_value,
  coalesce(w.by_item_value,0)-coalesce(w.daywork_value,0) as headroom,
  coalesce(e.reimbursable_amount,0) as reimbursable_amount,
  coalesce(e.charged_amount,0) as charged_amount,
  coalesce(a.advances_amount,0) as advances_amount,
  coalesce(s.paid_amount,0)+coalesce(lp.paid_amount,0) as paid_amount,
  greatest(
    coalesce(w.daywork_value,0)
    + coalesce(e.reimbursable_amount,0)
    - coalesce(e.charged_amount,0)
    - coalesce(a.advances_amount,0)
    - coalesce(lp.paid_amount,0)
    + coalesce(s.settlement_outstanding,0),
    0
  ) as balance_due,
  coalesce(s.settlement_outstanding,0) as settled_outstanding_amount,
  greatest(
    coalesce(w.daywork_value,0)
    + coalesce(e.reimbursable_amount,0)
    - coalesce(e.charged_amount,0)
    - coalesce(a.advances_amount,0)
    - coalesce(lp.paid_amount,0),
    0
  ) as unsettled_source_amount
from keys k
left join raw_works w on w.project_id=k.project_id and w.contractor_id=k.contractor_id
left join raw_exp e on e.project_id=k.project_id and e.contractor_id=k.contractor_id
left join adv a on a.project_id=k.project_id and a.contractor_id=k.contractor_id
left join settled s on s.project_id=k.project_id and s.contractor_id=k.contractor_id
left join legacy_pay lp on lp.project_id=k.project_id and lp.contractor_id=k.contractor_id;

create or replace function private.fn_guard_final_settlement_expense_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.financial_clock_governed_correction', true) = 'on' then
    return new;
  end if;

  if old.settlement_id is not null
     and (
       old.amount is distinct from new.amount
       or old.project_id is distinct from new.project_id
       or old.contractor_id is distinct from new.contractor_id
       or old.expense_date is distinct from new.expense_date
       or old.payer is distinct from new.payer
       or old.charge_to is distinct from new.charge_to
       or old.is_recoverable is distinct from new.is_recoverable
       or old.is_settled is distinct from new.is_settled
       or old.settlement_id is distinct from new.settlement_id
     )
     and exists (
       select 1
       from public.contractor_settlements s
       where s.id=old.settlement_id
         and s.status::text='ceo_approved'
     )
  then
    raise exception 'هذا المصروف داخل تسوية معتمدة نهائيًا؛ اعكس/صحح التسوية أولًا.';
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_final_settlement_expense_edit on public.contractor_expenses;
create trigger trg_guard_final_settlement_expense_edit
before update on public.contractor_expenses
for each row execute function private.fn_guard_final_settlement_expense_edit();

create or replace function private.fn_guard_final_settlement_attendance_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_work_date date;
  v_contractor uuid;
begin
  if current_setting('app.financial_clock_governed_correction', true) = 'on' then
    return new;
  end if;

  if not (
    old.status is distinct from new.status
    or old.rate_used is distinct from new.rate_used
    or old.amount is distinct from new.amount
    or old.day_id is distinct from new.day_id
    or old.laborer_id is distinct from new.laborer_id
  ) then
    return new;
  end if;

  select d.project_id,d.work_date
  into v_project,v_work_date
  from public.timesheet_days d
  where d.id=old.day_id;

  v_contractor:=old.contractor_id_snapshot;
  if v_contractor is null then
    select l.contractor_id into v_contractor
    from public.laborers l
    where l.id=old.laborer_id;
  end if;

  if v_project is not null and v_contractor is not null and exists(
    select 1
    from public.contractor_settlements s
    where s.project_id=v_project
      and s.contractor_id=v_contractor
      and s.status::text='ceo_approved'
      and v_work_date between s.period_from and s.period_to
  ) then
    raise exception 'هذا الحضور داخل تسوية معتمدة نهائيًا؛ اعكس/صحح التسوية أولًا.';
  end if;

  return new;
end
$$;

drop trigger if exists trg_guard_final_settlement_attendance_edit on public.attendance;
create trigger trg_guard_final_settlement_attendance_edit
before update on public.attendance
for each row execute function private.fn_guard_final_settlement_attendance_edit();

comment on view public.v_financial_case_clock is
  'الساعة المالية الموحدة: القيمة الفعلية المعتمدة، المدفوع المثبت بالخزينة، وصافي المستحق دون إعادة حساب موازٍ.';
comment on view public.v_contractor_settlement_clock is
  'ساعة تسوية المقاول على حبيبة مشروع × مقاول × فترة: مكتسب، مسوّى، مدفوع، ومتَبقٍ.';
comment on column public.contractor_settlements.case_id is
  'الرابط الوحيد بين مستند التسوية ودورة حياته في financial_cases.';
comment on column public.contractor_payments.treasury_movement_id is
  'حركة الخزينة canonical التي تثبت أن دفعة المقاول خرجت فعليًا.';
