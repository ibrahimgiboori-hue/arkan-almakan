-- ============================================================
--  34 : مراجعة مسودة العقد وقبول المرشح ثم بدء خطة التهيئة
-- ============================================================

alter table candidate_applications drop constraint if exists candidate_applications_status_check;
alter table candidate_applications add constraint candidate_applications_status_check check (status in (
  'submitted','screening','interview','reserve','offer_review','offer_sent','offer_accepted','offer_declined',
  'contract_review','contract_sent','contract_changes','contract_accepted','onboarding','not_selected','disqualified','hired','archived'
));

alter table employment_contract_drafts
  add column if not exists verification_code_hash text,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists verification_used_at timestamptz,
  add column if not exists verification_channel text,
  add column if not exists sent_at timestamptz;

create table if not exists candidate_onboarding (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references candidate_applications(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  offer_id uuid references job_offers(id) on delete set null,
  contract_draft_id uuid references employment_contract_drafts(id) on delete set null,
  expected_start_date date,
  actual_start_date date,
  buddy_employee_id uuid references employees(id) on delete set null,
  work_authorization_basis text,
  status text not null default 'pre_start' check (status in ('pre_start','scheduled','started','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidate_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references candidate_onboarding(id) on delete cascade,
  task_code text not null,
  task_name text not null,
  due_date date,
  assigned_employee_id uuid references employees(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','done','skipped','cancelled')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(onboarding_id,task_code)
);

alter table candidate_onboarding enable row level security;
alter table candidate_onboarding_tasks enable row level security;
drop policy if exists p_candidate_onboarding_backoffice on candidate_onboarding;
create policy p_candidate_onboarding_backoffice on candidate_onboarding for all to authenticated using (is_back_office()) with check (is_back_office());
drop policy if exists p_candidate_onboarding_tasks_backoffice on candidate_onboarding_tasks;
create policy p_candidate_onboarding_tasks_backoffice on candidate_onboarding_tasks for all to authenticated using (is_back_office()) with check (is_back_office());

create or replace function approve_contract_draft_internal(
  p_draft uuid,
  p_approver_employee uuid,
  p_contract_text text,
  p_company_signature boolean default true,
  p_company_stamp boolean default true
) returns void language plpgsql security definer set search_path=public as $$
declare d employment_contract_drafts;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  select * into d from employment_contract_drafts where id=p_draft;
  if d.id is null or d.status not in ('internal_review','candidate_changes') then raise exception 'المسودة غير متاحة للاعتماد الداخلي'; end if;
  if nullif(btrim(coalesce(p_contract_text,'')),'') is null then raise exception 'نص العقد مطلوب قبل الاعتماد'; end if;
  update employment_contract_drafts set status='internal_approved',contract_text=p_contract_text,internal_approved_by_employee_id=p_approver_employee,
    internal_approved_at=now(),company_signature_applied=coalesce(p_company_signature,false),company_stamp_applied=coalesce(p_company_stamp,false),candidate_comment=null,updated_at=now()
  where id=p_draft;
  update candidate_applications set status='contract_review',updated_at=now() where id=d.application_id;
end $$;
grant execute on function approve_contract_draft_internal(uuid,uuid,text,boolean,boolean) to authenticated;

create or replace function prepare_contract_verification(p_draft uuid,p_channel text default 'whatsapp')
returns text language plpgsql security definer set search_path=public as $$
declare code text; d employment_contract_drafts;
begin
  if not is_back_office() then raise exception 'غير مصرح'; end if;
  select * into d from employment_contract_drafts where id=p_draft;
  if d.id is null or d.status not in ('internal_approved','sent') then raise exception 'يجب اعتماد مسودة العقد داخلياً أولاً'; end if;
  code:=lpad(floor(random()*100000000)::bigint::text,8,'0');
  update employment_contract_drafts set status='sent',verification_code_hash=encode(digest(code||':'||id::text,'sha256'),'hex'),
    verification_expires_at=now()+interval '60 minutes',verification_used_at=null,verification_channel=p_channel,sent_at=now(),updated_at=now() where id=p_draft;
  update candidate_applications set status='contract_sent',updated_at=now() where id=d.application_id;
  return code;
end $$;
grant execute on function prepare_contract_verification(uuid,text) to authenticated;

create or replace function get_public_contract_draft(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d employment_contract_drafts; o job_offers; v jsonb;
begin
  select * into d from employment_contract_drafts where public_token=p_token and status in ('sent','candidate_changes','accepted','declined');
  if d.id is null then return null; end if;
  select * into o from job_offers where id=d.offer_id;
  v:=jsonb_build_object(
    'id',d.id,'status',d.status,'candidate_name',o.candidate_name_snapshot,'job_title',o.job_title_snapshot,'department',o.department_snapshot,
    'contract_text',d.contract_text,'contract_data',d.contract_data,'company_signature_applied',d.company_signature_applied,'company_stamp_applied',d.company_stamp_applied,
    'candidate_comment',d.candidate_comment,'accepted_at',d.candidate_accepted_at
  );
  return v;
end $$;
revoke all on function get_public_contract_draft(uuid) from public;
grant execute on function get_public_contract_draft(uuid) to anon,authenticated;

create or replace function respond_to_contract_draft(
  p_token uuid,
  p_code text,
  p_action text,
  p_signer_name text default null,
  p_signature_data text default null,
  p_comment text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare d employment_contract_drafts; o job_offers; c candidate_applications; hash text; ob uuid; start_date date;
begin
  if p_action not in ('accept','changes','decline') then raise exception 'إجراء غير صحيح'; end if;
  select * into d from employment_contract_drafts where public_token=p_token and status='sent';
  if d.id is null then raise exception 'مسودة العقد غير متاحة للرد'; end if;
  if d.verification_expires_at is null or now()>d.verification_expires_at then raise exception 'انتهت صلاحية رمز التحقق، اطلب رمزاً جديداً من الموارد البشرية'; end if;
  hash:=encode(digest(coalesce(p_code,'')||':'||d.id::text,'sha256'),'hex');
  if hash<>coalesce(d.verification_code_hash,'') then raise exception 'رمز التحقق غير صحيح'; end if;
  if p_action='accept' and (nullif(btrim(coalesce(p_signer_name,'')),'') is null or p_signature_data is null) then raise exception 'الاسم والتوقيع مطلوبان لاعتماد العقد'; end if;
  if p_action='changes' and nullif(btrim(coalesce(p_comment,'')),'') is null then raise exception 'اكتب الملاحظات المطلوب تعديلها'; end if;

  update employment_contract_drafts set
    status=case p_action when 'accept' then 'accepted' when 'changes' then 'candidate_changes' else 'declined' end,
    candidate_signer_name=case when p_action='accept' then p_signer_name else candidate_signer_name end,
    candidate_signature_data=case when p_action='accept' then p_signature_data else candidate_signature_data end,
    candidate_accepted_at=case when p_action='accept' then now() else null end,
    candidate_comment=p_comment,verification_used_at=now(),updated_at=now()
  where id=d.id;

  update candidate_applications set status=case p_action when 'accept' then 'contract_accepted' when 'changes' then 'contract_changes' else 'offer_declined' end,updated_at=now()
  where id=d.application_id returning * into c;

  if p_action='accept' then
    select * into o from job_offers where id=d.offer_id;
    start_date:=o.expected_start_date;
    insert into candidate_onboarding(application_id,candidate_id,offer_id,contract_draft_id,expected_start_date,status)
    values(c.id,c.candidate_id,o.id,d.id,start_date,case when start_date is null then 'pre_start' else 'scheduled' end)
    on conflict(application_id) do update set offer_id=excluded.offer_id,contract_draft_id=excluded.contract_draft_id,expected_start_date=excluded.expected_start_date,updated_at=now()
    returning id into ob;

    insert into candidate_onboarding_tasks(onboarding_id,task_code,task_name,due_date) values
      (ob,'buddy','تعيين الموظف المرافق وتهيئته لدوره',start_date),
      (ob,'team_intro','تعريف الموظف بالأقسام والزملاء',start_date),
      (ob,'custody','تسليم العهد اللازمة للعمل',start_date),
      (ob,'accounts','إنشاء البريد والحسابات والصلاحيات اللازمة',start_date),
      (ob,'policies','تعريف الموظف بالسياسات والإجراءات الداخلية',start_date),
      (ob,'review_30','تقييم الأداء بعد 30 يوماً',case when start_date is null then null else start_date+30 end),
      (ob,'review_60','تقييم الأداء بعد 60 يوماً',case when start_date is null then null else start_date+60 end),
      (ob,'review_90','تقييم الأداء بعد 90 يوماً',case when start_date is null then null else start_date+90 end)
    on conflict(onboarding_id,task_code) do update set due_date=excluded.due_date;
    update candidate_applications set status='onboarding',updated_at=now() where id=c.id;
    return ob;
  end if;
  return null;
end $$;
revoke all on function respond_to_contract_draft(uuid,text,text,text,text,text) from public;
grant execute on function respond_to_contract_draft(uuid,text,text,text,text,text) to anon,authenticated;
