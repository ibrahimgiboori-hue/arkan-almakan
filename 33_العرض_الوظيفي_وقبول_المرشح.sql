-- ============================================================
--  33 : العرض الوظيفي وقبول المرشح ثم إنشاء مسودة العقد
-- ============================================================

create table if not exists job_offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references candidate_applications(id) on delete cascade,
  offer_version integer not null default 1 check (offer_version > 0),
  status text not null default 'internal_review'
    check (status in ('draft','internal_review','internal_approved','sent','accepted','declined','expired','superseded')),
  public_token uuid not null default gen_random_uuid() unique,
  candidate_name_snapshot text not null,
  candidate_id_snapshot text,
  job_title_snapshot text not null,
  department_snapshot text,
  salary_display_mode text not null default 'gross_only'
    check (salary_display_mode in ('gross_only','detailed')),
  gross_salary numeric(12,2),
  basic_salary numeric(12,2),
  housing_allowance numeric(12,2),
  transport_allowance numeric(12,2),
  other_allowance numeric(12,2),
  variable_allowances jsonb not null default '[]'::jsonb,
  daily_work_hours numeric(5,2) not null default 8 check (daily_work_hours > 0 and daily_work_hours <= 24),
  probation_days integer not null default 90 check (probation_days >= 0),
  annual_leave_days numeric(6,2),
  expected_start_date date,
  valid_days integer not null default 7 check (valid_days between 1 and 90),
  valid_until date,
  conditions_text text,
  internal_approved_by_employee_id uuid references employees(id) on delete set null,
  internal_approved_at timestamptz,
  internal_approval_evidence text,
  company_signature_applied boolean not null default false,
  company_stamp_applied boolean not null default false,
  candidate_signer_name text,
  candidate_signature_data text,
  candidate_accepted_at timestamptz,
  candidate_declined_at timestamptz,
  candidate_comment text,
  verification_code_hash text,
  verification_expires_at timestamptz,
  verification_used_at timestamptz,
  verification_channel text,
  created_by_user uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(application_id, offer_version)
);

create index if not exists ix_job_offers_application on job_offers(application_id, offer_version desc);
create index if not exists ix_job_offers_status on job_offers(status);

create table if not exists employment_contract_drafts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references candidate_applications(id) on delete cascade,
  offer_id uuid not null references job_offers(id) on delete cascade,
  draft_version integer not null default 1 check (draft_version > 0),
  status text not null default 'internal_review'
    check (status in ('internal_review','internal_approved','sent','candidate_changes','accepted','declined','superseded')),
  public_token uuid not null default gen_random_uuid() unique,
  contract_data jsonb not null default '{}'::jsonb,
  contract_text text,
  candidate_comment text,
  internal_approved_by_employee_id uuid references employees(id) on delete set null,
  internal_approved_at timestamptz,
  company_signature_applied boolean not null default false,
  company_stamp_applied boolean not null default false,
  candidate_signer_name text,
  candidate_signature_data text,
  candidate_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(offer_id, draft_version)
);

alter table job_offers enable row level security;
alter table employment_contract_drafts enable row level security;
drop policy if exists p_job_offers_backoffice on job_offers;
create policy p_job_offers_backoffice on job_offers for all to authenticated using (is_back_office()) with check (is_back_office());
drop policy if exists p_contract_drafts_backoffice on employment_contract_drafts;
create policy p_contract_drafts_backoffice on employment_contract_drafts for all to authenticated using (is_back_office()) with check (is_back_office());

-- إنشاء العرض من طلب مرشح بعد انتهاء مرحلة التقييم.
create or replace function create_job_offer_from_application(p_application uuid, p_valid_days integer default 7)
returns uuid language plpgsql security definer set search_path=public as $$
declare a candidate_applications; c candidates; v job_vacancies; ver integer; oid uuid;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  select * into a from candidate_applications where id=p_application;
  if a.id is null then raise exception 'طلب المرشح غير موجود'; end if;
  select * into c from candidates where id=a.candidate_id;
  select * into v from job_vacancies where id=a.vacancy_id;
  select coalesce(max(offer_version),0)+1 into ver from job_offers where application_id=a.id;
  update job_offers set status='superseded',updated_at=now() where application_id=a.id and status not in ('accepted','declined','expired','superseded');
  insert into job_offers(application_id,offer_version,status,candidate_name_snapshot,candidate_id_snapshot,job_title_snapshot,department_snapshot,valid_days,valid_until,expected_start_date,gross_salary)
  values(a.id,ver,'internal_review',c.full_name_ar,c.id_number,v.title_ar,v.department,greatest(1,least(coalesce(p_valid_days,7),90)),current_date+greatest(1,least(coalesce(p_valid_days,7),90)),a.available_from,a.salary_expectation)
  returning id into oid;
  update candidate_applications set status='offer_review',updated_at=now() where id=a.id;
  return oid;
end $$;
grant execute on function create_job_offer_from_application(uuid,integer) to authenticated;

-- اعتماد العرض داخلياً. الاعتماد الحقيقي يمكن أن يكون ورقياً ثم يسجله مستخدم النظام هنا.
create or replace function approve_job_offer_internal(
  p_offer uuid,
  p_approver_employee uuid,
  p_evidence text default null,
  p_company_signature boolean default true,
  p_company_stamp boolean default true
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from job_offers where id=p_offer and status in ('draft','internal_review')) then raise exception 'العرض غير متاح للاعتماد الداخلي'; end if;
  update job_offers set status='internal_approved',internal_approved_by_employee_id=p_approver_employee,internal_approved_at=now(),internal_approval_evidence=p_evidence,
    company_signature_applied=coalesce(p_company_signature,false),company_stamp_applied=coalesce(p_company_stamp,false),updated_at=now() where id=p_offer;
