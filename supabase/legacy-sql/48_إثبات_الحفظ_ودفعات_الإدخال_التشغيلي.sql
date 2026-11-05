-- ============================================================
-- 48_إثبات_الحفظ_ودفعات_الإدخال_التشغيلي.sql
--
-- الغاية:
-- 1) كل كتابة تشغيلية أساسية تتم مرة واحدة داخل معاملة واحدة.
-- 2) إعادة المحاولة بعد انقطاع الشبكة لا تكرر الحركة.
-- 3) لا يظهر «تم الحفظ» قبل إنشاء إيصال يمكن قراءته من الخادم.
-- 4) إدخال الأوراق التاريخية يرتبط بدفعة ومرجع وحالة ثقة.
--
-- هذا الملف لا يحذف ولا يعيد تصنيف أي سجل تاريخي.
-- ============================================================

create sequence if not exists public.operation_entry_batch_no_seq;

create table if not exists public.operation_entry_batches (
  id uuid primary key default gen_random_uuid(),
  batch_serial bigint not null default nextval('public.operation_entry_batch_no_seq'),
  batch_no text not null unique,
  title text not null check (length(btrim(title)) >= 3),
  project_id uuid references public.projects(id) on delete restrict,
  period_from date,
  period_to date,
  source_kind text not null default 'paper'
    check (source_kind in ('paper','import','live','correction')),
  certainty text not null default 'confirmed'
    check (certainty in ('confirmed','estimated','missing')),
  expected_documents integer not null default 0 check (expected_documents >= 0),
  status text not null default 'draft'
    check (status in ('draft','reconciled','closed','cancelled')),
  notes text,
  created_by uuid not null default auth.uid() references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_by uuid references public.app_users(id) on delete restrict,
  closed_at timestamptz,
  close_note text,
  constraint operation_entry_batches_period_chk
    check (period_to is null or period_from is null or period_to >= period_from)
);

create unique index if not exists ux_operation_entry_batches_serial
  on public.operation_entry_batches(batch_serial);
create index if not exists ix_operation_entry_batches_project_status
  on public.operation_entry_batches(project_id,status,created_at desc);

create table if not exists public.operation_write_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint generated always as identity unique,
  request_id uuid not null unique,
  operation_type text not null
    check (operation_type in ('attendance','output','expense','advance','payment')),
  project_id uuid not null references public.projects(id) on delete restrict,
  work_date date not null,
  batch_id uuid references public.operation_entry_batches(id) on delete restrict,
  source_kind text not null default 'live'
    check (source_kind in ('paper','import','live','correction')),
  source_ref text,
  certainty text not null default 'confirmed'
    check (certainty in ('confirmed','estimated','missing')),
  entity_table text not null,
  entity_ids uuid[] not null default '{}'::uuid[],
  entity_snapshot jsonb not null default '{}'::jsonb,
  payload_fingerprint text not null,
  saved_by uuid not null default auth.uid() references public.app_users(id) on delete restrict,
  saved_at timestamptz not null default now(),
  verified_at timestamptz not null default now()
);

create index if not exists ix_operation_receipts_project_date
  on public.operation_write_receipts(project_id,work_date,receipt_no desc);
create index if not exists ix_operation_receipts_batch
  on public.operation_write_receipts(batch_id,receipt_no desc)
  where batch_id is not null;
create index if not exists ix_operation_receipts_saved_by
  on public.operation_write_receipts(saved_by,saved_at desc);

create or replace view public.v_operation_entry_batch_health
with (security_invoker=true)
as
select b.*,
       count(r.id)::integer as operation_count,
       count(distinct nullif(btrim(r.source_ref),''))::integer as registered_document_refs,
       max(r.verified_at) as last_verified_at
from public.operation_entry_batches b
left join public.operation_write_receipts r on r.batch_id=b.id
group by b.id;

comment on table public.operation_write_receipts is
  'إيصالات غير قابلة للتعديل تثبت الكتابة التشغيلية بعد نجاحها وتمنع تكرارها عند إعادة المحاولة.';
comment on column public.operation_write_receipts.request_id is
  'معرّف ينشئه جهاز المستخدم قبل الكتابة ويظل ثابتاً في كل إعادة محاولة.';

