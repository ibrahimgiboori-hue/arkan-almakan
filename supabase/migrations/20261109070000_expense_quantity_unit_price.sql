-- Daily expenses as an Excel sheet: الكمية × سعر الوحدة = الإجمالي, computed in the database.
-- STATUS: APPLIED 2026-11-09 on the owner's approval («طبق»).
--
-- 1) Two optional columns on contractor_expenses: quantity, unit_price (both or neither).
-- 2) A BEFORE INSERT/UPDATE trigger sets amount = round(quantity × unit_price, 2) when both are present.
--    amount stays the stored total, so reports, settlements, reimbursements and approvals keep reading it.
--    Rows without quantity/unit_price keep a directly typed amount (all existing rows).
--    The trigger name sorts before the guard and reimbursement triggers, so they see the final amount.
-- 3) fn_bulk_save_project_expenses accepts quantity and unit_price per row.

alter table public.contractor_expenses
  add column if not exists quantity numeric(14,3),
  add column if not exists unit_price numeric(14,2);

alter table public.contractor_expenses
  drop constraint if exists contractor_expenses_quantity_price_pair,
  add constraint contractor_expenses_quantity_price_pair check (
    (quantity is null and unit_price is null)
    or (quantity is not null and unit_price is not null and quantity > 0 and unit_price >= 0)
  );

comment on column public.contractor_expenses.quantity is 'الكمية — إذا وُجدت مع سعر الوحدة يُحسب amount تلقائيًا في القاعدة.';
comment on column public.contractor_expenses.unit_price is 'سعر الوحدة — amount = round(quantity × unit_price, 2).';

create or replace function private.trg_compute_contractor_expense_amount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.quantity is not null and new.unit_price is not null then
    new.amount := round(new.quantity * new.unit_price, 2);
  end if;
  return new;
end $$;

drop trigger if exists trg_compute_contractor_expense_amount on public.contractor_expenses;
create trigger trg_compute_contractor_expense_amount
  before insert or update of quantity, unit_price, amount on public.contractor_expenses
  for each row execute function private.trg_compute_contractor_expense_amount();

create or replace function public.fn_bulk_save_project_expenses(p_project_id uuid, p_contractor_id uuid, p_rows jsonb)
 returns setof public.contractor_expenses
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare r jsonb; v_row public.contractor_expenses; v_qty numeric; v_price numeric; v_amount numeric;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be an array'; end if;
  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_qty := nullif(r->>'quantity','')::numeric;
    v_price := nullif(r->>'unit_price','')::numeric;
    if (v_qty is null) <> (v_price is null) then raise exception 'Quantity and unit price go together'; end if;
    v_amount := case when v_qty is not null then round(v_qty * v_price, 2) else coalesce(nullif(r->>'amount','')::numeric, 0) end;
    if v_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
    if nullif(trim(r->>'notes'),'') is null then raise exception 'Description is required'; end if;
    insert into public.contractor_expenses(
      project_id,contractor_id,project_item_id,expense_date,category,amount,quantity,unit_price,charge_to,notes,payer,is_recoverable,paid_by_employee_id
    ) values (
      p_project_id,p_contractor_id,nullif(r->>'project_item_id','')::uuid,coalesce(nullif(r->>'expense_date','')::date,current_date),
      coalesce(nullif(r->>'category',''),'أخرى'),v_amount,v_qty,v_price,
      coalesce(nullif(r->>'charge_to',''),'arkan')::public.charge_to,
      trim(r->>'notes'),
      coalesce(nullif(r->>'payer',''),'contractor')::public.expense_payer,
      coalesce((r->>'is_recoverable')::boolean,false),
      nullif(r->>'paid_by_employee_id','')::uuid
    ) returning * into v_row;
    return next v_row;
  end loop;
  return;
end $function$;
