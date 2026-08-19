-- التمتير سجل مستقل عن المستخلص.
-- يمكن للمستخلص جمع تمتير واحد أو عدة تمتيرات من المشروع نفسه، مع احتفاظ كل تمتير ببنده ورقمه وفترته.

create table if not exists item_measurements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  project_item_id uuid not null references project_items(id) on delete restrict,
  measurement_no integer not null,
  period_from date,
  period_to date not null,
  qty_measured numeric(14,3) not null,
  unit_snapshot text,
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) generated always as (round(qty_measured * unit_price, 2)) stored,
  status text not null default 'available',
  claim_id uuid references progress_claims(id) on delete set null,
  source_progress_entry_id uuid unique references progress_entries(id) on delete set null,
  document_ref text,
  notes text,
  measured_by_employee_id uuid references employees(id) on delete set null,
  recorded_by_user_id uuid,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint item_measurements_period_check check (period_from is null or period_from <= period_to),
  constraint item_measurements_qty_check check (qty_measured > 0),
  constraint item_measurements_price_check check (unit_price >= 0),
  constraint item_measurements_status_check check (status in ('available','claimed','cancelled')),
  constraint item_measurements_item_no_key unique (project_item_id, measurement_no)
);

create index if not exists item_measurements_project_status_idx on item_measurements(project_id,status,period_to);
create index if not exists item_measurements_item_date_idx on item_measurements(project_item_id,period_to,measurement_no);
create index if not exists item_measurements_claim_idx on item_measurements(claim_id) where claim_id is not null;

alter table item_measurements enable row level security;

drop policy if exists item_measurements_active_user_select on item_measurements;
create policy item_measurements_active_user_select on item_measurements for select to authenticated
using (exists(select 1 from app_users u where u.id=auth.uid() and u.is_active));

drop policy if exists item_measurements_active_user_insert on item_measurements;
create policy item_measurements_active_user_insert on item_measurements for insert to authenticated
with check (exists(select 1 from app_users u where u.id=auth.uid() and u.is_active));

drop policy if exists item_measurements_active_user_update on item_measurements;
create policy item_measurements_active_user_update on item_measurements for update to authenticated
using (exists(select 1 from app_users u where u.id=auth.uid() and u.is_active))
with check (exists(select 1 from app_users u where u.id=auth.uid() and u.is_active));

drop policy if exists item_measurements_active_user_delete on item_measurements;
create policy item_measurements_active_user_delete on item_measurements for delete to authenticated
using (exists(select 1 from app_users u where u.id=auth.uid() and u.is_active));

alter table claim_lines add column if not exists measurement_id uuid references item_measurements(id) on delete restrict;
alter table claim_lines add column if not exists measurement_no_snapshot integer;
alter table claim_lines add column if not exists measurement_period_from date;
alter table claim_lines add column if not exists measurement_period_to date;
alter table claim_lines add column if not exists description_snapshot text;
alter table claim_lines add column if not exists unit_snapshot text;
create index if not exists claim_lines_measurement_idx on claim_lines(measurement_id) where measurement_id is not null;

-- ترحيل التسجيلات القديمة التي تشير ملاحظاتها صراحة إلى القياس فقط.
with legacy as (
  select pe.id progress_id,pi.project_id,pe.project_item_id,pe.entry_date,pe.qty_done,pi.unit,pi.sell_price,pe.notes,
         row_number() over(partition by pe.project_item_id order by pe.entry_date,pe.created_at,pe.id)::int measurement_no
  from progress_entries pe
  join project_items pi on pi.id=pe.project_item_id
  where pe.claimed=false and coalesce(pe.notes,'') ilike '%قياس%'
)
insert into item_measurements(project_id,project_item_id,measurement_no,period_from,period_to,qty_measured,unit_snapshot,unit_price,status,source_progress_entry_id,notes)
select l.project_id,l.project_item_id,l.measurement_no,null,l.entry_date,l.qty_done,l.unit,coalesce(l.sell_price,0),'available',l.progress_id,
       concat_ws(' | ',nullif(l.notes,''),'مرحّل من سجل القياس السابق')
from legacy l
where not exists(select 1 from item_measurements m where m.source_progress_entry_id=l.progress_id)
on conflict (source_progress_entry_id) do nothing;

