-- بوابة المقاول ونموذج التايم شيت العام.
-- كلمات المرور ورموز التصاريح لا تخزن مكشوفة؛ سجل التدقيق الداخلي لا يدخل المطبوعات.

create table if not exists public.contractor_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  auth_user_id uuid not null,
  username text not null,
  login_email text not null,
  display_name text not null,
  is_active boolean not null default true,
  failed_code_attempts integer not null default 0,
  code_locked_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  password_reset_at timestamptz,
  constraint contractor_portal_accounts_contractor_key unique (contractor_id),
  constraint contractor_portal_accounts_auth_user_key unique (auth_user_id),
  constraint contractor_portal_accounts_login_email_key unique (login_email),
  constraint contractor_portal_accounts_username_check check (username ~ '^[a-z0-9][a-z0-9._-]{3,31}$'),
  constraint contractor_portal_accounts_failed_check check (failed_code_attempts between 0 and 20)
);
create unique index if not exists contractor_portal_accounts_username_lower_key
  on public.contractor_portal_accounts (lower(username));
create index if not exists contractor_portal_accounts_auth_active_idx
  on public.contractor_portal_accounts (auth_user_id, is_active);

create table if not exists public.contractor_edit_permits (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  permit_kind text not null default 'code',
  code_hash text,
  code_hint text,
  permitted_person_name text,
  attendance_from date not null,
  attendance_to date not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer not null default 20,
  use_count integer not null default 0,
  reason text not null,
  issued_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz not null default now(),
  constraint contractor_edit_permits_kind_check check (permit_kind in ('code','delegation')),
  constraint contractor_edit_permits_dates_check check (attendance_to >= attendance_from),
  constraint contractor_edit_permits_uses_check check (max_uses between 1 and 500 and use_count between 0 and max_uses),
  constraint contractor_edit_permits_code_check check (
    (permit_kind = 'code' and code_hash is not null)
    or (permit_kind = 'delegation' and permitted_person_name is not null)
  )
);
create index if not exists contractor_edit_permits_scope_idx
  on public.contractor_edit_permits (contractor_id, project_id, attendance_from, attendance_to, expires_at)
  where revoked_at is null;

create table if not exists public.contractor_portal_submissions (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint generated always as identity unique,
  request_id uuid not null unique,
  contractor_id uuid not null references public.contractors(id),
  project_id uuid not null references public.projects(id),
  work_date date not null,
  permit_id uuid references public.contractor_edit_permits(id),
  submitted_by uuid not null,
  actor_name text not null,
  rows_count integer not null default 0,
  change_summary jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now()
);
create index if not exists contractor_portal_submissions_scope_idx
  on public.contractor_portal_submissions (contractor_id, project_id, work_date, submitted_at desc);

create table if not exists public.contractor_portal_audit (
  id bigint generated always as identity primary key,
  contractor_id uuid not null references public.contractors(id),
  project_id uuid references public.projects(id),
  laborer_id uuid references public.laborers(id),
  attendance_id uuid,
  submission_id uuid references public.contractor_portal_submissions(id),
  permit_id uuid references public.contractor_edit_permits(id),
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor_user_id uuid not null,
  actor_name text not null,
  at timestamptz not null default now(),
  constraint contractor_portal_audit_action_check check (action in (
    'attendance_insert','attendance_update','attendance_delete',
    'laborer_add','laborer_update'
  ))
);
create index if not exists contractor_portal_audit_scope_idx
  on public.contractor_portal_audit (contractor_id, project_id, at desc);
create index if not exists contractor_portal_audit_laborer_idx
  on public.contractor_portal_audit (laborer_id, at desc);

alter table public.attendance
  add column if not exists portal_last_edited_by uuid,
  add column if not exists portal_last_edited_by_name text,
  add column if not exists portal_last_edited_at timestamptz,
  add column if not exists portal_submission_id uuid;

alter table public.contractor_portal_accounts enable row level security;
alter table public.contractor_edit_permits enable row level security;
alter table public.contractor_portal_submissions enable row level security;
alter table public.contractor_portal_audit enable row level security;

