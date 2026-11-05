-- 40_سلامة_تشغيل_الموقع_والتصفيات.sql
-- مصدر حقيقة تاريخي للعمالة + منع ازدواج التصفيات + كشف المصروفات المشكوك فيها.
-- لا يعيد تصنيف أي مصروف تاريخي ولا يغير مبلغ حضور مسجل.

-- ============================================================
-- 1) لقطة تاريخية لهوية العامل وقت تسجيل الحضور
-- ============================================================
alter table public.attendance
  add column if not exists project_id_snapshot uuid references public.projects(id) on delete restrict,
  add column if not exists contractor_id_snapshot uuid references public.contractors(id) on delete restrict,
  add column if not exists labor_class_snapshot public.labor_class,
  add column if not exists trade_snapshot text,
  add column if not exists snapshot_source text;

create index if not exists ix_attendance_project_snapshot on public.attendance(project_id_snapshot);
create index if not exists ix_attendance_contractor_snapshot on public.attendance(contractor_id_snapshot);

-- نجمد القراءة الحالية للتاريخ قبل أن تتغير ملفات العمال لاحقاً.
update public.attendance a
   set project_id_snapshot    = coalesce(a.project_id_snapshot, d.project_id),
       contractor_id_snapshot = coalesce(a.contractor_id_snapshot, l.contractor_id),
       labor_class_snapshot    = coalesce(a.labor_class_snapshot, l.labor_class),
       trade_snapshot          = coalesce(a.trade_snapshot, l.trade),
       snapshot_source         = coalesce(a.snapshot_source, 'backfill_current_master')
  from public.timesheet_days d, public.laborers l
 where d.id = a.day_id
   and l.id = a.laborer_id;

-- ============================================================
-- 2) إسناد العامل للمشروع والمقاول بالفترة
-- ============================================================
create table if not exists public.labor_project_assignments (
  id uuid primary key default gen_random_uuid(),
  laborer_id uuid not null references public.laborers(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  valid_from date not null,
  valid_to date,
  labor_class public.labor_class,
  trade text,
  pay_basis public.pay_basis,
  daily_rate numeric(12,2),
  source text not null default 'manual',
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint labor_project_assignments_dates_chk check (valid_to is null or valid_to >= valid_from)
);

create index if not exists ix_labor_assignments_lookup
  on public.labor_project_assignments(laborer_id, project_id, valid_from, valid_to);
create index if not exists ix_labor_assignments_project_date
  on public.labor_project_assignments(project_id, contractor_id, valid_from, valid_to);

alter table public.labor_project_assignments enable row level security;
drop policy if exists p_labor_project_assignments_read on public.labor_project_assignments;
create policy p_labor_project_assignments_read on public.labor_project_assignments
  for select using (public.current_app_role() is not null);
drop policy if exists p_labor_project_assignments_write on public.labor_project_assignments;
create policy p_labor_project_assignments_write on public.labor_project_assignments
  for all using (public.current_app_role() in ('ceo','hr','accountant','supervisor'))
  with check (public.current_app_role() in ('ceo','hr','accountant','supervisor'));

-- تهيئة محافظة من الأيام المسجلة فقط؛ لا نخترع تاريخاً خارج السجل.
insert into public.labor_project_assignments
  (laborer_id, project_id, contractor_id, valid_from, valid_to,
   labor_class, trade, pay_basis, daily_rate, source, is_active)
select a.laborer_id,
       d.project_id,
       coalesce(a.contractor_id_snapshot, l.contractor_id) as contractor_id,
       min(d.work_date),
       max(d.work_date),
       max(coalesce(a.labor_class_snapshot, l.labor_class)::text)::public.labor_class,
       max(coalesce(a.trade_snapshot, l.trade)),
       max(a.pay_basis::text)::public.pay_basis,
       max(a.rate_used),
       'backfill_attendance',
       false
  from public.attendance a
  join public.timesheet_days d on d.id = a.day_id
  join public.laborers l on l.id = a.laborer_id
 where d.project_id is not null
   and coalesce(a.contractor_id_snapshot, l.contractor_id) is not null
   and not exists (
     select 1 from public.labor_project_assignments x
      where x.laborer_id = a.laborer_id
        and x.project_id = d.project_id
        and x.contractor_id = coalesce(a.contractor_id_snapshot, l.contractor_id)
   )
 group by a.laborer_id, d.project_id, coalesce(a.contractor_id_snapshot, l.contractor_id);

-- ============================================================
-- 3) كل حضور جديد يلتقط المقاول/المشروع/الصفة وقت الحركة
-- ============================================================
create or replace function public.fill_attendance_basis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.laborers;
  v_project uuid;
  v_date date;
  v_assignment public.labor_project_assignments;
