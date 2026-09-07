-- توحيد ضريبة القيمة المضافة في مطالبات المشاريع الداخلية والخدمات الخارجية.

-- المطالبات الخارجية (تايم شيت المقاول الخارجي) كانت بلا إعداد ضريبي.
alter table if exists public.contractor_external_timesheets
  add column if not exists vat_rate numeric(6,5) not null default 0.15;

alter table if exists public.contractor_external_timesheets
  drop constraint if exists contractor_external_timesheets_vat_rate_check;

alter table if exists public.contractor_external_timesheets
  add constraint contractor_external_timesheets_vat_rate_check
  check (vat_rate >= 0 and vat_rate <= 1);

update public.contractor_external_timesheets
set vat_rate = 0.15
where vat_rate is null;

-- حماية المطالبات الداخلية القديمة: أكمل البيانات الضريبية القابلة للتحديث فقط
-- عند نقصها، مع احترام معدل المشروع. صافي المستحق عمود مولّد ولا يُحدّث يدويًا.
update public.progress_claims pc
set
  vat_rate = coalesce(pc.vat_rate, p.vat_rate, 0.15),
  taxable_base = coalesce(pc.taxable_base, round(greatest(coalesce(pc.gross_amount,0),0),2)),
  vat_amount = case
    when pc.vat_rate is null or pc.taxable_base is null
      then round(greatest(coalesce(pc.gross_amount,0),0) * coalesce(pc.vat_rate,p.vat_rate,0.15),2)
    else pc.vat_amount
  end
from public.projects p
where p.id = pc.project_id
  and (
    pc.vat_rate is null
    or pc.taxable_base is null
  );

comment on column public.contractor_external_timesheets.vat_rate is
  'VAT rate applied to the provisional external contractor claim. 0.15 means 15%.';