drop policy if exists contractor_portal_accounts_read on public.contractor_portal_accounts;
create policy contractor_portal_accounts_read on public.contractor_portal_accounts
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (select public.current_app_role()) in ('ceo'::public.user_role,'hr'::public.user_role,'accountant'::public.user_role)
  );

drop policy if exists contractor_edit_permits_admin_read on public.contractor_edit_permits;
create policy contractor_edit_permits_admin_read on public.contractor_edit_permits
  for select to authenticated
  using ((select public.current_app_role()) in ('ceo'::public.user_role,'hr'::public.user_role));

drop policy if exists contractor_portal_submissions_read on public.contractor_portal_submissions;
create policy contractor_portal_submissions_read on public.contractor_portal_submissions
  for select to authenticated
  using (
    (select public.current_app_role()) in ('ceo'::public.user_role,'hr'::public.user_role,'accountant'::public.user_role)
    or exists (
      select 1 from public.contractor_portal_accounts a
      where a.auth_user_id = (select auth.uid()) and a.is_active
        and a.contractor_id = contractor_portal_submissions.contractor_id
    )
  );

drop policy if exists contractor_portal_audit_admin_read on public.contractor_portal_audit;
create policy contractor_portal_audit_admin_read on public.contractor_portal_audit
  for select to authenticated
  using ((select public.current_app_role()) in ('ceo'::public.user_role,'hr'::public.user_role,'accountant'::public.user_role));

revoke all on public.contractor_portal_accounts from anon;
revoke all on public.contractor_edit_permits from anon;
revoke all on public.contractor_portal_submissions from anon;
revoke all on public.contractor_portal_audit from anon;
grant select on public.contractor_portal_accounts to authenticated;
grant select on public.contractor_edit_permits to authenticated;
grant select on public.contractor_portal_submissions to authenticated;
grant select on public.contractor_portal_audit to authenticated;
grant all on public.contractor_portal_accounts to service_role;
grant all on public.contractor_edit_permits to service_role;
grant all on public.contractor_portal_submissions to service_role;
grant all on public.contractor_portal_audit to service_role;

