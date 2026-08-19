-- مراجعة سلامة المستخلصات دون تعديل البيانات التاريخية تلقائياً.

create or replace view v_claim_validation with (security_invoker=true) as
with base as (
  select
    c.*,
    coalesce((select sum(cl.amount) from claim_lines cl where cl.claim_id=c.id),0) as line_total,
    coalesce((select count(*) from progress_entries pe where pe.claim_id=c.id and pe.entry_date>coalesce(c.measurement_date,c.period_to)),0) as entries_after_measurement,
    coalesce((select count(*) from progress_entries pe where pe.claim_id=c.id and pe.entry_date<c.period_from),0) as entries_before_period,
    case
      when c.seq_no=1 then (select min(pe.entry_date) from progress_entries pe where pe.claim_id=c.id)
      else (
        select coalesce(pc.measurement_date,pc.period_to)+1
        from progress_claims pc
        where pc.project_id=c.project_id
          and pc.seq_no<c.seq_no
          and pc.status<>'rejected'
        order by pc.seq_no desc
        limit 1
      )
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
    abs(b.line_total-coalesce(b.gross_amount,0))<0.01
    and abs(coalesce(b.taxable_base,0)-coalesce(b.gross_amount,0))<0.01
    and abs(coalesce(b.vat_amount,0)-round(coalesce(b.gross_amount,0)*coalesce(b.vat_rate,0.15),2))<0.01
    and b.entries_after_measurement=0
    and b.entries_before_period=0
    and (b.expected_period_from is null or b.period_from=b.expected_period_from)
  ) as is_valid,
  array_remove(array[
    case when abs(b.line_total-coalesce(b.gross_amount,0))>=0.01 then 'إجمالي البنود لا يطابق قيمة أعمال المستخلص' end,
    case when abs(coalesce(b.taxable_base,0)-coalesce(b.gross_amount,0))>=0.01 then 'الوعاء الضريبي لا يطابق قيمة أعمال المستخلص الحالي' end,
    case when abs(coalesce(b.vat_amount,0)-round(coalesce(b.gross_amount,0)*coalesce(b.vat_rate,0.15),2))>=0.01 then 'قيمة الضريبة تحتاج مراجعة' end,
    case when b.entries_after_measurement>0 then 'يوجد إنجاز مرتبط بالمستخلص مسجل بعد تاريخ القياس' end,
    case when b.entries_before_period>0 then 'يوجد إنجاز مرتبط بالمستخلص يسبق بداية الفترة' end,
    case when b.expected_period_from is not null and b.period_from<>b.expected_period_from then 'بداية فترة المستخلص لا تطابق التسلسل المعتمد' end
  ],null) as issues
from base b;

-- نحافظ على الأعمدة القديمة أولاً حتى يمكن استبدال الـView في قواعد موجودة مسبقاً.
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
  c.retention_amount,
  c.advance_recovery,
  c.vat_amount,
  c.net_payable,
  c.owner_approved_at as approved_at,
  c.owner_ref,
  c.other_deductions,
  (select count(*) from op_attachments a where a.entity_type='claim' and a.entity_id=c.id and a.doc_code='inv_request') as request_issued,
  (select count(*) from op_attachments a where a.entity_type='claim' and a.entity_id=c.id and a.doc_code='tax_invoice') as invoice_uploaded,
  (select a.ref_no from op_attachments a where a.entity_type='claim' and a.entity_id=c.id and a.doc_code='inv_request' order by a.created_at desc limit 1) as request_ref,
  c.taxable_base,
  c.collected_at,
  c.collected_amount,
  c.collect_ref,
  c.invoice_no,
  c.invoiced_at
from progress_claims c
left join v_project_client vc on vc.project_id=c.project_id
where c.collected_at is not null
  and (
    c.invoice_no is null
    or c.invoiced_at is null
    or not exists(
      select 1 from op_attachments a
      where a.entity_type='claim'
        and a.entity_id=c.id
        and a.doc_code='tax_invoice'
    )
  );