-- ------------------------------------------------------------
-- الصلاحيات: الجداول ظاهرة للمستخدم المسجل فقط، والإيصال لا يعدل
-- ------------------------------------------------------------
alter table public.operation_entry_batches enable row level security;
alter table public.operation_write_receipts enable row level security;

revoke all on public.operation_entry_batches from anon, authenticated;
revoke all on public.operation_write_receipts from anon, authenticated;
grant select,insert,update on public.operation_entry_batches to authenticated;
grant select,insert on public.operation_write_receipts to authenticated;
grant select on public.v_operation_entry_batch_health to authenticated;
grant usage,select on sequence public.operation_entry_batch_no_seq to authenticated;
grant usage,select on sequence public.operation_write_receipts_receipt_no_seq to authenticated;

drop policy if exists p_operation_batches_read on public.operation_entry_batches;
create policy p_operation_batches_read on public.operation_entry_batches
  for select to authenticated
  using ((select public.current_app_role()) is not null);

drop policy if exists p_operation_batches_insert on public.operation_entry_batches;
create policy p_operation_batches_insert on public.operation_entry_batches
  for insert to authenticated
  with check (
    (select public.current_app_role())::text in ('ceo','hr','accountant','supervisor')
    and created_by = (select auth.uid())
  );

drop policy if exists p_operation_batches_update on public.operation_entry_batches;
create policy p_operation_batches_update on public.operation_entry_batches
  for update to authenticated
  using (
    (select public.current_app_role())::text in ('ceo','hr','accountant','supervisor')
    and status <> 'closed'
  )
  with check (
    (select public.current_app_role())::text in ('ceo','hr','accountant','supervisor')
  );

drop policy if exists p_operation_receipts_read on public.operation_write_receipts;
create policy p_operation_receipts_read on public.operation_write_receipts
  for select to authenticated
  using ((select public.current_app_role()) is not null);

drop policy if exists p_operation_receipts_insert on public.operation_write_receipts;
create policy p_operation_receipts_insert on public.operation_write_receipts
  for insert to authenticated
  with check (
    (select public.current_app_role())::text in ('ceo','hr','accountant','supervisor')
    and saved_by = (select auth.uid())
  );

create or replace function public.guard_immutable_operation_receipt()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'إيصال الحفظ سجل إثبات غير قابل للتعديل أو الحذف.';
  return null;
end
$$;

drop trigger if exists trg_operation_receipts_immutable on public.operation_write_receipts;
create trigger trg_operation_receipts_immutable
before update or delete on public.operation_write_receipts
for each row execute function public.guard_immutable_operation_receipt();