begin
  select * into l from public.laborers where id = new.laborer_id;
  if l.id is null then return new; end if;

  select d.project_id, d.work_date into v_project, v_date
    from public.timesheet_days d where d.id = new.day_id;

  select * into v_assignment
    from public.labor_project_assignments x
   where x.laborer_id = new.laborer_id
     and x.project_id = v_project
     and x.valid_from <= v_date
     and (x.valid_to is null or x.valid_to >= v_date)
   order by x.is_active desc, x.valid_from desc, x.created_at desc
   limit 1;

  new.project_id_snapshot := coalesce(new.project_id_snapshot, v_project);
  new.contractor_id_snapshot := coalesce(new.contractor_id_snapshot, v_assignment.contractor_id, l.contractor_id);
  new.labor_class_snapshot := coalesce(new.labor_class_snapshot, v_assignment.labor_class, l.labor_class);
  new.trade_snapshot := coalesce(new.trade_snapshot, v_assignment.trade, l.trade);
  new.snapshot_source := coalesce(new.snapshot_source,
    case when v_assignment.id is not null then 'assignment' else 'laborer_master' end);

  new.pay_basis := coalesce(new.pay_basis, v_assignment.pay_basis, l.pay_basis);
  if new.pay_basis = 'piecework' then
    new.piece_rate := coalesce(new.piece_rate, l.piece_rate, 0);
    new.rate_used := 0;
  elsif new.rate_used is null or new.rate_used = 0 then
    new.rate_used := coalesce(v_assignment.daily_rate, public.laborer_daily_rate(new.laborer_id));
  end if;
  return new;
end $$;

-- ============================================================
-- 4) لا يتجاوز العامل يوماً واحداً في التاريخ نفسه عبر المشاريع
-- ============================================================
create or replace function public.attendance_day_factor(p_status public.attend_status)
returns numeric
language sql
immutable
as $$
  select case p_status::text
    when 'full' then 1::numeric
    when 'stopped' then 1::numeric
    when 'half' then 0.5::numeric
    else 0::numeric
  end
$$;

create or replace function public.guard_attendance_daily_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_date date;
  v_used numeric := 0;
begin
  select work_date into v_date from public.timesheet_days where id = new.day_id;
  if v_date is null then return new; end if;

  select coalesce(sum(public.attendance_day_factor(a.status)), 0)
    into v_used
    from public.attendance a
    join public.timesheet_days d on d.id = a.day_id
   where a.laborer_id = new.laborer_id
     and d.work_date = v_date
     and (tg_op = 'INSERT' or a.id <> new.id);

  if v_used + public.attendance_day_factor(new.status) > 1 then
    raise exception 'لا يمكن تسجيل أكثر من يوم عمل واحد للعامل في التاريخ نفسه؛ المسموح كامل واحد أو نصفان.';
  end if;
  return new;
end $$;

drop trigger if exists trg_attendance_daily_capacity on public.attendance;
create trigger trg_attendance_daily_capacity
before insert or update of day_id, laborer_id, status on public.attendance
for each row execute function public.guard_attendance_daily_capacity();

-- ============================================================
-- 5) توحيد قراءة العمالة على اللقطة التاريخية لا الملف الحالي
-- ============================================================
create or replace view public.v_day_labor_value as
select d.project_id,
       d.work_date,
       coalesce(a.contractor_id_snapshot, l.contractor_id) as contractor_id,
       a.laborer_id,
       a.status,
       coalesce(a.amount,
         coalesce(a.rate_used, l.daily_rate, 0) *
         case a.status::text when 'full' then 1 when 'stopped' then 1 when 'half' then 0.5 else 0 end
       ) as labor_value
  from public.attendance a
  join public.timesheet_days d on d.id = a.day_id
  join public.laborers l on l.id = a.laborer_id;

