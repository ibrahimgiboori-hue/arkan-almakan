-- ============================================================
--  الملف 06 : عروض الأسعار وجداول الكميات
--  محرّك واحد مرن: مفاتيح تُظهر وتُخفي الأعمدة والأقسام
-- ============================================================

do $$ begin
  create type vat_mode as enum ('exclusive','inclusive','none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type line_kind as enum ('title','item','note');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quote_status as enum ('draft','sent','accepted','rejected','expired','converted');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
--  ١. الجهات — ملاك، شركات، جهات حكومية، موردون
-- ------------------------------------------------------------
create table if not exists entities (
  id           uuid primary key default gen_random_uuid(),
  entity_code  text unique,
  name_ar      text not null,
  name_en      text,
  entity_kind  text not null default 'client',
  cr_number    text,
  vat_number   text,
  contact_name text,
  contact_title text,
  mobile       text,
  email        text,
  city         text,
  national_address text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table entities enable row level security;

drop policy if exists p_entities_read on entities;
create policy p_entities_read on entities for select
  using (current_app_role() is not null);

drop policy if exists p_entities_write on entities;
create policy p_entities_write on entities for all
  using (current_app_role() in ('ceo','hr','accountant'))
  with check (current_app_role() in ('ceo','hr','accountant'));

-- ------------------------------------------------------------
--  ٢. دليل بنود الأعمال — مكتبتك التي تنمو مع كل عرض
-- ------------------------------------------------------------
create table if not exists work_items (
  id            uuid primary key default gen_random_uuid(),
  item_code     text unique,
  description_ar text not null,
  description_en text,
  unit          text,
  last_sell_price numeric(12,2),
  last_cost_price numeric(12,2),
  sub_price       numeric(12,2),
  worker_rate_per_unit numeric(12,2),
  worker_output_per_day numeric(10,2),
  tech_output_per_day   numeric(10,2),
  category      text,
  use_count     integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_work_items_desc on work_items(description_ar);

-- ------------------------------------------------------------
--  ٢. عرض السعر
-- ------------------------------------------------------------
create table if not exists quotations (
  id            uuid primary key default gen_random_uuid(),
  quote_no      text unique not null,
  doc_kind      text not null default 'quotation',   -- quotation | boq
  language      doc_language not null default 'ar',
  status        quote_status not null default 'draft',

  -- الأطراف
  client_name   text not null,
  client_contact text,
  entity_id     uuid references entities(id) on delete set null,
  project_id    uuid references projects(id) on delete set null,
  project_ref   text,
  site_location text,

  -- التواريخ والصلاحية
  quote_date    date not null default current_date,
  valid_days    integer not null default 30,

  -- مفاتيح الأعمدة
  show_unit     boolean not null default true,
  show_qty      boolean not null default true,
  show_unit_price boolean not null default true,
  show_line_total boolean not null default true,
  show_en_desc  boolean not null default false,

  -- مفاتيح الأقسام
  show_intro    boolean not null default true,
  show_payments boolean not null default true,
  show_terms    boolean not null default true,
  show_closing  boolean not null default true,
  show_bank     boolean not null default true,
  show_stamp    boolean not null default true,
  show_signature boolean not null default false,
  show_letterhead boolean not null default true,

  -- الضريبة والخصم
  vat_mode      vat_mode not null default 'exclusive',
  vat_rate      numeric(5,4) not null default 0.15,
  discount_pct  numeric(5,4) not null default 0,
  discount_amount numeric(12,2) not null default 0,

  -- النصوص
  title_override text,
  intro_text    text,
  closing_text  text,
  terms_text    text,

  -- عرض الأعمدة بالمليمتر (اختياري)
  col_widths    jsonb not null default '{}'::jsonb,

  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_quotations_client on quotations(client_name);
create index if not exists idx_quotations_status on quotations(status);

-- ------------------------------------------------------------
--  ٣. أسطر العرض — عنوان أو بند، والترقيم الهرمي يُحسب لا يُكتب
-- ------------------------------------------------------------
create table if not exists quotation_lines (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references quotations(id) on delete cascade,
  sort_order    integer not null,
  kind          line_kind not null default 'item',
  description_ar text,
  description_en text,
  unit          text,
  qty           numeric(14,3) not null default 1,
  unit_price    numeric(14,2) not null default 0,
  work_item_id  uuid references work_items(id) on delete set null,
  -- التكلفة الداخلية: لا تُطبع للعميل، تُستخدم لحساب الربح
  cost_price    numeric(14,2),
  notes         text,
  line_total numeric(16,2) generated always as (
    case when kind = 'item' then round(qty * unit_price, 2) else 0 end
  ) stored
);

create index if not exists idx_qlines_quote on quotation_lines(quotation_id, sort_order);
create unique index if not exists uq_qline_order on quotation_lines(quotation_id, sort_order);

-- ------------------------------------------------------------
--  ٤. الدفعات المقترحة — بيانات تُدار لا نص يُكتب
-- ------------------------------------------------------------
create table if not exists quotation_payments (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references quotations(id) on delete cascade,
  sort_order    integer not null default 1,
  label         text not null,
  percent       numeric(5,2),
  amount        numeric(14,2),
  trigger_note  text
);

create index if not exists idx_qpay_quote on quotation_payments(quotation_id, sort_order);

-- ------------------------------------------------------------
--  ٥. الإجماليات محسوبة لا مخزَّنة
-- ------------------------------------------------------------
create or replace view v_quote_totals with (security_invoker = true) as
with base as (
  select q.id,
         q.vat_mode, q.vat_rate, q.discount_pct, q.discount_amount,
         coalesce(sum(l.line_total), 0) as lines_sum,
         coalesce(sum(case when l.cost_price is not null
                           then l.qty * l.cost_price else 0 end), 0) as cost_sum
  from quotations q
  left join quotation_lines l on l.quotation_id = q.id and l.kind = 'item'
  group by q.id, q.vat_mode, q.vat_rate, q.discount_pct, q.discount_amount
),
disc as (
  select *,
    round(lines_sum * discount_pct, 2) + discount_amount as discount_total
  from base
)
select id,
  lines_sum,
  discount_total,
  -- الوعاء بعد الخصم
  (lines_sum - discount_total) as net_before_vat_raw,
  case vat_mode
    when 'inclusive' then round((lines_sum - discount_total) / (1 + vat_rate), 2)
    else (lines_sum - discount_total)
  end as subtotal,
  case vat_mode
    when 'exclusive' then round((lines_sum - discount_total) * vat_rate, 2)
    when 'inclusive' then round((lines_sum - discount_total)
                                - ((lines_sum - discount_total) / (1 + vat_rate)), 2)
    else 0
  end as vat_amount,
  case vat_mode
    when 'exclusive' then round((lines_sum - discount_total) * (1 + vat_rate), 2)
    else (lines_sum - discount_total)
  end as grand_total,
  cost_sum,
  ((lines_sum - discount_total) - cost_sum) as gross_profit
from disc;

-- ------------------------------------------------------------
--  ٦. الترقيم الهرمي محسوب في القاعدة
--     بنود قبل أي عنوان: 1، 2 … عنوان: 3 … بنوده: 3-1، 3-2
-- ------------------------------------------------------------
create or replace function quote_lines_numbered(p_quote uuid)
returns table (
  id uuid, sort_order integer, kind line_kind, number text,
  description_ar text, description_en text, unit text,
  qty numeric, unit_price numeric, line_total numeric, notes text
)
language plpgsql stable
as $$
declare
  r record;
  v_top int := 0;
  v_sub int := 0;
  v_in_title boolean := false;
begin
  for r in
    select * from quotation_lines
    where quotation_id = p_quote order by sort_order
  loop
    if r.kind = 'title' then
      v_top := v_top + 1;
      v_sub := 0;
      v_in_title := true;
      number := v_top::text;
    elsif r.kind = 'note' then
      number := '';
    else
      if v_in_title then
        v_sub := v_sub + 1;
        number := v_top::text || '-' || v_sub::text;
      else
        v_top := v_top + 1;
        number := v_top::text;
      end if;
    end if;

    id := r.id; sort_order := r.sort_order; kind := r.kind;
    description_ar := r.description_ar; description_en := r.description_en;
    unit := r.unit; qty := r.qty; unit_price := r.unit_price;
    line_total := r.line_total; notes := r.notes;
    return next;
  end loop;
end $$;

-- إجمالي كل عنوان من بنوده
create or replace function quote_title_subtotals(p_quote uuid)
returns table (title_id uuid, subtotal numeric)
language plpgsql stable
as $$
declare
  r record;
  v_title uuid := null;
  v_sum numeric := 0;
begin
  for r in
    select * from quotation_lines where quotation_id = p_quote order by sort_order
  loop
    if r.kind = 'title' then
      if v_title is not null then
        title_id := v_title; subtotal := v_sum; return next;
      end if;
      v_title := r.id; v_sum := 0;
    elsif r.kind = 'item' and v_title is not null then
      v_sum := v_sum + r.line_total;
    end if;
  end loop;
  if v_title is not null then
    title_id := v_title; subtotal := v_sum; return next;
  end if;
end $$;

-- ------------------------------------------------------------
--  ٧. الصلاحيات
-- ------------------------------------------------------------
alter table work_items         enable row level security;
alter table quotations         enable row level security;
alter table quotation_lines    enable row level security;
alter table quotation_payments enable row level security;

drop policy if exists p_witems_all on work_items;
create policy p_witems_all on work_items for all
  using (current_app_role() is not null)
  with check (current_app_role() in ('ceo','hr','accountant'));

drop policy if exists p_quotes_read on quotations;
create policy p_quotes_read on quotations for select
  using (current_app_role() is not null);

drop policy if exists p_quotes_write on quotations;
create policy p_quotes_write on quotations for all
  using (current_app_role() in ('ceo','hr','accountant'))
  with check (current_app_role() in ('ceo','hr','accountant'));

drop policy if exists p_qlines_read on quotation_lines;
create policy p_qlines_read on quotation_lines for select
  using (current_app_role() is not null);

drop policy if exists p_qlines_write on quotation_lines;
create policy p_qlines_write on quotation_lines for all
  using (current_app_role() in ('ceo','hr','accountant'))
  with check (current_app_role() in ('ceo','hr','accountant'));

drop policy if exists p_qpay_read on quotation_payments;
create policy p_qpay_read on quotation_payments for select
  using (current_app_role() is not null);

drop policy if exists p_qpay_write on quotation_payments;
create policy p_qpay_write on quotation_payments for all
  using (current_app_role() in ('ceo','hr','accountant'))
  with check (current_app_role() in ('ceo','hr','accountant'));

-- سجل التدقيق على العروض
do $$
declare t text;
begin
  foreach t in array array['quotations','quotation_lines','quotation_payments','work_items']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$I', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$I
                    for each row execute function fn_audit()', t);
  end loop;
  execute 'drop trigger if exists trg_touch_quotations on quotations';
  execute 'create trigger trg_touch_quotations before update on quotations
           for each row execute function fn_touch_updated_at()';
end $$;

notify pgrst, 'reload schema';

select 'جداول عروض الأسعار' as البيان, count(*)::text as عدد
from information_schema.tables
where table_name in ('quotations','quotation_lines','quotation_payments','work_items');