-- ------------------------------------------------------------
-- إنشاء دفعة ورقية برقم واضح ومتسلسل
-- ------------------------------------------------------------
create or replace function public.fn_create_operation_entry_batch(
  p_title text,
  p_project_id uuid default null,
  p_period_from date default null,
  p_period_to date default null,
  p_expected_documents integer default 0,
  p_certainty text default 'confirmed',
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_serial bigint;
  v_batch public.operation_entry_batches;
begin
  if coalesce((select public.current_app_role())::text,'') not in ('ceo','hr','accountant','supervisor') then
    raise exception 'لا تملك صلاحية إنشاء دفعة إدخال.';
  end if;
  if coalesce(length(btrim(p_title)),0) < 3 then
    raise exception 'اكتب اسماً واضحاً لدفعة الأوراق.';
  end if;
  if p_period_to is not null and p_period_from is not null and p_period_to < p_period_from then
    raise exception 'نهاية الفترة تسبق بدايتها.';
  end if;
  if coalesce(p_expected_documents,0) < 0 then
    raise exception 'عدد الأوراق المتوقع لا يمكن أن يكون سالباً.';
  end if;
  if coalesce(p_certainty,'') not in ('confirmed','estimated','missing') then
    raise exception 'حالة البيانات غير معروفة.';
  end if;

  v_serial := nextval('public.operation_entry_batch_no_seq');
  insert into public.operation_entry_batches(
    batch_serial,batch_no,title,project_id,period_from,period_to,
    source_kind,certainty,expected_documents,notes,created_by
  ) values (
    v_serial,
    'OPB-' || to_char(clock_timestamp() at time zone 'Asia/Riyadh','YYYYMMDD') || '-' || lpad(v_serial::text,5,'0'),
    btrim(p_title),p_project_id,p_period_from,p_period_to,
    'paper',p_certainty,coalesce(p_expected_documents,0),nullif(btrim(p_notes),''),auth.uid()
  ) returning * into v_batch;

  return to_jsonb(v_batch);
end
$$;

create or replace function public.fn_close_operation_entry_batch(
  p_batch_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch public.operation_entry_batches;
  v_refs integer;
begin
  select * into v_batch
  from public.operation_entry_batches
  where id=p_batch_id
  for update;

  if v_batch.id is null then raise exception 'دفعة الإدخال غير موجودة.'; end if;
  if v_batch.status='closed' then return to_jsonb(v_batch); end if;
  if coalesce((select public.current_app_role())::text,'') not in ('ceo','hr','accountant') then
    raise exception 'إغلاق دفعة الإدخال للمدير أو الموارد البشرية أو الحسابات.';
  end if;

  select count(distinct nullif(btrim(source_ref),''))::integer into v_refs
  from public.operation_write_receipts
  where batch_id=p_batch_id;

  if v_batch.expected_documents > 0 and v_refs < v_batch.expected_documents then
    raise exception 'المراجع المسجلة % من أصل % ورقة متوقعة. أكمل الإدخال قبل الإغلاق.', v_refs, v_batch.expected_documents;
  end if;

  update public.operation_entry_batches
  set status='closed',closed_by=auth.uid(),closed_at=now(),close_note=nullif(btrim(p_note),'')
  where id=p_batch_id
  returning * into v_batch;

  return to_jsonb(v_batch) || jsonb_build_object('registered_document_refs',v_refs);
end
$$;

-- ------------------------------------------------------------
-- كتابة تشغيلية ذرية مع منع التكرار وإثبات القراءة
-- ------------------------------------------------------------
create or replace function public.fn_safe_site_operation_write(
  p_request_id uuid,
  p_operation text,
  p_project_id uuid,
  p_work_date date,
  p_payload jsonb,
  p_batch_id uuid default null,
  p_source_kind text default 'live',
  p_source_ref text default null,
  p_certainty text default 'confirmed'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.operation_write_receipts;
  v_receipt public.operation_write_receipts;
  v_batch public.operation_entry_batches;
  v_day_id uuid;
  v_row jsonb;
  v_one jsonb;
  v_result jsonb := '[]'::jsonb;
  v_ids uuid[] := '{}'::uuid[];
  v_entity_table text;
  v_entity_id uuid;
  v_contractor_id uuid;
  v_item_id uuid;
  v_qty numeric;
begin
  if auth.uid() is null or (select public.current_app_role()) is null then
    raise exception 'انتهت جلسة المستخدم. سجّل الدخول ثم أعد المحاولة.';
  end if;
  if p_request_id is null then raise exception 'معرّف محاولة الحفظ مطلوب.'; end if;
  if p_project_id is null or p_work_date is null then raise exception 'المشروع والتاريخ مطلوبان.'; end if;
  if coalesce(p_operation,'') not in ('attendance','output','expense','advance','payment') then
    raise exception 'نوع الحركة التشغيلية غير مدعوم: %',p_operation;
  end if;
  if coalesce(p_source_kind,'') not in ('paper','import','live','correction') then
    raise exception 'مصدر الإدخال غير معروف.';
  end if;
  if coalesce(p_certainty,'') not in ('confirmed','estimated','missing') then
    raise exception 'حالة البيانات غير معروفة.';
  end if;

  -- يمنع تنفيذ طلبين متزامنين يحملان المعرّف نفسه.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));

  select * into v_existing
  from public.operation_write_receipts
  where request_id=p_request_id;

  if v_existing.id is not null then
    if v_existing.operation_type<>p_operation
       or v_existing.project_id<>p_project_id
       or v_existing.work_date<>p_work_date then
      raise exception 'معرّف الحفظ مستخدم سابقاً لحركة مختلفة.';
    end if;
    return jsonb_build_object(
      'receipt_id',v_existing.id,'receipt_no',v_existing.receipt_no,
      'request_id',v_existing.request_id,'operation_type',v_existing.operation_type,
      'entity_table',v_existing.entity_table,'entity_ids',v_existing.entity_ids,
      'entity_snapshot',v_existing.entity_snapshot,'saved_at',v_existing.saved_at,
      'verified_at',v_existing.verified_at,'duplicate_prevented',true
    );
  end if;

  if p_batch_id is not null then
    select * into v_batch
    from public.operation_entry_batches
    where id=p_batch_id;
    if v_batch.id is null then raise exception 'دفعة الأوراق المحددة غير موجودة.'; end if;
    if v_batch.status not in ('draft','reconciled') then raise exception 'دفعة الأوراق مغلقة ولا تقبل حركات جديدة.'; end if;
    if v_batch.project_id is not null and v_batch.project_id<>p_project_id then
      raise exception 'دفعة الأوراق تخص مشروعاً آخر.';
    end if;
    if nullif(btrim(p_source_ref),'') is null then
      raise exception 'اكتب مرجع الورقة داخل الدفعة قبل الحفظ.';
    end if;
  end if;

  if p_operation in ('attendance','output') then
    v_day_id := public.fn_get_or_create_day(p_project_id,p_work_date);
    if v_day_id is null then raise exception 'تعذر إنشاء يوم التشغيل.'; end if;
  end if;

  if p_operation='attendance' then
    if jsonb_typeof(p_payload->'rows')<>'array' or jsonb_array_length(p_payload->'rows')=0 then
      raise exception 'قائمة الحضور فارغة.';
    end if;
    for v_row in select value from jsonb_array_elements(p_payload->'rows')
    loop
      if nullif(v_row->>'laborer_id','') is null or nullif(v_row->>'status','') is null then
        raise exception 'أحد أسطر الحضور ناقص.';
      end if;
      insert into public.attendance(day_id,laborer_id,status,rate_used)
      values (
        v_day_id,(v_row->>'laborer_id')::uuid,
        (v_row->>'status')::public.attend_status,
        coalesce((v_row->>'rate_used')::numeric,0)
      )
      on conflict(day_id,laborer_id) do update
      set status=excluded.status,rate_used=excluded.rate_used
      returning to_jsonb(attendance) into v_one;
      v_result := v_result || jsonb_build_array(v_one);
      v_ids := array_append(v_ids,(v_one->>'id')::uuid);
    end loop;
    v_entity_table := 'attendance';

  elsif p_operation='output' then
    v_contractor_id := nullif(p_payload->>'contractor_id','')::uuid;
    v_item_id := nullif(p_payload->>'item_id','')::uuid;
    v_qty := nullif(p_payload->>'qty','')::numeric;
    if v_contractor_id is null or v_item_id is null or coalesce(v_qty,0)<=0 then
      raise exception 'المقاول والبند وكمية موجبة مطلوبة.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(':','output',v_day_id::text,v_item_id::text,v_contractor_id::text),0
    ));
    select id into v_entity_id
    from public.day_items
    where day_id=v_day_id and project_item_id=v_item_id and contractor_id=v_contractor_id
    for update;

    if v_entity_id is null then
      insert into public.day_items(day_id,project_item_id,contractor_id,group_output,unit,notes)
      values (v_day_id,v_item_id,v_contractor_id,v_qty,nullif(p_payload->>'unit',''),nullif(btrim(p_payload->>'notes'),''))
      returning id,to_jsonb(day_items) into v_entity_id,v_one;
    else
      update public.day_items
      set group_output=group_output+v_qty,
          unit=coalesce(nullif(p_payload->>'unit',''),unit),
          notes=coalesce(nullif(btrim(p_payload->>'notes'),''),notes)
      where id=v_entity_id
      returning to_jsonb(day_items) into v_one;
    end if;
    v_ids := array[v_entity_id];
    v_result := v_one;
    v_entity_table := 'day_items';

  elsif p_operation='expense' then
    if coalesce(nullif(p_payload->>'amount','')::numeric,0)<=0 then raise exception 'مبلغ المصروف يجب أن يكون أكبر من صفر.'; end if;
    insert into public.contractor_expenses(
      project_id,contractor_id,project_item_id,expense_date,category,amount,
      payer,charge_to,is_recoverable,notes,recorded_by
    ) values (
      p_project_id,(p_payload->>'contractor_id')::uuid,nullif(p_payload->>'project_item_id','')::uuid,
      p_work_date,coalesce(nullif(btrim(p_payload->>'category'),''),'أخرى'),(p_payload->>'amount')::numeric,
      coalesce(nullif(p_payload->>'payer',''),'contractor')::public.expense_payer,
      coalesce(nullif(p_payload->>'charge_to',''),'arkan')::public.charge_to,
      coalesce((p_payload->>'is_recoverable')::boolean,false),nullif(btrim(p_payload->>'notes'),''),auth.uid()
    ) returning id,to_jsonb(contractor_expenses) into v_entity_id,v_one;
    v_ids := array[v_entity_id]; v_result := v_one; v_entity_table := 'contractor_expenses';

  elsif p_operation='advance' then
    if coalesce(nullif(p_payload->>'amount','')::numeric,0)<=0 then raise exception 'مبلغ السلفة يجب أن يكون أكبر من صفر.'; end if;
    insert into public.contractor_advances(project_id,contractor_id,advance_date,amount,notes)
    values (p_project_id,(p_payload->>'contractor_id')::uuid,p_work_date,(p_payload->>'amount')::numeric,nullif(btrim(p_payload->>'notes'),''))
    returning id,to_jsonb(contractor_advances) into v_entity_id,v_one;
    v_ids := array[v_entity_id]; v_result := v_one; v_entity_table := 'contractor_advances';

  elsif p_operation='payment' then
    if coalesce(nullif(p_payload->>'amount','')::numeric,0)<=0 then raise exception 'مبلغ الدفعة يجب أن يكون أكبر من صفر.'; end if;
    insert into public.contractor_payments(
      project_id,contractor_id,payment_date,amount,kind,source,reference,notes,created_by
    ) values (
      p_project_id,(p_payload->>'contractor_id')::uuid,p_work_date,(p_payload->>'amount')::numeric,
      coalesce(nullif(p_payload->>'kind',''),'on_account')::public.contractor_payment_kind,
      coalesce(nullif(p_payload->>'source',''),'bank')::public.payment_source,
      nullif(btrim(p_payload->>'reference'),''),nullif(btrim(p_payload->>'notes'),''),auth.uid()
    ) returning id,to_jsonb(contractor_payments) into v_entity_id,v_one;
    v_ids := array[v_entity_id]; v_result := v_one; v_entity_table := 'contractor_payments';
  end if;

  insert into public.operation_write_receipts(
    request_id,operation_type,project_id,work_date,batch_id,source_kind,source_ref,
    certainty,entity_table,entity_ids,entity_snapshot,payload_fingerprint,saved_by
  ) values (
    p_request_id,p_operation,p_project_id,p_work_date,p_batch_id,p_source_kind,
    nullif(btrim(p_source_ref),''),p_certainty,v_entity_table,v_ids,v_result,
    md5(coalesce(p_payload,'{}'::jsonb)::text),auth.uid()
  ) returning * into v_receipt;

  return jsonb_build_object(
    'receipt_id',v_receipt.id,'receipt_no',v_receipt.receipt_no,
    'request_id',v_receipt.request_id,'operation_type',v_receipt.operation_type,
    'entity_table',v_receipt.entity_table,'entity_ids',v_receipt.entity_ids,
    'entity_snapshot',v_receipt.entity_snapshot,'saved_at',v_receipt.saved_at,
    'verified_at',v_receipt.verified_at,'duplicate_prevented',false
  );
end
$$;

revoke execute on function public.fn_create_operation_entry_batch(text,uuid,date,date,integer,text,text) from public,anon;
revoke execute on function public.fn_close_operation_entry_batch(uuid,text) from public,anon;
revoke execute on function public.fn_safe_site_operation_write(uuid,text,uuid,date,jsonb,uuid,text,text,text) from public,anon;
grant execute on function public.fn_create_operation_entry_batch(text,uuid,date,date,integer,text,text) to authenticated;
grant execute on function public.fn_close_operation_entry_batch(uuid,text) to authenticated;
grant execute on function public.fn_safe_site_operation_write(uuid,text,uuid,date,jsonb,uuid,text,text,text) to authenticated;

-- دفعات المقاولين كانت بلا مشغل تدقيق في القاعدة الحالية.
drop trigger if exists trg_audit_contractor_payments on public.contractor_payments;
create trigger trg_audit_contractor_payments
after insert or update or delete on public.contractor_payments
for each row execute function public.fn_audit();

drop trigger if exists trg_audit_operation_entry_batches on public.operation_entry_batches;
create trigger trg_audit_operation_entry_batches
after insert or update or delete on public.operation_entry_batches
for each row execute function public.fn_audit();

notify pgrst,'reload schema';