create or replace view v_available_measurements with (security_invoker=true) as
select m.id measurement_id,m.project_id,m.project_item_id,m.measurement_no,m.period_from,m.period_to,m.qty_measured,
       coalesce(m.unit_snapshot,pi.unit) unit,m.unit_price,m.amount,m.document_ref,m.notes,m.source_progress_entry_id,m.recorded_at,
       pi.description_ar,pi.contract_qty,(m.period_from is not null) ready_for_claim
from item_measurements m
join project_items pi on pi.id=m.project_item_id
where m.status='available' and m.claim_id is null;

create or replace view v_item_measurement_status with (security_invoker=true) as
select pi.project_id,pi.id project_item_id,pi.description_ar,pi.unit,pi.sell_price,pi.contract_qty,
       coalesce(max(m.measurement_no),0) last_measurement_no,
       max(m.period_to) filter(where m.status<>'cancelled') last_measurement_date,
       case when max(m.period_to) filter(where m.status<>'cancelled') is not null
            then max(m.period_to) filter(where m.status<>'cancelled') + 1 else null end suggested_period_from,
       coalesce(sum(m.qty_measured) filter(where m.status<>'cancelled'),0) measured_qty_total,
       coalesce(sum(m.qty_measured) filter(where m.status='available'),0) available_qty,
       coalesce(sum(m.amount) filter(where m.status='available'),0) available_amount
from project_items pi
left join item_measurements m on m.project_item_id=pi.id
where pi.kind='item'
group by pi.project_id,pi.id,pi.description_ar,pi.unit,pi.sell_price,pi.contract_qty;

create or replace function record_item_measurement(
  p_project_item uuid,p_period_from date,p_period_to date,p_qty numeric,p_unit_price numeric default null,
  p_document_ref text default null,p_notes text default null,p_measured_by_employee uuid default null
)
returns table(measurement_id uuid,measurement_no integer)
language plpgsql security definer set search_path=public as $$
declare v_item project_items; v_no integer; v_id uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_project_item is null then raise exception 'البند مطلوب'; end if;
  if p_period_to is null then raise exception 'تاريخ القياس مطلوب'; end if;
  if p_period_from is null then raise exception 'بداية فترة القياس مطلوبة'; end if;
  if p_period_from>p_period_to then raise exception 'بداية فترة القياس لا يمكن أن تكون بعد تاريخ القياس'; end if;
  if coalesce(p_qty,0)<=0 then raise exception 'الكمية المقاسة يجب أن تكون أكبر من صفر'; end if;
  select * into v_item from project_items where id=p_project_item and kind='item';
  if v_item.id is null then raise exception 'البند غير موجود'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_item::text,0));
  select coalesce(max(m.measurement_no),0)+1 into v_no from item_measurements m where m.project_item_id=p_project_item;
  insert into item_measurements(project_id,project_item_id,measurement_no,period_from,period_to,qty_measured,unit_snapshot,unit_price,document_ref,notes,measured_by_employee_id,recorded_by_user_id)
  values(v_item.project_id,p_project_item,v_no,p_period_from,p_period_to,p_qty,v_item.unit,coalesce(p_unit_price,v_item.sell_price,0),nullif(trim(p_document_ref),''),nullif(trim(p_notes),''),p_measured_by_employee,auth.uid())
  returning id into v_id;
  return query select v_id,v_no;
end $$;
revoke all on function record_item_measurement(uuid,date,date,numeric,numeric,text,text,uuid) from public;
grant execute on function record_item_measurement(uuid,date,date,numeric,numeric,text,text,uuid) to authenticated;