create or replace view public.v_day_attendance as
select a.id as attendance_id,
       d.id as day_id,
       d.project_id,
       p.project_no,
       p.name_ar as project_name,
       d.work_date,
       public.arkan_week_start(d.work_date) as week_start,
       public.arkan_week_start(d.work_date) + 5 as week_end,
       l.id as laborer_id,
       l.full_name as laborer_name,
       coalesce(a.labor_class_snapshot, l.labor_class) as labor_class,
       coalesce(a.trade_snapshot, l.trade) as trade,
       l.group_code,
       c.id as contractor_id,
       c.name_ar as contractor_name,
       a.status,
       a.pay_basis,
       a.rate_used,
       a.piece_rate,
       a.output_qty,
       a.amount,
       a.stop_reason,
       a.notes,
       d.is_holiday,
       d.weather_stop
  from public.attendance a
  join public.timesheet_days d on d.id = a.day_id
  join public.laborers l on l.id = a.laborer_id
  left join public.contractors c on c.id = coalesce(a.contractor_id_snapshot, l.contractor_id)
  left join public.projects p on p.id = d.project_id;

create or replace view public.v_day_summary as
select d.id as day_id,
       d.project_id,
       p.name_ar as project_name,
       d.work_date,
       public.week_start(d.work_date) as wk_start,
       d.is_holiday,
       d.weather_stop,
       d.notes,
       d.machinery,
       (select count(*) from public.attendance a
         where a.day_id=d.id and a.status::text in ('full','half','stopped')) as present_count,
       (select count(distinct coalesce(a.contractor_id_snapshot,l.contractor_id))
          from public.attendance a join public.laborers l on l.id=a.laborer_id
         where a.day_id=d.id and a.status::text in ('full','half','stopped')) as contractors_count,
       (select coalesce(sum(coalesce(a.amount,
          coalesce(a.rate_used,l.daily_rate,0) * case a.status::text
            when 'full' then 1 when 'stopped' then 1 when 'half' then 0.5 else 0 end)),0)
          from public.attendance a join public.laborers l on l.id=a.laborer_id
         where a.day_id=d.id) as labor_amount,
       (select coalesce(sum(di.group_output),0) from public.day_items di where di.day_id=d.id) as output_qty,
       ((select coalesce(sum(de.amount),0) from public.day_expenses de where de.day_id=d.id)
        +(select coalesce(sum(e.amount),0) from public.contractor_expenses e
           where e.project_id=d.project_id and e.expense_date=d.work_date)) as expenses_amount
  from public.timesheet_days d
  left join public.projects p on p.id=d.project_id;

create or replace view public.v_day_contractor_value as
with piece as (
  select project_id,work_date,contractor_id,
         sum(piece_value) filter(where is_piece) as piece_value,
         bool_or(is_piece) as has_piece
    from public.v_day_piece_value
   group by project_id,work_date,contractor_id
), labor as (
  select project_id,work_date,contractor_id,
         sum(labor_value) as labor_value,
         count(*) filter(where status::text in ('full','half','stopped')) as present_count,
         count(*) as marked_count
    from public.v_day_labor_value
   group by project_id,work_date,contractor_id
)
select coalesce(l.project_id,p.project_id) as project_id,
       coalesce(l.work_date,p.work_date) as work_date,
       coalesce(l.contractor_id,p.contractor_id) as contractor_id,
       public.arkan_week_start(coalesce(l.work_date,p.work_date)) as week_start,
       coalesce(l.labor_value,0) as daywork_value,
       coalesce(p.piece_value,0) as piecework_value,
       coalesce(p.has_piece,false) as is_piece_day,
       case when coalesce(p.has_piece,false) then coalesce(p.piece_value,0) else coalesce(l.labor_value,0) end as by_item_value,
       coalesce(l.present_count,0) as present_count,
       coalesce(l.marked_count,0) as marked_count
  from labor l
  full join piece p on p.project_id=l.project_id and p.work_date=l.work_date
    and not (p.contractor_id is distinct from l.contractor_id);

