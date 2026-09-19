
create table if not exists public.cash_voucher_books (
  id uuid primary key default gen_random_uuid(),
  voucher_type text not null check (voucher_type in ('receipt','payment')),
  book_no integer not null check (book_no > 0),
  first_page smallint not null default 1 check (first_page = 1),
  last_page smallint not null default 100 check (last_page = 100),
  next_page smallint not null default 1 check (next_page between 1 and 101),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid not null references public.app_users(id),
  unique (voucher_type, book_no)
);

create unique index if not exists cash_voucher_books_one_open_per_type_idx
  on public.cash_voucher_books(voucher_type)
  where status = 'open';

create table if not exists public.cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_type text not null check (voucher_type in ('receipt','payment')),
  book_id uuid not null references public.cash_voucher_books(id),
  book_no integer not null check (book_no > 0),
  page_no smallint not null check (page_no between 1 and 100),
  voucher_no text not null unique,
  voucher_date date not null default current_date,
  account_id uuid not null references public.treasury_accounts(id),
  project_id uuid references public.projects(id),
  party_name text not null,
  party_id_kind text check (party_id_kind is null or party_id_kind in ('national_id','iqama','cr','passport','other')),
  party_id_number text,
  party_mobile text,
  party_address text,
  amount numeric(18,2) not null check (amount > 0),
  amount_words text not null,
  currency text not null default 'SAR' check (char_length(currency) = 3),
  payment_method text not null default 'cash' check (payment_method in ('cash','bank_transfer','cheque','card','other')),
  bank_name text,
  payment_reference text,
  payment_date date,
  description text not null,
  supporting_reference text,
  legal_text_snapshot text not null,
  treasury_movement_id uuid not null unique references public.treasury_movements(id),
  status text not null default 'posted' check (status in ('posted','void')),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  voided_by uuid references public.app_users(id),
  voided_at timestamptz,
  void_reason text,
  unique (voucher_type, book_no, page_no)
);

create index if not exists cash_vouchers_date_idx
  on public.cash_vouchers(voucher_date desc, created_at desc);
create index if not exists cash_vouchers_account_idx
  on public.cash_vouchers(account_id, voucher_date desc);
create index if not exists cash_vouchers_project_idx
  on public.cash_vouchers(project_id, voucher_date desc)
  where project_id is not null;

alter table public.cash_voucher_books enable row level security;
alter table public.cash_vouchers enable row level security;

drop policy if exists cash_voucher_books_finance_read on public.cash_voucher_books;
create policy cash_voucher_books_finance_read
  on public.cash_voucher_books for select
  to authenticated
  using (public.has_capability('finance.treasury.view','all',null,null));

drop policy if exists cash_vouchers_finance_read on public.cash_vouchers;
create policy cash_vouchers_finance_read
  on public.cash_vouchers for select
  to authenticated
  using (public.has_capability('finance.treasury.view','all',null,amount));

revoke all on public.cash_voucher_books from anon;
revoke all on public.cash_vouchers from anon;
revoke insert, update, delete, truncate, references, trigger on public.cash_voucher_books from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.cash_vouchers from authenticated;
grant select on public.cash_voucher_books to authenticated;
grant select on public.cash_vouchers to authenticated;

