-- يربط حساب الدخول بالشخص الحقيقي داخل سجل الأشخاص.
-- الربط لا يمنح منصبًا ولا يغير صلاحية تشغيل البرنامج.

create or replace function link_current_user_employee(p_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if not exists (select 1 from employees where id=p_employee_id) then raise exception 'الشخص غير موجود'; end if;

  update app_users
  set employee_id=p_employee_id
  where id=auth.uid() and is_active;

  if not found then raise exception 'حساب مستخدم النظام غير مهيأ'; end if;
  return p_employee_id;
end $$;

revoke all on function link_current_user_employee(uuid) from public,anon;
grant execute on function link_current_user_employee(uuid) to authenticated;
