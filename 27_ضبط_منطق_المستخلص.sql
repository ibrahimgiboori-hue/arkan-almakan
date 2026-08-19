-- ضبط منطق المستخلصات دون كسر البيانات التاريخية

alter table progress_claims add column if not exists measurement_date date;
alter table progress_claims add column if not exists measurement_recorded_by_user_id uuid;
alter table progress_claims add column if not exists collect_ref text;
alter table progress_claims add column if not exists collection_recorded_by_user_id uuid;
alter table progress_claims add column if not exists invoice_recorded_by_user_id uuid;

update progress_claims
set measurement_date = coalesce(measurement_date, period_to)
where measurement_date is null;

alter table progress_claims drop constraint if exists progress_claims_period_order_check;
alter table progress_claims add constraint progress_claims_period_order_check
check (period_from is null or period_to is null or period_from <= period_to);

-- gross_amount في النظام يمثل قيمة أعمال المستخلص الحالي، وليس القيمة التراكمية.
-- prev_cumulative يمثل مجموع أعمال المستخلصات السابقة للعرض والمراجعة فقط.
create or replace function calc_claim_vat()
returns trigger
language plpgsql
as $$
declare
  v_rate numeric;
  v_base numeric;
begin
  v_rate := coalesce(
    new.vat_rate,
    (select vat_rate from projects where id = new.project_id),
    0.15
  );
  new.vat_rate := v_rate;

  v_base := greatest(coalesce(new.gross_amount, 0), 0);
  new.taxable_base := round(v_base, 2);
  new.vat_amount := round(v_base * v_rate, 2);

  new.net_payable := round(
      v_base
    + new.vat_amount
    - coalesce(new.retention_amount, 0)
    - coalesce(new.advance_recovery, 0)
    - coalesce(new.other_deductions, 0)
  , 2);

  return new;
end $$;

