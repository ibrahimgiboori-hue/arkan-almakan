create or replace function public.fn_cash_voucher_set_legal_text(
  p_voucher_id uuid,
  p_legal_text text
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v public.cash_vouchers%rowtype;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;

  select * into v
  from public.cash_vouchers
  where id=p_voucher_id
  for update;

  if v.id is null then raise exception 'السند غير موجود'; end if;
  if v.status <> 'draft' then raise exception 'لا يمكن تعديل النص القانوني إلا في المسودة'; end if;
  if not public.has_capability('finance.treasury.edit','all',null,v.amount)
     and not public.fn_is_primary_user() then
    raise exception 'لا تملك صلاحية تعديل النص القانوني للسند';
  end if;

  if nullif(trim(coalesce(p_legal_text,'')),'') is null then
    raise exception 'النص القانوني لا يمكن أن يكون فارغًا';
  end if;

  update public.cash_vouchers
  set legal_text_snapshot=trim(p_legal_text)
  where id=p_voucher_id;

  return true;
end;
$function$;

grant execute on function public.fn_cash_voucher_set_legal_text(uuid,text) to authenticated;