create or replace function public.fn_portal_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_account public.contractor_portal_accounts; v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'سجل الدخول أولاً'; end if;
  select * into v_account from public.contractor_portal_accounts
   where auth_user_id=(select auth.uid()) and is_active;
  if v_account.id is null then raise exception 'حساب بوابة المقاول غير مفعل'; end if;

  select jsonb_build_object(
    'account',jsonb_build_object('id',v_account.id,'contractorId',v_account.contractor_id,
      'username',v_account.username,'displayName',v_account.display_name),
    'contractor',(select jsonb_build_object('id',c.id,'name',c.name_ar,'contactName',c.contact_name)
      from public.contractors c where c.id=v_account.contractor_id),
    'projects',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'projectNo',p.project_no,'name',p.name_ar,'city',p.city,
      'startDate',pc.start_date,'endDate',pc.end_date
    ) order by p.project_no)
      from public.project_contractors pc join public.projects p on p.id=pc.project_id
      where pc.contractor_id=v_account.contractor_id and pc.is_active and p.status='active'
        and (pc.end_date is null or pc.end_date >= (now() at time zone 'Asia/Riyadh')::date)
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.fn_portal_roster(p_project_id uuid, p_work_date date)
returns table(
  laborer_id uuid, full_name text, labor_class public.labor_class, trade text, phone text,
  assignment_from date, assignment_to date, attendance_id uuid, attendance_status public.attend_status,
  attendance_notes text, last_edited_by_name text, last_edited_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_account public.contractor_portal_accounts;
begin
  select * into v_account from public.contractor_portal_accounts
   where auth_user_id=(select auth.uid()) and is_active;
  if v_account.id is null then raise exception 'حساب بوابة المقاول غير مفعل'; end if;
  if not exists (select 1 from public.project_contractors pc
    where pc.project_id=p_project_id and pc.contractor_id=v_account.contractor_id and pc.is_active) then
    raise exception 'هذا المشروع غير مفتوح لهذا المقاول';
  end if;
  return query
  select l.id,l.full_name,a.labor_class,l.trade,l.phone,a.valid_from,a.valid_to,
    at.id,at.status,at.notes,at.portal_last_edited_by_name,at.portal_last_edited_at
  from public.labor_project_assignments a
  join public.laborers l on l.id=a.laborer_id
  left join public.timesheet_days d on d.project_id=p_project_id and d.work_date=p_work_date
  left join public.attendance at on at.day_id=d.id and at.laborer_id=l.id
  where a.project_id=p_project_id and a.contractor_id=v_account.contractor_id
    and a.valid_from<=p_work_date and (a.valid_to is null or a.valid_to>=p_work_date)
  order by l.full_name;
end $$;

create or replace function public.fn_portal_add_laborer(
  p_project_id uuid, p_full_name text, p_labor_class public.labor_class,
  p_trade text default null, p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_account public.contractor_portal_accounts; v_laborer uuid; v_today date;
begin
  v_today := (now() at time zone 'Asia/Riyadh')::date;
  select * into v_account from public.contractor_portal_accounts
   where auth_user_id=(select auth.uid()) and is_active;
  if v_account.id is null then raise exception 'حساب بوابة المقاول غير مفعل'; end if;
  if char_length(btrim(coalesce(p_full_name,'')))<2 then raise exception 'اسم العامل مطلوب'; end if;
  if not exists (select 1 from public.project_contractors pc where pc.project_id=p_project_id
    and pc.contractor_id=v_account.contractor_id and pc.is_active) then raise exception 'المشروع غير متاح'; end if;
  insert into public.laborers(contractor_id,project_id,full_name,labor_class,trade,phone,is_active)
  values(v_account.contractor_id,p_project_id,btrim(p_full_name),p_labor_class,
    nullif(btrim(p_trade),''),nullif(btrim(p_phone),''),true) returning id into v_laborer;
  insert into public.labor_project_assignments(
    laborer_id,project_id,contractor_id,valid_from,labor_class,trade,source,is_active,created_by
  ) values(v_laborer,p_project_id,v_account.contractor_id,v_today,p_labor_class,
    nullif(btrim(p_trade),''),'contractor_portal',true,(select auth.uid()));
  insert into public.contractor_portal_audit(contractor_id,project_id,laborer_id,action,new_data,actor_user_id,actor_name)
  values(v_account.contractor_id,p_project_id,v_laborer,'laborer_add',
    jsonb_build_object('full_name',btrim(p_full_name),'labor_class',p_labor_class,'trade',nullif(btrim(p_trade),'')),
    (select auth.uid()),v_account.display_name);
  return v_laborer;
end $$;

create or replace function public.fn_portal_update_laborer(
  p_laborer_id uuid, p_full_name text, p_labor_class public.labor_class,
  p_trade text default null, p_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_account public.contractor_portal_accounts; v_old jsonb; v_new jsonb; v_today date; v_assignment public.labor_project_assignments;
begin
  v_today := (now() at time zone 'Asia/Riyadh')::date;
  select * into v_account from public.contractor_portal_accounts
   where auth_user_id=(select auth.uid()) and is_active;
  if v_account.id is null then raise exception 'حساب بوابة المقاول غير مفعل'; end if;
  select to_jsonb(l) into v_old from public.laborers l where l.id=p_laborer_id and l.contractor_id=v_account.contractor_id for update;
  if v_old is null then raise exception 'العامل لا يتبع هذا المقاول'; end if;
  if char_length(btrim(coalesce(p_full_name,'')))<2 then raise exception 'اسم العامل مطلوب'; end if;

  select * into v_assignment from public.labor_project_assignments a
   where a.laborer_id=p_laborer_id and a.contractor_id=v_account.contractor_id
     and a.valid_from<=v_today and (a.valid_to is null or a.valid_to>=v_today)
   order by a.valid_from desc limit 1 for update;
  if v_assignment.id is not null and (v_assignment.labor_class is distinct from p_labor_class or v_assignment.trade is distinct from nullif(btrim(p_trade),'')) then
    if v_assignment.valid_from<v_today then
      update public.labor_project_assignments set valid_to=v_today-1,is_active=false where id=v_assignment.id;
      insert into public.labor_project_assignments(
        laborer_id,project_id,contractor_id,valid_from,valid_to,labor_class,trade,pay_basis,daily_rate,source,is_active,created_by
      ) values(p_laborer_id,v_assignment.project_id,v_account.contractor_id,v_today,v_assignment.valid_to,
        p_labor_class,nullif(btrim(p_trade),''),v_assignment.pay_basis,v_assignment.daily_rate,
        'contractor_portal',true,(select auth.uid()));
    else
      update public.labor_project_assignments set labor_class=p_labor_class,trade=nullif(btrim(p_trade),'') where id=v_assignment.id;
    end if;
  end if;
  update public.laborers set full_name=btrim(p_full_name),labor_class=p_labor_class,
    trade=nullif(btrim(p_trade),''),phone=nullif(btrim(p_phone),'') where id=p_laborer_id
    returning to_jsonb(laborers) into v_new;
  insert into public.contractor_portal_audit(contractor_id,project_id,laborer_id,action,old_data,new_data,actor_user_id,actor_name)
  values(v_account.contractor_id,v_assignment.project_id,p_laborer_id,'laborer_update',v_old,v_new,(select auth.uid()),v_account.display_name);
  return true;
end $$;

create or replace function public.fn_issue_contractor_edit_permit(
  p_contractor_id uuid, p_project_id uuid, p_attendance_from date, p_attendance_to date,
  p_reason text, p_expires_hours integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid:=gen_random_uuid(); v_code text; v_permit public.contractor_edit_permits;
begin
  if (select public.current_app_role()) not in ('ceo'::public.user_role,'hr'::public.user_role) then raise exception 'لا تملك صلاحية إصدار التصريح'; end if;
  if p_attendance_to<p_attendance_from or p_attendance_to-p_attendance_from>31 then raise exception 'فترة التصريح غير صحيحة أو تتجاوز 31 يومًا'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<5 then raise exception 'اكتب سببًا واضحًا للتصريح'; end if;
  v_code := lpad((floor(random()*1000000))::integer::text,6,'0');
  insert into public.contractor_edit_permits(
    id,contractor_id,project_id,permit_kind,code_hash,code_hint,attendance_from,attendance_to,
    expires_at,reason,issued_by
  ) values(v_id,p_contractor_id,p_project_id,'code',encode(digest(v_id::text||':'||v_code,'sha256'),'hex'),
    right(v_code,2),p_attendance_from,p_attendance_to,now()+make_interval(hours=>greatest(1,least(p_expires_hours,168))),
    btrim(p_reason),(select auth.uid())) returning * into v_permit;
  return jsonb_build_object('id',v_id,'code',v_code,'attendanceFrom',v_permit.attendance_from,
    'attendanceTo',v_permit.attendance_to,'expiresAt',v_permit.expires_at);
end $$;

create or replace function public.fn_revoke_contractor_edit_permit(p_permit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) not in ('ceo'::public.user_role,'hr'::public.user_role) then raise exception 'لا تملك صلاحية إلغاء التصريح'; end if;
  update public.contractor_edit_permits set revoked_at=now(),revoked_by=(select auth.uid())
   where id=p_permit_id and revoked_at is null;
  return found;
end $$;

create or replace function public.fn_portal_save_attendance(
  p_request_id uuid, p_project_id uuid, p_work_date date, p_rows jsonb, p_edit_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.contractor_portal_accounts; v_today date; v_permit public.contractor_edit_permits;
  v_submission public.contractor_portal_submissions; v_day_id uuid; v_row jsonb;
  v_laborer uuid; v_status text; v_old jsonb; v_new jsonb; v_attendance uuid;
  v_changes jsonb:='[]'::jsonb; v_count integer:=0;
begin
  v_today := (now() at time zone 'Asia/Riyadh')::date;
  if p_request_id is null then raise exception 'معرّف الحفظ مطلوب'; end if;
  select * into v_account from public.contractor_portal_accounts
   where auth_user_id=(select auth.uid()) and is_active for update;
  if v_account.id is null then raise exception 'حساب بوابة المقاول غير مفعل'; end if;
  if p_work_date>v_today then raise exception 'لا يمكن تسجيل حضور تاريخ مستقبلي'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'قائمة الحضور فارغة'; end if;
  if not exists (select 1 from public.project_contractors pc where pc.project_id=p_project_id
    and pc.contractor_id=v_account.contractor_id and pc.is_active) then raise exception 'المشروع غير متاح لهذا المقاول'; end if;

  select * into v_submission from public.contractor_portal_submissions where request_id=p_request_id;
  if v_submission.id is not null then
    return jsonb_build_object('receiptNo',v_submission.receipt_no,'duplicatePrevented',true,'rowsCount',v_submission.rows_count);
  end if;

  if p_work_date<v_today then
    select * into v_permit from public.contractor_edit_permits pe
     where pe.contractor_id=v_account.contractor_id and pe.project_id=p_project_id
       and pe.permit_kind='delegation' and pe.permitted_person_name=v_account.display_name
       and p_work_date between pe.attendance_from and pe.attendance_to
       and now() between pe.starts_at and pe.expires_at and pe.revoked_at is null and pe.use_count<pe.max_uses
     order by pe.expires_at desc limit 1 for update;
    if v_permit.id is null then
      if v_account.code_locked_until is not null and v_account.code_locked_until>now() then raise exception 'أوقفت محاولات الرمز مؤقتًا؛ حاول لاحقًا'; end if;
      select * into v_permit from public.contractor_edit_permits pe
       where pe.contractor_id=v_account.contractor_id and pe.project_id=p_project_id
         and pe.permit_kind='code' and p_work_date between pe.attendance_from and pe.attendance_to
         and now() between pe.starts_at and pe.expires_at and pe.revoked_at is null and pe.use_count<pe.max_uses
         and pe.code_hash=encode(digest(pe.id::text||':'||coalesce(p_edit_code,''),'sha256'),'hex')
       order by pe.expires_at desc limit 1 for update;
      if v_permit.id is null then
        update public.contractor_portal_accounts set failed_code_attempts=least(failed_code_attempts+1,20),
          code_locked_until=case when failed_code_attempts+1>=5 then now()+interval '15 minutes' else code_locked_until end
        where id=v_account.id;
        raise exception 'اليوم السابق مقفول؛ اطلب تصريحًا صحيحًا من الإدارة';
      end if;
    end if;
    update public.contractor_portal_accounts set failed_code_attempts=0,code_locked_until=null where id=v_account.id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','portal-attendance',v_account.contractor_id,p_project_id,p_work_date),0));
  insert into public.timesheet_days(project_id,work_date) values(p_project_id,p_work_date)
  on conflict(project_id,work_date) do update set work_date=excluded.work_date returning id into v_day_id;
  insert into public.contractor_portal_submissions(
    request_id,contractor_id,project_id,work_date,permit_id,submitted_by,actor_name
  ) values(p_request_id,v_account.contractor_id,p_project_id,p_work_date,v_permit.id,(select auth.uid()),v_account.display_name)
  returning * into v_submission;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_laborer:=nullif(v_row->>'laborerId','')::uuid; v_status:=coalesce(v_row->>'status','');
    if v_status not in ('full','half','absent','stopped','leave','unrecorded') then raise exception 'حالة حضور غير صحيحة'; end if;
    if not exists (select 1 from public.labor_project_assignments a where a.laborer_id=v_laborer
      and a.project_id=p_project_id and a.contractor_id=v_account.contractor_id
      and a.valid_from<=p_work_date and (a.valid_to is null or a.valid_to>=p_work_date)) then
      raise exception 'أحد العمال لا يتبع المقاول في هذا المشروع والتاريخ';
    end if;
    select to_jsonb(a),a.id into v_old,v_attendance from public.attendance a where a.day_id=v_day_id and a.laborer_id=v_laborer for update;
    if v_status='unrecorded' then
      delete from public.attendance where id=v_attendance;
      v_new:=null;
    else
      insert into public.attendance(day_id,laborer_id,status,rate_used,notes,portal_last_edited_by,
        portal_last_edited_by_name,portal_last_edited_at,portal_submission_id)
      values(v_day_id,v_laborer,v_status::public.attend_status,0,nullif(btrim(v_row->>'notes'),''),
        (select auth.uid()),v_account.display_name,now(),v_submission.id)
      on conflict(day_id,laborer_id) do update set status=excluded.status,notes=excluded.notes,
        portal_last_edited_by=excluded.portal_last_edited_by,portal_last_edited_by_name=excluded.portal_last_edited_by_name,
        portal_last_edited_at=excluded.portal_last_edited_at,portal_submission_id=excluded.portal_submission_id
      returning id,to_jsonb(attendance) into v_attendance,v_new;
    end if;
    insert into public.contractor_portal_audit(
      contractor_id,project_id,laborer_id,attendance_id,submission_id,permit_id,action,
      old_data,new_data,actor_user_id,actor_name
    ) values(v_account.contractor_id,p_project_id,v_laborer,v_attendance,v_submission.id,v_permit.id,
      case when v_new is null then 'attendance_delete' when v_old is null then 'attendance_insert' else 'attendance_update' end,
      v_old,v_new,(select auth.uid()),v_account.display_name);
    v_changes:=v_changes||jsonb_build_array(jsonb_build_object('laborerId',v_laborer,'before',v_old,'after',v_new));
    v_count:=v_count+1;
  end loop;
  update public.contractor_portal_submissions set rows_count=v_count,change_summary=v_changes where id=v_submission.id
   returning * into v_submission;
  if v_permit.id is not null then update public.contractor_edit_permits set use_count=use_count+1 where id=v_permit.id; end if;
  return jsonb_build_object('receiptNo',v_submission.receipt_no,'duplicatePrevented',false,
    'rowsCount',v_count,'savedAt',v_submission.submitted_at,'actorName',v_account.display_name);
end $$;

revoke execute on function public.fn_portal_dashboard() from public,anon;
revoke execute on function public.fn_portal_roster(uuid,date) from public,anon;
revoke execute on function public.fn_portal_add_laborer(uuid,text,public.labor_class,text,text) from public,anon;
revoke execute on function public.fn_portal_update_laborer(uuid,text,public.labor_class,text,text) from public,anon;
revoke execute on function public.fn_issue_contractor_edit_permit(uuid,uuid,date,date,text,integer) from public,anon;
revoke execute on function public.fn_revoke_contractor_edit_permit(uuid) from public,anon;
revoke execute on function public.fn_portal_save_attendance(uuid,uuid,date,jsonb,text) from public,anon;
grant execute on function public.fn_portal_dashboard() to authenticated;
grant execute on function public.fn_portal_roster(uuid,date) to authenticated;
grant execute on function public.fn_portal_add_laborer(uuid,text,public.labor_class,text,text) to authenticated;
grant execute on function public.fn_portal_update_laborer(uuid,text,public.labor_class,text,text) to authenticated;
grant execute on function public.fn_issue_contractor_edit_permit(uuid,uuid,date,date,text,integer) to authenticated;
grant execute on function public.fn_revoke_contractor_edit_permit(uuid) to authenticated;
grant execute on function public.fn_portal_save_attendance(uuid,uuid,date,jsonb,text) to authenticated;

comment on table public.contractor_portal_audit is 'سجل داخلي لتعديلات المقاول؛ لا يعرض في المطبوعات.';
comment on column public.attendance.portal_last_edited_by_name is 'اسم مسؤول المقاول الذي نفذ آخر تعديل إلكتروني؛ للواجهة الداخلية فقط.';
