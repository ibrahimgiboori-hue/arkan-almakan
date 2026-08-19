-- دورة المستخلص الحالية:
-- مسودة القياس -> مطالبة مقدمة -> مطالبة معتمدة -> تم السداد.
-- بعد السداد تطبع مذكرة طلب الفاتورة وترفع الفاتورة الضريبية.
-- حالة invoiced القديمة تبقى للتوافق مع البيانات السابقة ولا تستخدم كمرحلة جديدة.

create or replace function advance_claim(
  p_claim uuid,
  p_to claim_status,
  p_ref text default null,
  p_amount numeric default null
)
returns claim_status
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row progress_claims;
  v_terms integer;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;

  select * into v_row from progress_claims where id=p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;

  select coalesce(payment_terms_days,0) into v_terms
  from projects where id=v_row.project_id;

  if p_to='submitted' then
    update progress_claims
    set status='submitted',
        submitted_at=current_date,
        due_date=case when v_terms>0 then current_date+v_terms else null end
    where id=p_claim;
    return 'submitted';

  elsif p_to='owner_approved' then
    update progress_claims
    set status='owner_approved',
        owner_approved_at=current_date,
        owner_ref=coalesce(nullif(trim(p_ref),''),owner_ref)
    where id=p_claim;
    return 'owner_approved';

  elsif p_to='collected' then
    if v_row.collected_at is not null then
      raise exception 'تم تسجيل سداد هذا المستخلص سابقاً';
    end if;

    update progress_claims
    set status='collected',
        collected_at=current_date,
        collected_amount=coalesce(p_amount,net_payable),
        collect_ref=coalesce(nullif(trim(p_ref),''),collect_ref),
        collection_recorded_by_user_id=auth.uid()
    where id=p_claim;

    update projects
    set advance_recovered=coalesce(advance_recovered,0)+coalesce(v_row.advance_recovery,0)
    where id=v_row.project_id;

    return 'collected';

  elsif p_to='invoiced' then
    update progress_claims
    set invoice_no=coalesce(nullif(trim(p_ref),''),invoice_no),
        invoiced_at=current_date,
        invoice_recorded_by_user_id=auth.uid()
    where id=p_claim;
    return v_row.status;

  elsif p_to='rejected' then
    update progress_claims set status='rejected' where id=p_claim;
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
set search_path=public
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
  set invoice_no=trim(p_invoice_no),
      invoiced_at=coalesce(p_invoice_date,current_date),
      invoice_recorded_by_user_id=auth.uid()
  where id=p_claim;

  return trim(p_invoice_no);
end $$;

revoke all on function record_claim_invoice(uuid,text,date) from public;
grant execute on function record_claim_invoice(uuid,text,date) to authenticated;

create or replace function rollback_claim_one_step(p_claim uuid)
returns claim_status
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row progress_claims;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from progress_claims where id=p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;

  if v_row.status='collected' then
    update projects
    set advance_recovered=greatest(0,coalesce(advance_recovered,0)-coalesce(v_row.advance_recovery,0))
    where id=v_row.project_id;

    update progress_claims
    set status='owner_approved',
        collected_at=null,collected_amount=null,collect_ref=null,
        collection_recorded_by_user_id=null,
        invoice_no=null,invoiced_at=null,invoice_recorded_by_user_id=null
    where id=p_claim;
    return 'owner_approved';

  elsif v_row.status='owner_approved' then
    update progress_claims
    set status='submitted',owner_approved_at=null,owner_ref=null
    where id=p_claim;
    return 'submitted';

  elsif v_row.status='submitted' then
    update progress_claims
    set status='draft',submitted_at=null,due_date=null
    where id=p_claim;
    return 'draft';

  elsif v_row.status='invoiced' then
    update progress_claims
    set status='collected',invoice_no=null,invoiced_at=null,invoice_recorded_by_user_id=null
    where id=p_claim;
    return 'collected';
  end if;

  raise exception 'المستخلص في أول مرحلة أو لا يمكن إرجاع حالته الحالية بهذه الطريقة';
end $$;

revoke all on function rollback_claim_one_step(uuid) from public;
grant execute on function rollback_claim_one_step(uuid) to authenticated;

create or replace function delete_claim_deep(p_claim uuid)
returns table(deleted_no text,files text[])
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row progress_claims;
  v_files text[];
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from progress_claims where id=p_claim for update;
  if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;

  select coalesce(array_agg(file_path) filter(where file_path is not null),'{}')
  into v_files
  from op_attachments
  where entity_type='claim' and entity_id=p_claim;

  if v_row.collected_at is not null then
    update projects
    set advance_recovered=greatest(0,coalesce(advance_recovered,0)-coalesce(v_row.advance_recovery,0))
    where id=v_row.project_id;
  end if;

  update progress_entries set claimed=false,claim_id=null where claim_id=p_claim;
  delete from op_attachments where entity_type='claim' and entity_id=p_claim;
  delete from claim_lines where claim_id=p_claim;
  delete from progress_claims where id=p_claim;

  return query select v_row.claim_no,v_files;
end $$;

revoke all on function delete_claim_deep(uuid) from public;
grant execute on function delete_claim_deep(uuid) to authenticated;

update claim_stage_defs set seq=1,name_ar='مسودة القياس' where stage='draft';
update claim_stage_defs set seq=2,name_ar='مطالبة مقدمة' where stage='submitted';
update claim_stage_defs set seq=3,name_ar='مطالبة معتمدة' where stage='owner_approved';
update claim_stage_defs set seq=4,name_ar='تم السداد' where stage='collected';
update claim_stage_defs set seq=99,name_ar='مفوتر - حالة قديمة' where stage='invoiced';

update claim_stage_docs
set name_ar='محضر قياس وحصر الأعمال',
    hint_ar='يطبع لإثبات الكميات المقاسة واعتمادها بالتوقيع.'
where stage='draft' and code='claim_sheet';

update claim_stage_docs
set name_ar='المطالبة المالية',
    hint_ar='تطبع وترسل للجهة للمطالبة بصرف المستحقات.'
where stage='submitted' and code='cover_letter';

update claim_stage_docs
set name_ar='اعتماد الجهة أو محضر المراجعة',seq=1,
    hint_ar='المستند الوارد من الجهة أو الاستشاري الذي يثبت اعتماد المطالبة.'
where stage='owner_approved' and code='owner_ok';

update claim_stage_docs
set stage='collected',name_ar='مذكرة داخلية لطلب إصدار فاتورة ضريبية',seq=2,required=true,
    hint_ar='تطبع بعد تسجيل السداد لطلب إصدار الفاتورة الضريبية.'
where stage='owner_approved' and code='inv_request';

update claim_stage_docs
set stage='collected',seq=3,required=true,
    hint_ar='ترفع نسخة الفاتورة الضريبية بعد إصدارها.'
where stage='invoiced' and code='tax_invoice';

update claim_stage_docs set seq=1 where stage='collected' and code='payment_proof';

insert into claim_stage_docs(stage,code,seq,name_ar,direction,source,required,hint_ar)
values('collected','payment_receipt_notice',4,'إشعار استلام دفعة','out','system',false,'إشعار صادر للجهة بعد تسجيل استلام الدفعة.')
on conflict(stage,code) do update
set seq=excluded.seq,name_ar=excluded.name_ar,direction=excluded.direction,
    source=excluded.source,required=excluded.required,hint_ar=excluded.hint_ar;
