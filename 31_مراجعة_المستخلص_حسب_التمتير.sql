-- المستخلص المدمج لا يفرض فترة واحدة على البنود.
-- النطاق العام في رأس المستخلص هو أقدم بداية وأحدث تاريخ قياس، بينما المرجع الحقيقي هو فترة كل تمتير داخل التفاصيل.

drop trigger if exists trg_audit_item_measurements on item_measurements;
create trigger trg_audit_item_measurements
after insert or update or delete on item_measurements
for each row execute function fn_audit();

create or replace view v_claim_validation with (security_invoker=true) as
with base as (
  select c.*,
    coalesce((select sum(cl.amount) from claim_lines cl where cl.claim_id=c.id),0) line_total,
    coalesce((select count(*) from claim_lines cl where cl.claim_id=c.id and cl.measurement_id is not null),0) measurement_count,
    coalesce((select count(*) from claim_lines cl where cl.claim_id=c.id and cl.measurement_id is not null and (cl.measurement_period_from is null or cl.measurement_period_to is null)),0) incomplete_measurements,
    (select min(cl.measurement_period_from) from claim_lines cl where cl.claim_id=c.id and cl.measurement_id is not null) measurement_min_from,
    (select max(cl.measurement_period_to) from claim_lines cl where cl.claim_id=c.id and cl.measurement_id is not null) measurement_max_to,
    coalesce((select count(*) from item_measurements m where m.claim_id=c.id and m.status<>'claimed'),0) bad_measurement_links,
    coalesce((select count(*) from progress_entries pe where pe.claim_id=c.id and pe.entry_date>coalesce(c.measurement_date,c.period_to)),0) entries_after_measurement,
    coalesce((select count(*) from progress_entries pe where pe.claim_id=c.id and pe.entry_date<c.period_from),0) entries_before_period,
    case
      when coalesce((select count(*) from claim_lines cl where cl.claim_id=c.id and cl.measurement_id is not null),0)>0 then null::date
      when c.seq_no=1 then (select min(pe.entry_date) from progress_entries pe where pe.claim_id=c.id)
      else (
        select coalesce(pc.measurement_date,pc.period_to)+1 from progress_claims pc
        where pc.project_id=c.project_id and pc.seq_no<c.seq_no and pc.status<>'rejected'
        order by pc.seq_no desc limit 1
      )
    end expected_period_from
  from progress_claims c
)
select
  b.id claim_id,b.claim_no,b.project_id,b.status,b.period_from,b.period_to,b.measurement_date,b.expected_period_from,
  b.line_total,b.gross_amount,b.taxable_base,b.vat_amount,b.net_payable,b.entries_after_measurement,b.entries_before_period,
  (
    abs(b.line_total-coalesce(b.gross_amount,0))<0.01
    and abs(coalesce(b.taxable_base,0)-coalesce(b.gross_amount,0))<0.01
    and abs(coalesce(b.vat_amount,0)-round(coalesce(b.gross_amount,0)*coalesce(b.vat_rate,0.15),2))<0.01
    and case when b.measurement_count>0 then
      b.incomplete_measurements=0 and b.bad_measurement_links=0
      and b.period_from=b.measurement_min_from and b.period_to=b.measurement_max_to
    else
      b.entries_after_measurement=0 and b.entries_before_period=0
      and (b.expected_period_from is null or b.period_from=b.expected_period_from)
    end
  ) is_valid,
  array_remove(array[
    case when abs(b.line_total-coalesce(b.gross_amount,0))>=0.01 then 'إجمالي البنود لا يطابق قيمة أعمال المستخلص' end,
    case when abs(coalesce(b.taxable_base,0)-coalesce(b.gross_amount,0))>=0.01 then 'الوعاء الضريبي لا يطابق قيمة أعمال المستخلص الحالي' end,
    case when abs(coalesce(b.vat_amount,0)-round(coalesce(b.gross_amount,0)*coalesce(b.vat_rate,0.15),2))>=0.01 then 'قيمة الضريبة تحتاج مراجعة' end,
    case when b.measurement_count>0 and b.incomplete_measurements>0 then 'يوجد تمتير داخل المستخلص ناقص الفترة' end,
    case when b.measurement_count>0 and b.bad_measurement_links>0 then 'ربط التمتير بالمستخلص يحتاج مراجعة' end,
    case when b.measurement_count>0 and b.period_from<>b.measurement_min_from then 'بداية النطاق العام للمستخلص لا تطابق أقدم تمتير بداخله' end,
    case when b.measurement_count>0 and b.period_to<>b.measurement_max_to then 'نهاية النطاق العام للمستخلص لا تطابق أحدث تمتير بداخله' end,
    case when b.measurement_count=0 and b.entries_after_measurement>0 then 'يوجد إنجاز مرتبط بالمستخلص مسجل بعد تاريخ القياس' end,
    case when b.measurement_count=0 and b.entries_before_period>0 then 'يوجد إنجاز مرتبط بالمستخلص يسبق بداية الفترة' end,
    case when b.measurement_count=0 and b.expected_period_from is not null and b.period_from<>b.expected_period_from then 'بداية فترة المستخلص لا تطابق التسلسل المعتمد' end
  ],null) issues,
  b.measurement_count,b.incomplete_measurements,b.measurement_min_from,b.measurement_max_to
from base b;
