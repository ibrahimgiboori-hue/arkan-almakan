alter table public.cash_vouchers
  add column if not exists party_nationality text;

update public.cash_vouchers
set party_nationality='مصري'
where status='posted'
  and voucher_type='payment'
  and party_name='ابراهيم توفيق عبدالرحمن توفيق'
  and voucher_no in ('PYV-002-04','PYV-002-25','PYV-002-69');
