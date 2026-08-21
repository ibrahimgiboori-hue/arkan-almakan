-- ============================================================
--  32 : مسار التوظيف والمرشحين
--  الشاغر هو أصل المعاملة، والمرشح قد يتقدم لأكثر من شاغر.
-- ============================================================

create table if not exists job_vacancies (
  id uuid primary key default gen_random_uuid(),
  vacancy_no text unique,
  title_ar text not null,
  department text,
  requested_by_employee_id uuid references employees(id) on delete set null,
  headcount integer not null default 1 check (headcount > 0),
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  salary_display_mode text not null default 'range'
    check (salary_display_mode in ('range','gross_only','detailed')),
  duties text,
  status text not null default 'draft'
    check (status in ('draft','open','paused','filled','closed')),
  public_token uuid not null default gen_random_uuid() unique,
  questionnaire_weight numeric(5,2) not null default 60 check (questionnaire_weight between 0 and 100),
  interview_weight numeric(5,2) not null default 40 check (interview_weight between 0 and 100),
  talent_pool_days integer not null default 90 check (talent_pool_days between 1 and 365),
  response_sla_hours integer not null default 72 check (response_sla_hours between 1 and 168),
  created_by_user uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint ck_vacancy_score_weights check (questionnaire_weight + interview_weight = 100),
  constraint ck_vacancy_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create table if not exists vacancy_requirements (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references job_vacancies(id) on delete cascade,
  label text not null,
  question_text text,
  answer_type text not null default 'text'
    check (answer_type in ('text','number','yes_no','single','date','license')),
  options jsonb not null default '[]'::jsonb,
  criterion_type text not null default 'normal'
    check (criterion_type in ('eliminating','high','normal','preferred')),
  expected_value text,
  weight numeric(6,2) not null default 0 check (weight between 0 and 100),
  is_license boolean not null default false,
  license_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ix_vacancy_requirements_vacancy on vacancy_requirements(vacancy_id, sort_order);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  full_name_ar text not null,
  nationality text,
  id_kind text,
  id_number text,
  id_expiry date,
  mobile text,
  email text,
  source text,
  talent_pool_until date,
  archived_at timestamptz,
  usage_restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_candidates_id_number
  on candidates(id_number) where id_number is not null and btrim(id_number) <> '';
create index if not exists ix_candidates_talent_pool on candidates(talent_pool_until) where talent_pool_until is not null;

create table if not exists candidate_applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  vacancy_id uuid not null references job_vacancies(id) on delete cascade,
  status text not null default 'submitted'
    check (status in ('submitted','screening','interview','reserve','offer_review','offer_sent','offer_accepted','offer_declined','not_selected','disqualified','hired','archived')),
  salary_expectation numeric(12,2),
  available_from date,
  questionnaire_score numeric(5,2) check (questionnaire_score between 0 and 100),
  interview_score numeric(5,2) check (interview_score between 0 and 100),
  final_score numeric(5,2) check (final_score between 0 and 100),
  score_explanation jsonb not null default '{}'::jsonb,
  has_eliminating_issue boolean not null default false,
  disqualification_requirement_id uuid references vacancy_requirements(id) on delete set null,
  disqualification_reason_internal text,
  response_due_at timestamptz,
  response_sent_at timestamptz,
  hr_override boolean not null default false,
  hr_override_reason text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_id, vacancy_id)
);

create index if not exists ix_candidate_applications_vacancy on candidate_applications(vacancy_id, status);
create index if not exists ix_candidate_applications_candidate on candidate_applications(candidate_id);

create table if not exists candidate_application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references candidate_applications(id) on delete cascade,
  requirement_id uuid references vacancy_requirements(id) on delete set null,
  question_snapshot text not null,
  answer_text text,
  answer_json jsonb,
  score numeric(6,2),
  is_eliminating_hit boolean not null default false,
  created_at timestamptz not null default now(),
  unique(application_id, requirement_id)
);

create table if not exists candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  application_id uuid references candidate_applications(id) on delete cascade,
  document_type text not null,
  file_path text,
  document_number text,
  issuing_authority text,
  expiry_date date,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','not_required')),
  verified_by_user uuid,
  verified_at timestamptz,
  verification_notes text,
  created_at timestamptz not null default now()
);

create index if not exists ix_candidate_documents_candidate on candidate_documents(candidate_id, document_type);