end $$;
grant execute on function approve_job_offer_internal(uuid,uuid,text,boolean,boolean) to authenticated;

-- يصدر رمزاً من 8 أرقام ليقوم HR بإرساله عبر القناة المعتمدة (مثلاً واتساب).
create or replace function prepare_job_offer_verification(p_offer uuid, p_channel text default 'whatsapp')
returns text language plpgsql security definer set search_path=public as $$
declare code text;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from job_offers where id=p_offer and status in ('internal_approved','sent')) then raise exception 'يجب اعتماد العرض داخلياً أولاً'; end if;
  code := lpad(floor(random()*100000000)::bigint::text,8,'0');
  update job_offers set status='sent',verification_code_hash=encode(digest(code||':'||id::text,'sha256'),'hex'),verification_expires_at=now()+interval '60 minutes',verification_used_at=null,verification_channel=p_channel,updated_at=now() where id=p_offer;
  update candidate_applications set status='offer_sent',updated_at=now() where id=(select application_id from job_offers where id=p_offer);
  return code;
end $$;
grant execute on function prepare_job_offer_verification(uuid,text) to authenticated;

-- العرض الذي يراه المرشح لا يحتوي معلومات التقييم الداخلي.
create or replace function get_public_job_offer(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o job_offers; c candidates; v jsonb;
begin
  select * into o from job_offers where public_token=p_token and status in ('sent','accepted','declined');
  if o.id is null then return null; end if;
  select c.* into c from candidates c join candidate_applications a on a.candidate_id=c.id where a.id=o.application_id;
  v:=jsonb_build_object(
    'id',o.id,'status',o.status,'candidate_name',o.candidate_name_snapshot,'candidate_id',o.candidate_id_snapshot,
    'job_title',o.job_title_snapshot,'department',o.department_snapshot,'salary_display_mode',o.salary_display_mode,
    'gross_salary',o.gross_salary,'basic_salary',o.basic_salary,'housing_allowance',o.housing_allowance,
    'transport_allowance',o.transport_allowance,'other_allowance',o.other_allowance,'variable_allowances',o.variable_allowances,
    'daily_work_hours',o.daily_work_hours,'probation_days',o.probation_days,'annual_leave_days',o.annual_leave_days,
    'expected_start_date',o.expected_start_date,'valid_until',o.valid_until,'conditions_text',o.conditions_text,
    'company_signature_applied',o.company_signature_applied,'company_stamp_applied',o.company_stamp_applied,
    'accepted_at',o.candidate_accepted_at,'declined_at',o.candidate_declined_at,
    'verification_required',o.status='sent'
  );
  return v;
end $$;
revoke all on function get_public_job_offer(uuid) from public;
grant execute on function get_public_job_offer(uuid) to anon,authenticated;

-- قبول أو اعتذار المرشح بعد التحقق بالرمز. عند القبول تنشأ مسودة العقد للمراجعة الداخلية تلقائياً.
create or replace function respond_to_job_offer(
  p_token uuid,
  p_code text,
  p_accept boolean,
  p_signer_name text default null,
  p_signature_data text default null,
  p_comment text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare o job_offers; cd uuid; hash text;
begin
  select * into o from job_offers where public_token=p_token and status='sent';
  if o.id is null then raise exception 'العرض غير متاح للرد'; end if;
  if o.valid_until is not null and current_date>o.valid_until then update job_offers set status='expired',updated_at=now() where id=o.id; raise exception 'انتهت صلاحية العرض'; end if;
  if o.verification_expires_at is null or now()>o.verification_expires_at then raise exception 'انتهت صلاحية رمز التحقق، اطلب رمزاً جديداً من الموارد البشرية'; end if;
  hash:=encode(digest(coalesce(p_code,'')||':'||o.id::text,'sha256'),'hex');
  if hash<>coalesce(o.verification_code_hash,'') then raise exception 'رمز التحقق غير صحيح'; end if;
  if p_accept and nullif(btrim(coalesce(p_signer_name,'')),'') is null then raise exception 'اسم الموقّع مطلوب'; end if;
  update job_offers set status=case when p_accept then 'accepted' else 'declined' end,
    candidate_signer_name=case when p_accept then p_signer_name else candidate_signer_name end,
    candidate_signature_data=case when p_accept then p_signature_data else candidate_signature_data end,
    candidate_accepted_at=case when p_accept then now() else null end,
    candidate_declined_at=case when p_accept then null else now() end,
    candidate_comment=p_comment,verification_used_at=now(),updated_at=now() where id=o.id;
  update candidate_applications set status=case when p_accept then 'offer_accepted' else 'offer_declined' end,updated_at=now() where id=o.application_id;
  if p_accept then
    insert into employment_contract_drafts(application_id,offer_id,draft_version,status,contract_data)
    values(o.application_id,o.id,1,'internal_review',jsonb_build_object(
      'candidate_name',o.candidate_name_snapshot,'candidate_id',o.candidate_id_snapshot,'job_title',o.job_title_snapshot,'department',o.department_snapshot,
      'gross_salary',o.gross_salary,'basic_salary',o.basic_salary,'housing_allowance',o.housing_allowance,'transport_allowance',o.transport_allowance,'other_allowance',o.other_allowance,
      'variable_allowances',o.variable_allowances,'daily_work_hours',o.daily_work_hours,'probation_days',o.probation_days,'annual_leave_days',o.annual_leave_days,'expected_start_date',o.expected_start_date
    )) returning id into cd;
    return cd;
  end if;
  return null;
end $$;
revoke all on function respond_to_job_offer(uuid,text,boolean,text,text,text) from public;
grant execute on function respond_to_job_offer(uuid,text,boolean,text,text,text) to anon,authenticated;