-- إنشاء المستخلص من القياس في عملية واحدة حتى لا تتجزأ البيانات بين المستخلص والبنود والإنجاز.
create or replace function create_progress_claim(
  p_project uuid,
  p_measurement_date date default current_date
)
returns table (
  claim_id uuid,
  claim_no text,
  period_from date,
  period_to date,
  gross_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project projects;
  v_prev progress_claims;
  v_from date;
  v_first_execution date;
  v_seq integer;
  v_no text;
  v_claim uuid;
  v_gross numeric(14,2);
  v_prev_cum numeric(14,2);
  v_retention numeric(14,2);
  v_old_unclaimed integer;
  v_entries integer;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول لإنشاء المستخلص';
  end if;

  if p_measurement_date is null then
    raise exception 'تاريخ القياس مطلوب';
  end if;

  if p_measurement_date > current_date then
    raise exception 'تاريخ القياس لا يمكن أن يكون في المستقبل';
  end if;

  select * into v_project from projects where id = p_project;
  if v_project.id is null then
    raise exception 'المشروع غير موجود';
  end if;

  select * into v_prev
  from progress_claims
  where project_id = p_project
    and status <> 'rejected'
  order by seq_no desc
  limit 1;

  if v_prev.id is null then
    select min(pe.entry_date) into v_first_execution
    from progress_entries pe
    join project_items pi on pi.id = pe.project_item_id
    where pi.project_id = p_project
      and pe.claimed = false
      and pe.entry_date <= p_measurement_date;

    if v_first_execution is null then
      raise exception 'لا يوجد إنجاز مسجل حتى تاريخ القياس المحدد';
    end if;
    v_from := v_first_execution;
  else
    if p_measurement_date <= coalesce(v_prev.measurement_date, v_prev.period_to) then
      raise exception 'تاريخ القياس يجب أن يكون بعد تاريخ قياس المستخلص السابق';
    end if;
    v_from := coalesce(v_prev.measurement_date, v_prev.period_to) + 1;
  end if;

  select count(*) into v_old_unclaimed
  from progress_entries pe
  join project_items pi on pi.id = pe.project_item_id
  where pi.project_id = p_project
    and pe.claimed = false
    and pe.entry_date < v_from;

  if v_old_unclaimed > 0 then
    raise exception 'يوجد إنجاز غير مطالب به يسبق بداية الفترة الحالية؛ راجعه قبل إنشاء المستخلص';
  end if;

  select count(*), round(coalesce(sum(pe.qty_done * pi.sell_price),0),2)
    into v_entries, v_gross
  from progress_entries pe
  join project_items pi on pi.id = pe.project_item_id
  where pi.project_id = p_project
    and pe.claimed = false
    and pe.entry_date between v_from and p_measurement_date;

  if v_entries = 0 or v_gross <= 0 then
    raise exception 'لا يوجد إنجاز غير مطالب به ضمن فترة القياس المحددة';
  end if;

  select coalesce(max(seq_no),0) + 1,
         round(coalesce(sum(gross_amount) filter (where status <> 'rejected'),0),2)
    into v_seq, v_prev_cum
  from progress_claims
  where project_id = p_project;

  v_no := next_document_number('CLAIM','CLM');
  v_retention := round(v_gross * coalesce(v_project.retention_pct,0),2);

  insert into progress_claims (
    project_id, claim_no, seq_no,
    period_from, period_to, measurement_date,
    gross_amount, prev_cumulative, retention_amount,
    vat_rate, status, created_by, measurement_recorded_by_user_id
  ) values (
    p_project, v_no, v_seq,
    v_from, p_measurement_date, p_measurement_date,
    v_gross, v_prev_cum, v_retention,
    coalesce(v_project.vat_rate,0.15), 'draft', auth.uid(), auth.uid()
  ) returning id into v_claim;

  insert into claim_lines (
    claim_id, project_item_id, qty_previous, qty_this, unit_price, amount
  )
  select
    v_claim,
    pi.id,
    coalesce((
      select sum(cl.qty_this)
      from claim_lines cl
      join progress_claims pc on pc.id = cl.claim_id
      where cl.project_item_id = pi.id
        and pc.status <> 'rejected'
        and pc.id <> v_claim
    ),0),
    sum(pe.qty_done),
    pi.sell_price,
    round(sum(pe.qty_done) * pi.sell_price,2)
  from progress_entries pe
  join project_items pi on pi.id = pe.project_item_id
  where pi.project_id = p_project
    and pe.claimed = false
    and pe.entry_date between v_from and p_measurement_date
  group by pi.id, pi.sell_price;

  update progress_entries pe
  set claimed = true,
      claim_id = v_claim
  from project_items pi
  where pi.id = pe.project_item_id
    and pi.project_id = p_project
    and pe.claimed = false
    and pe.entry_date between v_from and p_measurement_date;

  return query
  select v_claim, v_no, v_from, p_measurement_date, v_gross;
end $$;

revoke all on function create_progress_claim(uuid,date) from public;
grant execute on function create_progress_claim(uuid,date) to authenticated;

-- تحريك المستخلص: المستخدم الحالي يسجل الواقعة، ولا يُفترض أنه صاحب القرار الإداري.
create or replace function advance_claim(
  p_claim uuid,
  p_to claim_status,
  p_ref text default null,
  p_amount numeric default null
)
returns claim_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row progress_claims;
  v_terms integer;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  select * into v_row from progress_claims where id = p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;

  select coalesce(payment_terms_days,0) into v_terms from projects where id = v_row.project_id;

  if p_to = 'submitted' then
    update progress_claims
    set status = 'submitted',
        submitted_at = current_date,
        due_date = case when v_terms > 0 then current_date + v_terms else null end
    where id = p_claim;
    return 'submitted';

  elsif p_to = 'owner_approved' then
    update progress_claims
    set status = 'owner_approved',
        owner_approved_at = current_date,
        owner_ref = coalesce(nullif(trim(p_ref),''), owner_ref)
    where id = p_claim;
    return 'owner_approved';

  elsif p_to = 'collected' then
    if v_row.collected_at is not null then
      raise exception 'تم تسجيل سداد هذا المستخلص سابقاً';
    end if;

    update progress_claims
    set status = 'collected',
        collected_at = current_date,
        collected_amount = coalesce(p_amount, net_payable),
        collect_ref = coalesce(nullif(trim(p_ref),''), collect_ref),
        collection_recorded_by_user_id = auth.uid()
    where id = p_claim;

    update projects
    set advance_recovered = coalesce(advance_recovered,0) + coalesce(v_row.advance_recovery,0)
    where id = v_row.project_id;

    return 'collected';

  elsif p_to = 'invoiced' then
    -- حالة قديمة مدعومة للتوافق، بينما المسار الجديد يسجل الفاتورة دون تغيير حالة السداد.
    update progress_claims
    set invoice_no = coalesce(nullif(trim(p_ref),''), invoice_no),
        invoiced_at = current_date,
        invoice_recorded_by_user_id = auth.uid()
    where id = p_claim;
    return v_row.status;

  elsif p_to = 'rejected' then
    update progress_claims set status = 'rejected' where id = p_claim;
    return 'rejected';
  end if;

  raise exception 'حالة غير مدعومة';
end $$;

revoke all on function advance_claim(uuid,claim_status,text,numeric) from public;
grant execute on function advance_claim(uuid,claim_status,text,numeric) to authenticated;

create or replace function record_claim_invoice(
  p_claim uuid,
  p_invoice_no text,
  p_invoice_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row progress_claims;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from progress_claims where id=p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;
  if v_row.collected_at is null then raise exception 'لا تسجل الفاتورة قبل تسجيل السداد في هذا المسار'; end if;
  if nullif(trim(p_invoice_no),'') is null then raise exception 'رقم الفاتورة مطلوب'; end if;

  update progress_claims
  set invoice_no = trim(p_invoice_no),
      invoiced_at = coalesce(p_invoice_date,current_date),
      invoice_recorded_by_user_id = auth.uid()
  where id=p_claim;

  return trim(p_invoice_no);
end $$;

revoke all on function record_claim_invoice(uuid,text,date) from public;
grant execute on function record_claim_invoice(uuid,text,date) to authenticated;

create or replace function rollback_claim_one_step(p_claim uuid)
returns claim_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row progress_claims;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from progress_claims where id=p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;

  if v_row.status = 'collected' then
    update projects
    set advance_recovered = greatest(0, coalesce(advance_recovered,0) - coalesce(v_row.advance_recovery,0))
    where id = v_row.project_id;

    update progress_claims
    set status='owner_approved', collected_at=null, collected_amount=null,
        collect_ref=null, collection_recorded_by_user_id=null,
        invoice_no=null, invoiced_at=null, invoice_recorded_by_user_id=null
    where id=p_claim;
    return 'owner_approved';

  elsif v_row.status = 'owner_approved' then
    update progress_claims
    set status='submitted', owner_approved_at=null, owner_ref=null
    where id=p_claim;
    return 'submitted';

  elsif v_row.status = 'submitted' then
    update progress_claims
    set status='draft', submitted_at=null, due_date=null
    where id=p_claim;
    return 'draft';

  elsif v_row.status = 'invoiced' then
    update progress_claims
    set status='collected', invoice_no=null, invoiced_at=null, invoice_recorded_by_user_id=null
    where id=p_claim;
    return 'collected';
  end if;

  raise exception 'المستخلص في أول مرحلة أو لا يمكن إرجاع حالته الحالية بهذه الطريقة';
end $$;

revoke all on function rollback_claim_one_step(uuid) from public;
grant execute on function rollback_claim_one_step(uuid) to authenticated;

create or replace function delete_claim_deep(p_claim uuid)
returns table(deleted_no text, files text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row progress_claims;
  v_files text[];
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from progress_claims where id=p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;

  select coalesce(array_agg(file_path) filter (where file_path is not null), '{}')
  into v_files
  from op_attachments
  where entity_type='claim' and entity_id=p_claim;

  if v_row.collected_at is not null then
    update projects
    set advance_recovered = greatest(0, coalesce(advance_recovered,0) - coalesce(v_row.advance_recovery,0))
    where id=v_row.project_id;
  end if;

  update progress_entries set claimed=false, claim_id=null where claim_id=p_claim;
  delete from op_attachments where entity_type='claim' and entity_id=p_claim;
  delete from claim_lines where claim_id=p_claim;
  delete from progress_claims where id=p_claim;

  return query select v_row.claim_no, v_files;
end $$;

revoke all on function delete_claim_deep(uuid) from public;
grant execute on function delete_claim_deep(uuid) to authenticated;

-- دورة المستندات الجديدة: السداد يسبق طلب الفاتورة في هذا المسار التشغيلي.
update claim_stage_defs set seq=1, name_ar='مسودة القياس' where stage='draft';
update claim_stage_defs set seq=2, name_ar='مطالبة مقدمة' where stage='submitted';
update claim_stage_defs set seq=3, name_ar='مطالبة معتمدة' where stage='owner_approved';
update claim_stage_defs set seq=5, name_ar='تم السداد' where stage='collected';
update claim_stage_defs set seq=4, name_ar='مفوتر - حالة قديمة' where stage='invoiced';

update claim_stage_docs
set name_ar='محضر قياس وحصر الأعمال', hint_ar='يطبع لإثبات الكميات المقاسة واعتمادها بالتوقيع.'
where stage='draft' and code='claim_sheet';

update claim_stage_docs
set name_ar='المطالبة المالية', hint_ar='تطبع وترسل للجهة للمطالبة بصرف المستحقات.'
where stage='submitted' and code='cover_letter';

update claim_stage_docs
set stage='collected', name_ar='مذكرة داخلية لطلب إصدار فاتورة ضريبية', required=true,
    hint_ar='تطبع بعد تسجيل السداد لطلب إصدار الفاتورة الضريبية.'
where stage='owner_approved' and code='inv_request';

update claim_stage_docs
set stage='collected', required=true,
    hint_ar='ترفع نسخة الفاتورة الضريبية بعد إصدارها.'
where stage='invoiced' and code='tax_invoice';

insert into claim_stage_docs(stage, code, seq, name_ar, direction, source, required, hint_ar)
values ('collected','payment_receipt_notice',4,'إشعار استلام دفعة','out','system',false,'إشعار صادر للجهة بعد تسجيل استلام الدفعة.')
on conflict (stage,code) do update
set seq=excluded.seq,name_ar=excluded.name_ar,direction=excluded.direction,source=excluded.source,required=excluded.required,hint_ar=excluded.hint_ar;

-- فحص سلامة كل مستخلص دون تعديل بياناته تلقائياً.
create or replace view v_claim_validation with (security_invoker=true) as
with base as (
  select
    c.*,
    coalesce((select sum(cl.amount) from claim_lines cl where cl.claim_id=c.id),0) as line_total,
    coalesce((select count(*) from progress_entries pe where pe.claim_id=c.id and pe.entry_date > coalesce(c.measurement_date,c.period_to)),0) as entries_after_measurement,
    coalesce((select count(*) from progress_entries pe where pe.claim_id=c.id and pe.entry_date < c.period_from),0) as entries_before_period,
    case
      when c.seq_no = 1 then (select min(pe.entry_date) from progress_entries pe where pe.claim_id=c.id)
      else (select coalesce(pc.measurement_date,pc.period_to)+1 from progress_claims pc where pc.project_id=c.project_id and pc.seq_no<c.seq_no and pc.status<>'rejected' order by pc.seq_no desc limit 1)
    end as expected_period_from
  from progress_claims c
)
select
  b.id as claim_id,
  b.claim_no,
  b.project_id,
  b.status,
  b.period_from,
  b.period_to,
  b.measurement_date,
  b.expected_period_from,
  b.line_total,
  b.gross_amount,
  b.taxable_base,
  b.vat_amount,
  b.net_payable,
  b.entries_after_measurement,
  b.entries_before_period,
  (
    abs(b.line_total - coalesce(b.gross_amount,0)) < 0.01
    and abs(coalesce(b.taxable_base,0) - coalesce(b.gross_amount,0)) < 0.01
    and abs(coalesce(b.vat_amount,0) - round(coalesce(b.gross_amount,0)*coalesce(b.vat_rate,0.15),2)) < 0.01
    and b.entries_after_measurement = 0
    and b.entries_before_period = 0
    and (b.expected_period_from is null or b.period_from=b.expected_period_from)
  ) as is_valid,
  array_remove(array[
    case when abs(b.line_total - coalesce(b.gross_amount,0)) >= 0.01 then 'إجمالي البنود لا يطابق قيمة أعمال المستخلص' end,
    case when abs(coalesce(b.taxable_base,0) - coalesce(b.gross_amount,0)) >= 0.01 then 'الوعاء الضريبي لا يطابق قيمة أعمال المستخلص الحالي' end,
    case when abs(coalesce(b.vat_amount,0) - round(coalesce(b.gross_amount,0)*coalesce(b.vat_rate,0.15),2)) >= 0.01 then 'قيمة الضريبة تحتاج مراجعة' end,
    case when b.entries_after_measurement > 0 then 'يوجد إنجاز مرتبط بالمستخلص مسجل بعد تاريخ القياس' end,
    case when b.entries_before_period > 0 then 'يوجد إنجاز مرتبط بالمستخلص يسبق بداية الفترة' end,
    case when b.expected_period_from is not null and b.period_from<>b.expected_period_from then 'بداية فترة المستخلص لا تطابق التسلسل المعتمد' end
  ],null) as issues
from base b;

create or replace view v_invoice_queue with (security_invoker=true) as
select
  c.id as claim_id,
  c.claim_no,
  c.project_id,
  vc.project_name,
  vc.client_name,
  vc.client_vat_no,
  c.period_from,
  c.period_to,
  c.gross_amount,
  c.taxable_base,
  c.retention_amount,
  c.advance_recovery,
  c.other_deductions,
  c.vat_amount,
  c.net_payable,
  c.collected_at,
  c.collected_amount,
  c.collect_ref,
  c.invoice_no,
  c.invoiced_at,
  (select count(*) from op_attachments a where a.entity_type='claim' and a.entity_id=c.id and a.doc_code='inv_request') as request_issued,
  (select count(*) from op_attachments a where a.entity_type='claim' and a.entity_id=c.id and a.doc_code='tax_invoice') as invoice_uploaded
from progress_claims c
left join v_project_client vc on vc.project_id=c.project_id
where c.collected_at is not null
  and (c.invoice_no is null or c.invoiced_at is null or not exists (
    select 1 from op_attachments a where a.entity_type='claim' and a.entity_id=c.id and a.doc_code='tax_invoice'
  ));