create table if not exists candidate_recommendations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references candidate_applications(id) on delete cascade,
  recommender_employee_id uuid references employees(id) on delete set null,
  professional_context text,
  known_months integer check (known_months is null or known_months >= 0),
  work_quality smallint check (work_quality between 1 and 5),
  discipline smallint check (discipline between 1 and 5),
  reliability smallint check (reliability between 1 and 5),
  safety smallint check (safety between 1 and 5),
  recommendation_level text check (recommendation_level in ('strong','recommend','compare','do_not_recommend')),
  comments text,
  created_at timestamptz not null default now()
);

create table if not exists candidate_interview_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references candidate_applications(id) on delete cascade,
  interviewer_employee_id uuid references employees(id) on delete set null,
  interviewed_at timestamptz not null default now(),
  technical_score numeric(5,2) check (technical_score between 0 and 100),
  practical_score numeric(5,2) check (practical_score between 0 and 100),
  communication_score numeric(5,2) check (communication_score between 0 and 100),
  work_environment_score numeric(5,2) check (work_environment_score between 0 and 100),
  overall_score numeric(5,2) not null check (overall_score between 0 and 100),
  recommendation text check (recommendation in ('strong','recommend','compare','do_not_recommend')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists ix_interview_reviews_application on candidate_interview_reviews(application_id);

-- المستندات المرفوعة من HR تحفظ في مخزن خاص.
insert into storage.buckets (id, name, public)
values ('recruitment-docs', 'recruitment-docs', false)
on conflict (id) do nothing;

-- سياسات الوصول الداخلي.
alter table job_vacancies enable row level security;
alter table vacancy_requirements enable row level security;
alter table candidates enable row level security;
alter table candidate_applications enable row level security;
alter table candidate_application_answers enable row level security;
alter table candidate_documents enable row level security;
alter table candidate_recommendations enable row level security;
alter table candidate_interview_reviews enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'job_vacancies','vacancy_requirements','candidates','candidate_applications',
    'candidate_application_answers','candidate_documents','candidate_recommendations','candidate_interview_reviews'
  ] loop
    execute format('drop policy if exists %I on %I', 'p_' || t || '_backoffice', t);
    execute format(
      'create policy %I on %I for all to authenticated using (is_back_office()) with check (is_back_office())',
      'p_' || t || '_backoffice', t
    );
  end loop;
end $$;

drop policy if exists p_recruitment_docs_read on storage.objects;
create policy p_recruitment_docs_read on storage.objects for select to authenticated
  using (bucket_id='recruitment-docs' and is_back_office());
drop policy if exists p_recruitment_docs_write on storage.objects;
create policy p_recruitment_docs_write on storage.objects for insert to authenticated
  with check (bucket_id='recruitment-docs' and current_app_role() in ('ceo','hr'));
drop policy if exists p_recruitment_docs_update on storage.objects;
create policy p_recruitment_docs_update on storage.objects for update to authenticated
  using (bucket_id='recruitment-docs' and current_app_role() in ('ceo','hr'));
drop policy if exists p_recruitment_docs_delete on storage.objects;
create policy p_recruitment_docs_delete on storage.objects for delete to authenticated
  using (bucket_id='recruitment-docs' and current_app_role() in ('ceo','hr'));

-- بيانات الشاغر العامة دون كشف البيانات الداخلية.
create or replace function get_public_vacancy(p_token uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v job_vacancies; r jsonb;
begin
  select * into v from job_vacancies where public_token=p_token and status='open';
  if v.id is null then return null; end if;
  select jsonb_build_object(
    'id',v.id,'title_ar',v.title_ar,'department',v.department,'headcount',v.headcount,
    'salary_min',v.salary_min,'salary_max',v.salary_max,'salary_display_mode',v.salary_display_mode,
    'duties',v.duties,
    'requirements',coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'label',r.label,'question_text',r.question_text,'answer_type',r.answer_type,
      'options',r.options,'criterion_type',r.criterion_type,'is_license',r.is_license,'license_type',r.license_type,
      'sort_order',r.sort_order
    ) order by r.sort_order) filter (where r.id is not null),'[]'::jsonb)
  ) into r
  from vacancy_requirements r where r.vacancy_id=v.id and r.is_active;
  return r;
end $$;

revoke all on function get_public_vacancy(uuid) from public;
grant execute on function get_public_vacancy(uuid) to anon, authenticated;