-- تكلفة العامل على البند لم تعد تعتمد على week_id القديم.
create or replace view public.v_item_daily_actuals as
with day_cost as (
  select d.id as day_id,
         d.work_date,
         d.project_id,
         coalesce(a.contractor_id_snapshot,l.contractor_id) as contractor_id,
         coalesce(sum(coalesce(a.amount,
           coalesce(a.rate_used,l.daily_rate,0) * case a.status::text
             when 'full' then 1 when 'stopped' then 1 when 'half' then 0.5 else 0 end)),0) as day_amount
    from public.attendance a
    join public.timesheet_days d on d.id=a.day_id
    join public.laborers l on l.id=a.laborer_id
   group by d.id,d.work_date,d.project_id,coalesce(a.contractor_id_snapshot,l.contractor_id)
), di as (
  select i.day_id,
         i.project_item_id,
         i.contractor_id,
         coalesce(i.group_output,0) as output_qty,
         sum(coalesce(i.group_output,0)) over(partition by i.day_id,i.contractor_id) as day_output,
         count(*) over(partition by i.day_id,i.contractor_id) as day_item_count
    from public.day_items i
)
select di.project_item_id,
       dc.contractor_id,
       dc.project_id,
       dc.work_date,
       coalesce(di.output_qty,0) as output_qty,
       case
         when di.project_item_id is null then dc.day_amount
         when di.day_output > 0 then round(dc.day_amount * di.output_qty / di.day_output,2)
         when di.day_item_count > 0 then round(dc.day_amount / di.day_item_count,2)
         else 0
       end as cost_amount
  from day_cost dc
  left join di on di.day_id=dc.day_id and di.contractor_id is not distinct from dc.contractor_id;

create or replace view public.v_day_events as
select d.project_id,d.work_date as event_date,'attendance'::text as kind,'حضور'::text as kind_ar,
       c.name_ar as party,null::text as ref,coalesce(sum(a.amount),0) as amount,
       (count(*) filter(where a.status::text in ('full','half','stopped')))::text || ' حاضر' as note
  from public.timesheet_days d
  join public.attendance a on a.day_id=d.id
  left join public.laborers l on l.id=a.laborer_id
  left join public.contractors c on c.id=coalesce(a.contractor_id_snapshot,l.contractor_id)
 group by d.project_id,d.work_date,c.name_ar
union all
select d.project_id,d.work_date,'output','إنتاج',pi.description_ar,null,null,
       coalesce(di.group_output,0)::text || ' ' || coalesce(di.unit,pi.unit,'')
  from public.timesheet_days d join public.day_items di on di.day_id=d.id
  left join public.project_items pi on pi.id=di.project_item_id
union all
select e.project_id,e.expense_date,'expense','منصرف',c.name_ar,e.category,e.amount,e.notes
  from public.contractor_expenses e left join public.contractors c on c.id=e.contractor_id
union all
select cl.project_id,coalesce(cl.submitted_at,cl.created_at::date),'claim','مستخلص',null,cl.claim_no,cl.net_payable,cl.status::text
  from public.progress_claims cl
union all
select s.project_id,coalesce(s.paid_at,s.period_to),'settlement','تسوية مقاول',c.name_ar,s.settlement_no,s.net_payable,s.status::text
  from public.contractor_settlements s left join public.contractors c on c.id=s.contractor_id
 where coalesce(s.paid_at,s.period_to) is not null
union all
select m.project_id,m.received_at,'material','مواد',m.supplier,m.invoice_ref,m.total_cost,m.material_name
  from public.project_materials m where m.received_at is not null;

-- ============================================================
-- 6) تصحيح اتجاه مصروف المقاول: من دفع؟ وعلى من يُحمّل؟
-- ============================================================
create or replace view public.v_contractor_expense_split as
select d.project_id,d.work_date as expense_date,de.contractor_id,'day'::text as source,de.id as source_id,
       de.category,de.amount,de.payer::text as payer,de.charge_to::text as charge_to,
       case when de.payer::text='contractor' and de.charge_to::text in ('owner','arkan') then coalesce(de.amount,0) else 0 end as reimbursable,
       case when de.payer::text in ('arkan_custody','arkan_direct') and de.charge_to::text='contractor' then coalesce(de.amount,0) else 0 end as charged,
       de.notes
  from public.day_expenses de join public.timesheet_days d on d.id=de.day_id
union all
select ce.project_id,ce.expense_date,ce.contractor_id,'contractor'::text,ce.id,ce.category,ce.amount,
       ce.payer::text,ce.charge_to::text,
       case when ce.payer::text='contractor' and ce.charge_to::text in ('owner','arkan') then coalesce(ce.amount,0) else 0 end,
       case when ce.payer::text in ('arkan_custody','arkan_direct') and ce.charge_to::text='contractor' then coalesce(ce.amount,0) else 0 end,
       ce.notes
  from public.contractor_expenses ce
 where coalesce(ce.is_settled,false)=false;

