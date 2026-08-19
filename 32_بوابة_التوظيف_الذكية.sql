-- بوابة التوظيف الذكية: بيانات المسمى، راتب المرشح كنطاق، تقييم آلي مختصر، وإخفاء نطاق المنشأة.

alter table public.job_vacancies
  add column if not exists occupation_profile_key text,
  add column if not exists occupation_family text,
  add column if not exists occupation_level text,
  add column if not exists saudi_group_code text,
  add column if not exists saudi_group_name text,
  add column if not exists salary_visible boolean not null default false;

alter table public.candidate_applications
  add column if not exists salary_expectation_min numeric,
  add column if not exists salary_expectation_max numeric;

alter table public.vacancy_requirements
  add column if not exists score_map jsonb not null default '{}'::jsonb;

alter table public.app_settings
  add column if not exists recruitment_public_intro text;

update public.app_settings
set recruitment_public_intro = coalesce(nullif(recruitment_public_intro,''), 'أركان المكان للمقاولات منشأة تعمل في تنفيذ وإدارة أعمال ومشاريع المقاولات، ونسعى إلى استقطاب كفاءات عملية تسهم في جودة التنفيذ ونمو فريق العمل.')
where id=1;

create or replace function public.get_public_vacancy(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v public.job_vacancies;
  s public.app_settings;
  result jsonb;
begin
  select * into v from public.job_vacancies where public_token=p_token and status='open';
  if v.id is null then return null; end if;
  select * into s from public.app_settings where id=1;

  select jsonb_build_object(
    'id',v.id,
    'title_ar',v.title_ar,
    'department',v.department,
    'duties',v.duties,
    'company_name_ar',coalesce(s.company_name_ar,'أركان المكان للمقاولات'),
    'company_name_en',coalesce(s.company_name_en,'ARKAN AL MAKAN'),
    'company_intro',coalesce(s.recruitment_public_intro,'أركان المكان للمقاولات منشأة تعمل في قطاع المقاولات.'),
    'requirements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'label',r.label,'question_text',r.question_text,'answer_type',r.answer_type,
        'options',r.options,'criterion_type',r.criterion_type,'is_license',r.is_license,
        'license_type',r.license_type,'sort_order',r.sort_order
      ) order by r.sort_order)
      from (
        select * from public.vacancy_requirements
        where vacancy_id=v.id and is_active
        order by sort_order
        limit 5
      ) r
    ),'[]'::jsonb)
  ) into result;
  return result;
end $$;

grant execute on function public.get_public_vacancy(uuid) to anon, authenticated;

