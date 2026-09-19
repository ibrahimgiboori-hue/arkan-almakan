create index if not exists cash_voucher_books_created_by_idx
  on public.cash_voucher_books(created_by);

create index if not exists cash_vouchers_book_idx
  on public.cash_vouchers(book_id);

create index if not exists cash_vouchers_created_by_idx
  on public.cash_vouchers(created_by);

create index if not exists cash_vouchers_voided_by_idx
  on public.cash_vouchers(voided_by)
  where voided_by is not null;
