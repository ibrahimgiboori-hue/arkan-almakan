-- ============================================================
--  35 : المباشرة والتهيئة وتقييم فترة التجربة وتنبيهات الموارد البشرية
-- ============================================================

alter table candidate_onboarding
  add column if not exists probation_end_date date,
  add column if not exists start_recorded_by_user uuid,
  add column if not exists start_recorded_at timestamptz;

create table if not exists candidate_probation_reviews (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references candidate_onboarding(id) on delete cascade,
  review_day integer not null check (review_day > 0),
  scheduled_date date not null,
  reviewer_employee_id uuid references employees(id) on delete set null,
  performance_score numeric(5,2) check (performance_score between 0 and 100),
  attendance_score numeric(5,2) check (attendance_score between 0 and 100),
  behavior_score numeric(5,2) check (behavior_score between 0 and 100),
  technical_score numeric(5,2) check (technical_score between 0 and 100),
  overall_score numeric(5,2) check (overall_score between 0 and 100),
  recommendation text check (recommendation in ('continue','improvement','consider_extension','do_not_continue')),
  improvement_plan text,
  notes text,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(onboarding_id, review_day)
);

alter table candidate_probation_reviews enable row level security;
drop policy if exists p_candidate_probation_reviews_backoffice on candidate_probation_reviews;
create policy p_candidate_probation_reviews_backoffice on candidate_probation_reviews
  for all to authenticated using (is_back_office()) with check (is_back_office());

create or replace function register_candidate_start(
  p_onboarding uuid,
  p_start_date date,
  p_work_authorization_basis text,
  p_buddy_employee uuid default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  o candidate_onboarding;
  jo job_offers;
  pd integer;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  if p_start_date is null then raise exception 'تاريخ المباشرة الفعلي مطلوب'; end if;
  if nullif(btrim(coalesce(p_work_authorization_basis,'')),'') is null then raise exception 'يجب توثيق الأساس النظامي للعمل قبل تسجيل المباشرة'; end if;

  select * into o from candidate_onboarding where id=p_onboarding;
  if o.id is null then raise exception 'ملف التهيئة غير موجود'; end if;
  select * into jo from job_offers where id=o.offer_id;
  pd:=coalesce(jo.probation_days,90);

  update candidate_onboarding set
    actual_start_date=p_start_date,
    buddy_employee_id=p_buddy_employee,
    work_authorization_basis=p_work_authorization_basis,
    probation_end_date=case when pd>0 then p_start_date+pd else null end,
    status='started',
    start_recorded_by_user=auth.uid(),
    start_recorded_at=now(),
    updated_at=now()
  where id=o.id;

  update candidate_onboarding_tasks set due_date=case task_code
    when 'buddy' then p_start_date
    when 'team_intro' then p_start_date
    when 'custody' then p_start_date
    when 'accounts' then p_start_date
    when 'policies' then p_start_date
    when 'review_30' then p_start_date+30
    when 'review_60' then p_start_date+60
    when 'review_90' then p_start_date+90
    else due_date end
  where onboarding_id=o.id;

  insert into candidate_probation_reviews(onboarding_id,review_day,scheduled_date)
  values (o.id,30,p_start_date+30),(o.id,60,p_start_date+60),(o.id,90,p_start_date+90)
  on conflict(onboarding_id,review_day) do update set scheduled_date=excluded.scheduled_date;
end $$;
grant execute on function register_candidate_start(uuid,date,text,uuid) to authenticated;

create or replace function complete_probation_review(
  p_review uuid,
  p_reviewer uuid,
  p_performance numeric,
  p_attendance numeric,
  p_behavior numeric,
  p_technical numeric,
  p_recommendation text,
  p_improvement_plan text default null,
  p_notes text default null
) returns numeric
language plpgsql security definer set search_path=public as $$
declare vals numeric[]; avg_score numeric;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  if p_recommendation not in ('continue','improvement','consider_extension','do_not_continue') then raise exception 'توصية غير صحيحة'; end if;
  vals:=array_remove(array[p_performance,p_attendance,p_behavior,p_technical],null);
  if coalesce(array_length(vals,1),0)=0 then raise exception 'أدخل درجة واحدة على الأقل'; end if;
  select round(avg(x),2) into avg_score from unnest(vals) x;
  update candidate_probation_reviews set reviewer_employee_id=p_reviewer,performance_score=p_performance,attendance_score=p_attendance,
    behavior_score=p_behavior,technical_score=p_technical,overall_score=avg_score,recommendation=p_recommendation,
    improvement_plan=p_improvement_plan,notes=p_notes,status='completed',completed_at=now()
  where id=p_review;
  if not found then raise exception 'التقييم غير موجود'; end if;
  return avg_score;
end $$;
grant execute on function complete_probation_review(uuid,uuid,numeric,numeric,numeric,numeric,text,text,text) to authenticated;

-- أرشفة بنك المواهب عند انتهاء مدة 90 يوماً (أو المدة المحددة للشاغر).
create or replace function archive_expired_talent_pool() returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  update candidates set archived_at=coalesce(archived_at,now()),usage_restricted=true,updated_at=now()
  where talent_pool_until is not null and talent_pool_until<current_date and usage_restricted=false;
  get diagnostics n=row_count;
  return n;
end $$;
grant execute on function archive_expired_talent_pool() to authenticated;

-- مصادر تنبيه موحدة يمكن لاحقاً عرضها في جرس النظام العام.
create or replace view v_hr_recruitment_alerts with (security_invoker=true) as
select 'candidate_response'::text alert_type,a.id entity_id,
       ('متابعة الرد على المرشح: '||c.full_name_ar)::text title,
       a.response_due_at due_at,
       greatest(0,extract(epoch from (now()-a.response_due_at))/3600)::numeric overdue_hours
from candidate_applications a join candidates c on c.id=a.candidate_id
where a.response_due_at is not null and a.response_sent_at is null
  and a.status in ('not_selected','disqualified','offer_declined')
union all
select 'probation_end',o.id,
       ('قرب نهاية فترة التجربة: '||c.full_name_ar),
       o.probation_end_date::timestamptz,
       null::numeric
from candidate_onboarding o join candidates c on c.id=o.candidate_id
where o.status='started' and o.probation_end_date is not null
  and o.probation_end_date between current_date and current_date+15
union all
select 'probation_review',r.id,
       ('تقييم فترة التجربة ('||r.review_day||' يوم): '||c.full_name_ar),
       r.scheduled_date::timestamptz,
       case when r.scheduled_date<current_date then (current_date-r.scheduled_date)*24 else 0 end::numeric
from candidate_probation_reviews r
join candidate_onboarding o on o.id=r.onboarding_id
join candidates c on c.id=o.candidate_id
where r.status='pending' and r.scheduled_date<=current_date+3
union all
select 'candidate_document_expiry',d.id,
       ('مستند مرشح يقترب من الانتهاء: '||c.full_name_ar||' — '||d.document_type),
       d.expiry_date::timestamptz,
       null::numeric
from candidate_documents d join candidates c on c.id=d.candidate_id
where d.expiry_date is not null and d.expiry_date between current_date and current_date+30;
