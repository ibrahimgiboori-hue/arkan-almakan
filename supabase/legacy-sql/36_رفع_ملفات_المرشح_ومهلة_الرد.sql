-- ============================================================
--  36 : رفع ملفات المرشح ومهلة الرد اللطيف خلال 72 ساعة
-- ============================================================

alter table candidate_applications
  add column if not exists response_message text,
  add column if not exists response_channel text not null default 'whatsapp',
  add column if not exists response_recorded_by_user uuid;

-- الطلب الجديد لا يبدأ منه عداد الاعتذار؛ يبدأ عند اتخاذ قرار سلبي فعلياً.
create or replace function set_candidate_response_due()
returns trigger language plpgsql as $$
declare h integer;
begin
  if new.status in ('not_selected','disqualified','offer_declined')
     and (old.status is distinct from new.status or new.response_due_at is null) then
    select coalesce(response_sla_hours,72) into h from job_vacancies where id=new.vacancy_id;
    new.response_due_at:=now()+make_interval(hours=>h);
    new.response_sent_at:=null;
  elsif new.status not in ('not_selected','disqualified','offer_declined')
        and old.status is distinct from new.status then
    new.response_due_at:=null;
    new.response_sent_at:=null;
  end if;
  return new;
end $$;

drop trigger if exists trg_candidate_response_due on candidate_applications;
create trigger trg_candidate_response_due before update of status on candidate_applications
for each row execute function set_candidate_response_due();

-- الطلبات الجديدة من الآن لا تحمل موعد رد قبل وجود قرار.
update candidate_applications set response_due_at=null
where status not in ('not_selected','disqualified','offer_declined') and response_sent_at is null;

-- تقييد مخزن مستندات المرشحين: 10MB للملف وأنواع مألوفة فقط.
update storage.buckets set
  file_size_limit=10485760,
  allowed_mime_types=array[
    'application/pdf','image/jpeg','image/png','image/webp',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
where id='recruitment-docs';

create or replace function record_candidate_response(
  p_application uuid,
  p_message text,
  p_channel text default 'whatsapp'
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from candidate_applications where id=p_application and status in ('not_selected','disqualified','offer_declined')) then
    raise exception 'لا توجد حالة اعتذار/عدم استمرار تتطلب تسجيل رد';
  end if;
  update candidate_applications set response_message=nullif(btrim(p_message),''),response_channel=coalesce(nullif(btrim(p_channel),''),'whatsapp'),
    response_sent_at=now(),response_recorded_by_user=auth.uid(),updated_at=now()
  where id=p_application;
end $$;
grant execute on function record_candidate_response(uuid,text,text) to authenticated;
