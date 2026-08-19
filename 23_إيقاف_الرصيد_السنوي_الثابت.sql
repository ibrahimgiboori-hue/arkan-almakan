-- ============================================================
-- الملف 23 : إيقاف تحديث الرصيد السنوي الثابت
-- ============================================================
-- الرصيد أصبح محسوباً بصورة مستمرة من تاريخ المباشرة عبر
-- leave_balance_snapshot و v_leave_balance_live.
-- لذلك لا يتم بعد الآن إنشاء 21 يوماً ثابتة عند اعتماد الإجازة.
-- ============================================================

create or replace function record_leave_manual_decision(
  p_id uuid,
  p_actor_employee_id uuid,
  p_decision text default 'approved',
  p_decision_date date default current_date,
  p_comment text default null,
  p_evidence_path text default null
)
returns request_status
language plpgsql security definer set search_path = public
as $$
declare
  v_row leave_requests;
  v_new request_status;
  v_stage_code text;
  v_stage_label text;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into v_row from leave_requests where id=p_id for update;
  if v_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_row.status in ('ceo_approved','rejected','cancelled') then raise exception 'هذا الطلب مغلق ولا يقبل قراراً جديداً'; end if;

  if v_row.status in ('draft','submitted') then
    v_stage_code := 'administrative_review'; v_stage_label := 'مراجعة الطلب';
  elsif v_row.status = 'hr_reviewed' then
    v_stage_code := 'final_approval'; v_stage_label := 'الاعتماد النهائي';
  else
    raise exception 'حالة الطلب الحالية غير مدعومة';
  end if;

  if p_decision='rejected' then v_new:='rejected';
  elsif p_decision='approved' then
    if v_row.status in ('draft','submitted') then v_new:='hr_reviewed'; else v_new:='ceo_approved'; end if;
  else raise exception 'القرار يجب أن يكون approved أو rejected'; end if;

  perform record_manual_approval('leave_requests',p_id,p_actor_employee_id,p_decision,p_decision_date,p_comment,p_evidence_path,v_stage_code,v_stage_label,'leave_request');
  update leave_requests set status=v_new where id=p_id;
  return v_new;
end $$;

revoke all on function record_leave_manual_decision(uuid,uuid,text,date,text,text) from public;
grant execute on function record_leave_manual_decision(uuid,uuid,text,date,text,text) to authenticated;