-- أعلام مراجعة فقط؛ لا تصحيح تلقائي للتاريخ.
create or replace view public.v_contractor_expense_review as
select ce.*,
       case
         when ce.category='وجبات' and coalesce(ce.notes,'') ~* '(بنزين|وقود|ديزل)' then 'الوصف يبدو وقوداً والتصنيف وجبات'
         when ce.category='أخرى' and coalesce(ce.notes,'') ~* '(تأمين طبي|تامين طبي)' then 'الوصف يبدو تأميناً طبياً'
         when coalesce(ce.is_recoverable,false)=false and coalesce(ce.notes,'') ~* '(تأمين|تامين|عهدة|ضمان)' then 'قد يكون مبلغاً مسترداً أو عهدة وليس مصروفاً نهائياً'
         when ce.category='أخرى' and coalesce(ce.notes,'') ~* '(أجور|اجور|راتب|عمال|نجارين|حداد)' then 'قد تكون أجور عمالة ويجب مراجعة علاقتها بالتايم شيت'
         else null
       end as review_reason
  from public.contractor_expenses ce;

-- ============================================================
-- 7) التصفيات: منع تداخل الفترات + خصم السلفة مرة واحدة من أول استحقاق
-- ============================================================
create table if not exists public.contractor_advance_deductions (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.contractor_settlements(id) on delete cascade,
  advance_id uuid not null references public.contractor_advances(id) on delete restrict,
  amount numeric(14,2) not null check(amount > 0),
  created_at timestamptz not null default now(),
  unique(settlement_id,advance_id)
);

alter table public.contractor_advance_deductions enable row level security;
drop policy if exists p_contractor_advance_deductions_read on public.contractor_advance_deductions;
create policy p_contractor_advance_deductions_read on public.contractor_advance_deductions
  for select using (public.current_app_role() is not null);
drop policy if exists p_contractor_advance_deductions_write on public.contractor_advance_deductions;
create policy p_contractor_advance_deductions_write on public.contractor_advance_deductions
  for all using (public.current_app_role() in ('ceo','hr','accountant'))
  with check (public.current_app_role() in ('ceo','hr','accountant'));

create or replace function public.fn_settlement_preview(
  p_project_id uuid, p_contractor_id uuid, p_from date, p_to date, p_basis text default 'item')
returns table(days_worked integer, daywork_value numeric, piecework_value numeric, by_item_value numeric,
              works_amount numeric, reimbursable_amount numeric, charged_amount numeric,
              advances_amount numeric, net_payable numeric)
language sql stable
as $$
with w as (
  select count(*)::int as days_worked,coalesce(sum(daywork_value),0) as daywork_value,
         coalesce(sum(piecework_value),0) as piecework_value,coalesce(sum(by_item_value),0) as by_item_value
    from public.v_day_contractor_value
   where project_id=p_project_id and contractor_id=p_contractor_id and work_date between p_from and p_to
), e as (
  select coalesce(sum(reimbursable),0) as reimbursable_amount,coalesce(sum(charged),0) as charged_amount
    from public.v_contractor_expense_split
   where project_id=p_project_id and contractor_id=p_contractor_id and expense_date between p_from and p_to
), a as (
  select coalesce(sum(remaining),0) as open_advance
    from public.contractor_advances
   where project_id=p_project_id and contractor_id=p_contractor_id
     and coalesce(is_closed,false)=false and advance_date <= p_to
), base as (
  select w.*,e.reimbursable_amount,e.charged_amount,
         case lower(coalesce(p_basis,'item')) when 'daywork' then w.daywork_value when 'piecework' then w.piecework_value else w.by_item_value end as works_amount,
         a.open_advance
    from w,e,a
)
select days_worked,daywork_value,piecework_value,by_item_value,works_amount,reimbursable_amount,charged_amount,
       least(open_advance,greatest(works_amount+reimbursable_amount-charged_amount,0)) as advances_amount,
       works_amount+reimbursable_amount-charged_amount
       - least(open_advance,greatest(works_amount+reimbursable_amount-charged_amount,0)) as net_payable
  from base;
$$;