create or replace function public.submit_candidate_application_v2(
  p_token uuid,
  p_candidate jsonb,
  p_salary_min numeric default null,
  p_salary_max numeric default null,
  p_available_from date default null,
  p_answers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v public.job_vacancies;
  c public.candidates;
  a public.candidate_applications;
  x jsonb;
  req public.vacancy_requirements;
  ans text;
  hit boolean:=false;
  ans_score numeric;
  weighted numeric:=0;
  weights numeric:=0;
  final_q numeric;
  explanation jsonb:='[]'::jsonb;
begin
  select * into v from public.job_vacancies where public_token=p_token and status='open';
  if v.id is null then raise exception 'الشاغر غير متاح للتقديم حالياً'; end if;
  if nullif(btrim(p_candidate->>'full_name_ar'),'') is null then raise exception 'الاسم مطلوب'; end if;
  if nullif(btrim(p_candidate->>'mobile'),'') is null then raise exception 'رقم التواصل مطلوب'; end if;

  if nullif(btrim(p_candidate->>'id_number'),'') is not null then
    select * into c from public.candidates where id_number=btrim(p_candidate->>'id_number') limit 1;
  end if;

  if c.id is null then
    insert into public.candidates(full_name_ar,nationality,id_kind,id_number,id_expiry,mobile,email,source)
    values (
      btrim(p_candidate->>'full_name_ar'),nullif(btrim(p_candidate->>'nationality'),''),
      nullif(btrim(p_candidate->>'id_kind'),''),nullif(btrim(p_candidate->>'id_number'),''),
      nullif(p_candidate->>'id_expiry','')::date,nullif(btrim(p_candidate->>'mobile'),''),
      nullif(btrim(p_candidate->>'email'),''),'public_link'
    ) returning * into c;
  else
    update public.candidates set
      full_name_ar=coalesce(nullif(btrim(p_candidate->>'full_name_ar'),''),full_name_ar),
      nationality=coalesce(nullif(btrim(p_candidate->>'nationality'),''),nationality),
      id_kind=coalesce(nullif(btrim(p_candidate->>'id_kind'),''),id_kind),
      id_expiry=coalesce(nullif(p_candidate->>'id_expiry','')::date,id_expiry),
      mobile=coalesce(nullif(btrim(p_candidate->>'mobile'),''),mobile),
      email=coalesce(nullif(btrim(p_candidate->>'email'),''),email),updated_at=now()
    where id=c.id returning * into c;
  end if;

  if exists(select 1 from public.candidate_applications where candidate_id=c.id and vacancy_id=v.id) then
    raise exception 'سبق التقديم على هذا الشاغر في دورته الحالية';
  end if;

  insert into public.candidate_applications(
    candidate_id,vacancy_id,status,salary_expectation,salary_expectation_min,salary_expectation_max,available_from,response_due_at
  ) values(
    c.id,v.id,'submitted',
    case when p_salary_min is not null and p_salary_max is not null then (p_salary_min+p_salary_max)/2 else coalesce(p_salary_min,p_salary_max) end,
    p_salary_min,p_salary_max,p_available_from,null
  ) returning * into a;

  for x in select * from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) loop
    select * into req from public.vacancy_requirements
    where id=(x->>'requirement_id')::uuid and vacancy_id=v.id and is_active;
    if req.id is null then continue; end if;
    ans:=nullif(btrim(x->>'answer_text'),'');

    hit := false;
    if req.criterion_type='eliminating' then
      if req.expected_value='__nonempty__' then hit := ans is null;
      elsif req.expected_value is not null then hit := coalesce(lower(ans),'')<>lower(btrim(req.expected_value));
      end if;
    end if;

    ans_score:=null;
    if ans is not null and jsonb_typeof(req.score_map)='object' and req.score_map ? ans then
      begin ans_score:=(req.score_map->>ans)::numeric; exception when others then ans_score:=null; end;
    end if;

    if ans_score is not null and req.weight>0 then
      weighted:=weighted+(ans_score*req.weight);
      weights:=weights+req.weight;
    end if;

    insert into public.candidate_application_answers(
      application_id,requirement_id,question_snapshot,answer_text,answer_json,score,is_eliminating_hit
    ) values(a.id,req.id,coalesce(req.question_text,req.label),ans,x->'answer_json',ans_score,hit);

    explanation:=explanation||jsonb_build_array(jsonb_build_object(
      'label',req.label,'answer',ans,'score',ans_score,'weight',req.weight,'eliminating_hit',hit
    ));

    if hit then
      update public.candidate_applications set has_eliminating_issue=true,
      disqualification_requirement_id=coalesce(disqualification_requirement_id,req.id)
      where id=a.id;
    end if;
  end loop;

  if weights>0 then final_q:=round(weighted/weights,2); end if;
  update public.candidate_applications set questionnaire_score=final_q,
    final_score=final_q,score_explanation=jsonb_build_object('questionnaire',explanation,'auto_score',final_q),updated_at=now()
  where id=a.id;

  return jsonb_build_object('application_id',a.id,'candidate_id',c.id,'questionnaire_score',final_q);
end $$;

grant execute on function public.submit_candidate_application_v2(uuid,jsonb,numeric,numeric,date,jsonb) to anon, authenticated;

create or replace function public.set_candidate_response_due_on_decision()
returns trigger language plpgsql set search_path='public' as $$
begin
  if new.status is distinct from old.status
     and new.status in ('not_selected','disqualified')
     and new.response_sent_at is null
     and new.response_due_at is null then
    new.response_due_at := now() + make_interval(hours => coalesce((select response_sla_hours from public.job_vacancies where id=new.vacancy_id),72));
  end if;
  return new;
end $$;

drop trigger if exists trg_candidate_response_due_on_decision on public.candidate_applications;
create trigger trg_candidate_response_due_on_decision
before update on public.candidate_applications
for each row execute function public.set_candidate_response_due_on_decision();