create or replace function public.fn_cash_voucher_issue(
  p_voucher_type text,
  p_account_id uuid,
  p_amount numeric,
  p_amount_words text,
  p_voucher_date date default current_date,
  p_party_name text default null,
  p_party_id_kind text default null,
  p_party_id_number text default null,
  p_party_mobile text default null,
  p_party_address text default null,
  p_payment_method text default 'cash',
  p_bank_name text default null,
  p_payment_reference text default null,
  p_payment_date date default null,
  p_description text default null,
  p_supporting_reference text default null,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_capability text;
  v_book public.cash_voucher_books%rowtype;
  v_account public.treasury_accounts%rowtype;
  v_book_no integer;
  v_page smallint;
  v_voucher_id uuid := gen_random_uuid();
  v_movement_id uuid;
  v_voucher_no text;
  v_direction text;
  v_balance numeric;
  v_company text;
  v_legal text;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_voucher_type not in ('receipt','payment') then raise exception 'نوع السند غير صحيح'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;
  if nullif(trim(coalesce(p_amount_words,'')),'') is null then raise exception 'تفقيط المبلغ مطلوب'; end if;
  if nullif(trim(coalesce(p_party_name,'')),'') is null then raise exception 'اسم الطرف مطلوب'; end if;
  if nullif(trim(coalesce(p_description,'')),'') is null then raise exception 'سبب السند مطلوب'; end if;
  if p_party_id_kind is not null and p_party_id_kind not in ('national_id','iqama','cr','passport','other') then raise exception 'نوع هوية الطرف غير صحيح'; end if;
  if coalesce(p_payment_method,'cash') not in ('cash','bank_transfer','cheque','card','other') then raise exception 'طريقة الدفع غير صحيحة'; end if;

  v_capability := case when p_voucher_type='receipt' then 'finance.treasury.collect' else 'finance.treasury.pay' end;
  if not public.has_capability(v_capability,'all',null,p_amount) then
    raise exception 'لا تملك صلاحية إصدار هذا السند بالمبلغ المحدد';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cash-voucher-book:'||p_voucher_type,0));

  select * into v_book
  from public.cash_voucher_books
  where voucher_type=p_voucher_type and status='open'
  order by book_no desc
  limit 1
  for update;

  if v_book.id is null or v_book.next_page > 100 then
    if v_book.id is not null then
      update public.cash_voucher_books
      set status='closed', closed_at=coalesce(closed_at,now())
      where id=v_book.id;
    end if;

    select coalesce(max(book_no),0)+1 into v_book_no
    from public.cash_voucher_books
    where voucher_type=p_voucher_type;

    insert into public.cash_voucher_books(voucher_type,book_no,created_by)
    values(p_voucher_type,v_book_no,v_uid)
    returning * into v_book;
  end if;

  v_page := v_book.next_page;
  v_voucher_no := (case when p_voucher_type='receipt' then 'RCV' else 'PYV' end)
    || '-' || lpad(v_book.book_no::text,3,'0')
    || '-' || lpad(v_page::text,3,'0');

  select * into v_account
  from public.treasury_accounts
  where id=p_account_id and is_active=true
  for update;

  if v_account.id is null then raise exception 'حساب الصندوق أو البنك غير موجود أو غير نشط'; end if;

  v_direction := case when p_voucher_type='receipt' then 'inflow' else 'outflow' end;
  if v_direction='outflow' and not v_account.allow_negative then
    v_balance := coalesce(public.fn_treasury_current_balance(p_account_id),0);
    if v_balance < p_amount then raise exception 'رصيد الحساب لا يكفي لإصدار سند الصرف'; end if;
  end if;

  select coalesce(company_name_ar,'شركة أركان المكان للمقاولات')
  into v_company
  from public.app_settings
  where id=1;
  v_company := coalesce(v_company,'شركة أركان المكان للمقاولات');

  if p_voucher_type='receipt' then
    v_legal := 'استلمنا نحن '||v_company||' من السيد/الجهة '||trim(p_party_name)
      ||' مبلغًا وقدره '||trim(p_amount_words)||' فقط لا غير، وذلك عن '||trim(p_description)||'.';
  else
    v_legal := 'استلمت أنا الموقّع أدناه '||trim(p_party_name)||' من '||v_company
      ||' مبلغًا وقدره '||trim(p_amount_words)||' فقط لا غير، وذلك مقابل '||trim(p_description)
      ||'، وأقر باستلام المبلغ كاملًا.';
  end if;

  insert into public.treasury_movements(
    account_id,movement_date,direction,amount,movement_type,source_type,source_id,source_ref,
    project_id,counterparty_type,counterparty_name,reference,notes,recorded_by
  ) values (
    p_account_id,coalesce(p_voucher_date,current_date),v_direction,round(p_amount,2),
    case when p_voucher_type='receipt' then 'cash_receipt_voucher' else 'cash_payment_voucher' end,
    'cash_voucher',v_voucher_id,v_voucher_no,p_project_id,'external',trim(p_party_name),
    nullif(trim(coalesce(p_payment_reference,'')),''),
    trim(p_description),v_uid
  ) returning id into v_movement_id;

  insert into public.cash_vouchers(
    id,voucher_type,book_id,book_no,page_no,voucher_no,voucher_date,account_id,project_id,
    party_name,party_id_kind,party_id_number,party_mobile,party_address,amount,amount_words,
    payment_method,bank_name,payment_reference,payment_date,description,supporting_reference,
    legal_text_snapshot,treasury_movement_id,created_by
  ) values (
    v_voucher_id,p_voucher_type,v_book.id,v_book.book_no,v_page,v_voucher_no,
    coalesce(p_voucher_date,current_date),p_account_id,p_project_id,trim(p_party_name),
    p_party_id_kind,nullif(trim(coalesce(p_party_id_number,'')),''),
    nullif(trim(coalesce(p_party_mobile,'')),''),
    nullif(trim(coalesce(p_party_address,'')),''),
    round(p_amount,2),trim(p_amount_words),coalesce(p_payment_method,'cash'),
    nullif(trim(coalesce(p_bank_name,'')),''),
    nullif(trim(coalesce(p_payment_reference,'')),''),
    p_payment_date,trim(p_description),
    nullif(trim(coalesce(p_supporting_reference,'')),''),
    v_legal,v_movement_id,v_uid
  );

  update public.cash_voucher_books
  set next_page=v_page+1,
      status=case when v_page=100 then 'closed' else 'open' end,
      closed_at=case when v_page=100 then now() else closed_at end
  where id=v_book.id;

  return jsonb_build_object(
    'id',v_voucher_id,
    'voucher_no',v_voucher_no,
    'book_no',v_book.book_no,
    'page_no',v_page,
    'treasury_movement_id',v_movement_id
  );
end;
$function$;

create or replace function public.fn_cash_voucher_void(
  p_voucher_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_voucher public.cash_vouchers%rowtype;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'سبب إلغاء السند مطلوب'; end if;

  select * into v_voucher
  from public.cash_vouchers
  where id=p_voucher_id and status='posted'
  for update;

  if v_voucher.id is null then raise exception 'السند غير موجود أو ملغى سابقًا'; end if;

  perform public.fn_treasury_void_movement(v_voucher.treasury_movement_id,trim(p_reason));

  update public.cash_vouchers
  set status='void',voided_by=v_uid,voided_at=now(),void_reason=trim(p_reason)
  where id=p_voucher_id and status='posted';

  return true;
end;
$function$;

revoke all on function public.fn_cash_voucher_issue(text,uuid,numeric,text,date,text,text,text,text,text,text,text,text,date,text,text,uuid) from public;
revoke all on function public.fn_cash_voucher_issue(text,uuid,numeric,text,date,text,text,text,text,text,text,text,text,date,text,text,uuid) from anon;
grant execute on function public.fn_cash_voucher_issue(text,uuid,numeric,text,date,text,text,text,text,text,text,text,text,date,text,text,uuid) to authenticated;

revoke all on function public.fn_cash_voucher_void(uuid,text) from public;
revoke all on function public.fn_cash_voucher_void(uuid,text) from anon;
grant execute on function public.fn_cash_voucher_void(uuid,text) to authenticated;