create or replace function create_claim_from_measurements(p_project uuid,p_measurement_ids uuid[])
returns table(claim_id uuid,claim_no text,period_from date,period_to date,gross_amount numeric,measurements_count integer)
language plpgsql security definer set search_path=public as $$
declare v_project projects; v_count integer; v_bad integer; v_from date; v_to date; v_gross numeric(14,2); v_seq integer; v_no text; v_claim uuid; v_prev_cum numeric(14,2); v_retention numeric(14,2);
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_project is null then raise exception 'المشروع مطلوب'; end if;
  if p_measurement_ids is null or cardinality(p_measurement_ids)=0 then raise exception 'اختر تمتيراً واحداً على الأقل'; end if;
  select * into v_project from projects where id=p_project;
  if v_project.id is null then raise exception 'المشروع غير موجود'; end if;
  perform 1 from item_measurements m where m.id=any(p_measurement_ids) for update;
  select count(*) into v_count from item_measurements m where m.id=any(p_measurement_ids);
  if v_count<>cardinality(p_measurement_ids) then raise exception 'بعض التمتيرات المحددة غير موجودة'; end if;
  select count(*) into v_bad from item_measurements m where m.id=any(p_measurement_ids)
    and (m.project_id<>p_project or m.status<>'available' or m.claim_id is not null or m.period_from is null);
  if v_bad>0 then raise exception 'بعض التمتيرات غير متاحة أو لم تكتمل فترة قياسها'; end if;
  select min(m.period_from),max(m.period_to),round(sum(m.amount),2) into v_from,v_to,v_gross from item_measurements m where m.id=any(p_measurement_ids);
  select coalesce(max(pc.seq_no),0)+1,round(coalesce(sum(pc.gross_amount) filter(where pc.status<>'rejected'),0),2)
    into v_seq,v_prev_cum from progress_claims pc where pc.project_id=p_project;
  v_no:=next_document_number('CLAIM','CLM');
  v_retention:=round(v_gross*coalesce(v_project.retention_pct,0),2);
  insert into progress_claims(project_id,claim_no,seq_no,period_from,period_to,measurement_date,gross_amount,prev_cumulative,retention_amount,vat_rate,status,created_by,measurement_recorded_by_user_id)
  values(p_project,v_no,v_seq,v_from,v_to,v_to,v_gross,v_prev_cum,v_retention,coalesce(v_project.vat_rate,0.15),'draft',auth.uid(),auth.uid()) returning id into v_claim;
  insert into claim_lines(claim_id,project_item_id,qty_previous,qty_this,unit_price,amount,measurement_id,measurement_no_snapshot,measurement_period_from,measurement_period_to,description_snapshot,unit_snapshot)
  select v_claim,m.project_item_id,
         coalesce((select sum(pm.qty_measured) from item_measurements pm where pm.project_item_id=m.project_item_id and pm.measurement_no<m.measurement_no and pm.status<>'cancelled'),0),
         m.qty_measured,m.unit_price,m.amount,m.id,m.measurement_no,m.period_from,m.period_to,pi.description_ar,coalesce(m.unit_snapshot,pi.unit)
  from item_measurements m join project_items pi on pi.id=m.project_item_id where m.id=any(p_measurement_ids)
  order by m.period_to,m.project_item_id,m.measurement_no;
  update item_measurements set status='claimed',claim_id=v_claim where id=any(p_measurement_ids);
  update progress_entries pe set claimed=true,claim_id=v_claim where pe.id in (
    select m.source_progress_entry_id from item_measurements m where m.id=any(p_measurement_ids) and m.source_progress_entry_id is not null
  );
  return query select v_claim,v_no,v_from,v_to,v_gross,v_count;
end $$;
revoke all on function create_claim_from_measurements(uuid,uuid[]) from public;
grant execute on function create_claim_from_measurements(uuid,uuid[]) to authenticated;

-- الدالة القديمة تبقى للتوافق فقط. واجهة المستخلصات الجديدة لا تستخدمها.
-- عند حذف مستخلص تعود التمتيرات المرتبطة إلى قائمة التمتير المتاح.
create or replace function delete_claim_deep(p_claim uuid)
returns table(deleted_no text,files text[])
language plpgsql security definer set search_path=public as $$
declare v_row progress_claims; v_files text[];
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from progress_claims where id=p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;
  select coalesce(array_agg(file_path) filter(where file_path is not null),'{}') into v_files from op_attachments where entity_type='claim' and entity_id=p_claim;
  if v_row.collected_at is not null then
    update projects set advance_recovered=greatest(0,coalesce(advance_recovered,0)-coalesce(v_row.advance_recovery,0)) where id=v_row.project_id;
  end if;
  update item_measurements set status='available',claim_id=null where claim_id=p_claim;
  update progress_entries set claimed=false,claim_id=null where claim_id=p_claim;
  delete from op_attachments where entity_type='claim' and entity_id=p_claim;
  delete from claim_lines where claim_id=p_claim;
  delete from progress_claims where id=p_claim;
  return query select v_row.claim_no,v_files;
end $$;
revoke all on function delete_claim_deep(uuid) from public;
grant execute on function delete_claim_deep(uuid) to authenticated;