-- استقبال طلب المرشح من الرابط العام. لا يسمح للمرشح بتحديد درجاته أو حالته.
create or replace function submit_candidate_application(
  p_token uuid,
  p_candidate jsonb,
  p_salary_expectation numeric default null,
  p_available_from date default null,
  p_answers jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v job_vacancies;
  c candidates;
  a candidate_applications;
  x jsonb;
  req vacancy_requirements;
  ans text;
  hit boolean := false;
begin
  select * into v from job_vacancies where public_token=p_token and status='open';
  if v.id is null then raise exception 'الشاغر غير متاح للتقديم حالياً'; end if;
  if nullif(btrim(p_candidate->>'full_name_ar'),'') is null then raise exception 'الاسم مطلوب'; end if;

  if nullif(btrim(p_candidate->>'id_number'),'') is not null then
    select * into c from candidates where id_number=btrim(p_candidate->>'id_number') limit 1;
  end if;

  if c.id is null then
    insert into candidates(full_name_ar,nationality,id_kind,id_number,id_expiry,mobile,email,source)
    values (
      btrim(p_candidate->>'full_name_ar'),nullif(btrim(p_candidate->>'nationality'),''),
      nullif(btrim(p_candidate->>'id_kind'),''),nullif(btrim(p_candidate->>'id_number'),''),
      nullif(p_candidate->>'id_expiry','')::date,nullif(btrim(p_candidate->>'mobile'),''),
      nullif(btrim(p_candidate->>'email'),''),'public_link'
    ) returning * into c;
  else
    update candidates set
      full_name_ar=coalesce(nullif(btrim(p_candidate->>'full_name_ar'),''),full_name_ar),
      nationality=coalesce(nullif(btrim(p_candidate->>'nationality'),''),nationality),
      id_kind=coalesce(nullif(btrim(p_candidate->>'id_kind'),''),id_kind),
      id_expiry=coalesce(nullif(p_candidate->>'id_expiry','')::date,id_expiry),
      mobile=coalesce(nullif(btrim(p_candidate->>'mobile'),''),mobile),
      email=coalesce(nullif(btrim(p_candidate->>'email'),''),email),updated_at=now()
    where id=c.id returning * into c;
  end if;

  if exists(select 1 from candidate_applications where candidate_id=c.id and vacancy_id=v.id) then
    raise exception 'سبق التقديم على هذا الشاغر في دورته الحالية';
  end if;

  insert into candidate_applications(candidate_id,vacancy_id,status,salary_expectation,available_from,response_due_at)
  values(c.id,v.id,'submitted',p_salary_expectation,p_available_from,now() + make_interval(hours=>v.response_sla_hours))
  returning * into a;

  for x in select * from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) loop
    select * into req from vacancy_requirements
      where id=(x->>'requirement_id')::uuid and vacancy_id=v.id and is_active;
    if req.id is null then continue; end if;
    ans := nullif(btrim(x->>'answer_text'),'');
    hit := req.criterion_type='eliminating' and req.expected_value is not null
           and coalesce(lower(ans),'') <> lower(btrim(req.expected_value));
    insert into candidate_application_answers(application_id,requirement_id,question_snapshot,answer_text,answer_json,is_eliminating_hit)
    values(a.id,req.id,coalesce(req.question_text,req.label),ans,x->'answer_json',hit);
    if hit then
      update candidate_applications set has_eliminating_issue=true,
        disqualification_requirement_id=coalesce(disqualification_requirement_id,req.id)
      where id=a.id;
    end if;
  end loop;

  return a.id;
end $$;

revoke all on function submit_candidate_application(uuid,jsonb,numeric,date,jsonb) from public;
grant execute on function submit_candidate_application(uuid,jsonb,numeric,date,jsonb) to anon, authenticated;

-- تحديث النتيجة النهائية من تقييم الاستبيان ومتوسط المقابلات، مع بقاء التجاوز البشري موثقاً.
create or replace function refresh_candidate_application_score(p_application uuid)
returns numeric
language plpgsql security definer set search_path=public
as $$
declare a candidate_applications; v job_vacancies; i numeric; f numeric;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  select * into a from candidate_applications where id=p_application;
  if a.id is null then raise exception 'طلب المرشح غير موجود'; end if;
  select * into v from job_vacancies where id=a.vacancy_id;
  select avg(overall_score) into i from candidate_interview_reviews where application_id=a.id;
  f := case
    when a.questionnaire_score is null and i is null then null
    when i is null then a.questionnaire_score
    when a.questionnaire_score is null then i
    else round((a.questionnaire_score*v.questionnaire_weight + i*v.interview_weight)/100,2)
  end;
  update candidate_applications set interview_score=i, final_score=f, updated_at=now() where id=a.id;
  return f;
end $$;

grant execute on function refresh_candidate_application_score(uuid) to authenticated;