create or replace function public.fn_build_period_settlement(
  p_project_id uuid, p_contractor_id uuid, p_from date, p_to date,
  p_basis text default 'item', p_penalty numeric default 0, p_other numeric default 0,
  p_settlement_id uuid default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_id uuid := p_settlement_id;
  v_base numeric := 0;
  v_open_adv numeric := 0;
  v_adv_apply numeric := 0;
  v_left numeric := 0;
  v_take numeric := 0;
  adv record;
  oldded record;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'مدة التسوية غير صحيحة'; end if;

  if exists (
    select 1 from public.contractor_settlements s
     where s.project_id=p_project_id and s.contractor_id=p_contractor_id
       and s.id is distinct from v_id
       and s.period_from <= p_to and s.period_to >= p_from
       and coalesce(s.status::text,'draft') not in ('rejected','cancelled')
  ) then raise exception 'توجد تسوية أخرى لهذا المقاول تتداخل مع الفترة المطلوبة'; end if;

  if v_id is not null then
    for oldded in select advance_id,sum(amount) as amount from public.contractor_advance_deductions where settlement_id=v_id group by advance_id
    loop
      update public.contractor_advances set deducted=greatest(coalesce(deducted,0)-oldded.amount,0),is_closed=false where id=oldded.advance_id;
    end loop;
    delete from public.contractor_advance_deductions where settlement_id=v_id;
  end if;

  select * into r from public.fn_settlement_preview(p_project_id,p_contractor_id,p_from,p_to,p_basis);
  v_base := coalesce(r.works_amount,0)+coalesce(r.reimbursable_amount,0)-coalesce(r.charged_amount,0)-coalesce(p_penalty,0)+coalesce(p_other,0);
  select coalesce(sum(remaining),0) into v_open_adv from public.contractor_advances
   where project_id=p_project_id and contractor_id=p_contractor_id and coalesce(is_closed,false)=false and advance_date <= p_to;
  v_adv_apply := least(v_open_adv,greatest(v_base,0));

  if v_id is null then
    insert into public.contractor_settlements(settlement_no,project_id,contractor_id,period_from,period_to,works_amount,reimbursable_amount,charged_amount,advances_amount,penalty_amount,other_additions,net_payable)
    values(public.fn_next_settlement_no(),p_project_id,p_contractor_id,p_from,p_to,r.works_amount,r.reimbursable_amount,r.charged_amount,v_adv_apply,coalesce(p_penalty,0),coalesce(p_other,0),v_base-v_adv_apply)
    returning id into v_id;
  else
    update public.contractor_settlements set period_from=p_from,period_to=p_to,works_amount=r.works_amount,reimbursable_amount=r.reimbursable_amount,
      charged_amount=r.charged_amount,advances_amount=v_adv_apply,penalty_amount=coalesce(p_penalty,0),other_additions=coalesce(p_other,0),net_payable=v_base-v_adv_apply
    where id=v_id;
  end if;

  v_left := v_adv_apply;
  for adv in select id,remaining from public.contractor_advances
    where project_id=p_project_id and contractor_id=p_contractor_id and coalesce(is_closed,false)=false and advance_date <= p_to and remaining > 0
    order by advance_date,id
  loop
    exit when v_left <= 0;
    v_take := least(v_left,adv.remaining);
    insert into public.contractor_advance_deductions(settlement_id,advance_id,amount) values(v_id,adv.id,v_take);
    update public.contractor_advances set deducted=coalesce(deducted,0)+v_take,
      is_closed=(amount-(coalesce(deducted,0)+v_take) <= 0) where id=adv.id;
    v_left := v_left-v_take;
  end loop;
  return v_id;
end $$;

-- المسار القديم يبقى متوافقاً لكنه يمر الآن على المحرك الآمن نفسه.
create or replace function public.build_contractor_settlement(
  p_project uuid, p_contractor uuid, p_from date, p_to date, p_week uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  s public.contractor_settlements;
begin
  if public.current_app_role() not in ('ceo','accountant') then raise exception 'بناء كشف التسوية للإدارة المالية'; end if;
  v_id := public.fn_build_period_settlement(p_project,p_contractor,p_from,p_to,'item',0,0,null);
  update public.contractor_settlements set week_id=coalesce(week_id,p_week) where id=v_id;
  select * into s from public.contractor_settlements where id=v_id;
  return jsonb_build_object('ok',true,'id',s.id,'settlement_no',s.settlement_no,
    'works_amount',s.works_amount,'reimbursable_amount',s.reimbursable_amount,
    'charged_amount',s.charged_amount,'advances_amount',s.advances_amount,'net_payable',s.net_payable);
end $$;
