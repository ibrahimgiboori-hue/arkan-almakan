-- Multi-tenant phase 1 verification
-- Run only against the disposable arkan-al-makan-dev project.
-- This script is intentionally rollback-only: it leaves no test data behind.

begin;

do $$
declare
  v_user uuid;
  v_org_a uuid;
  v_org_b uuid;
begin
  select id into v_user from auth.users order by created_at asc limit 1;
  if v_user is null then
    raise exception 'No auth.users row exists in the dev project; create/sign in a dev user before running RLS identity tests';
  end if;

  insert into public.organizations(slug,name_ar,name_en)
  values ('tenant-a-rls-test','منشأة الاختبار أ','Tenant A RLS Test')
  returning id into v_org_a;

  insert into public.organizations(slug,name_ar,name_en)
  values ('tenant-b-rls-test','منشأة الاختبار ب','Tenant B RLS Test')
  returning id into v_org_b;

  insert into public.organization_memberships(
    organization_id,user_id,membership_role,status,is_default,joined_at
  )
  values (v_org_a,v_user,'owner','active',true,now());

  -- Persist IDs for the SQL checks below.
  perform set_config('app.test_user',v_user::text,true);
  perform set_config('app.test_org_a',v_org_a::text,true);
  perform set_config('app.test_org_b',v_org_b::text,true);
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',current_setting('app.test_user',true),
    'role','authenticated'
  )::text,
  true
);

-- A member must see tenant A.
select case when count(*)=1 then true else false end as can_read_own_tenant
from public.organizations
where id=current_setting('app.test_org_a',true)::uuid;

-- The same user must not see tenant B.
select case when count(*)=0 then true else false end as cannot_read_other_tenant
from public.organizations
where id=current_setting('app.test_org_b',true)::uuid;

-- Explicitly requesting tenant B must fail closed: current org becomes NULL.
select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.test_org_b',true))::text,
  true
);
select public.current_organization_id() is null as forged_tenant_header_is_rejected;

-- Requesting tenant A must resolve tenant A.
select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.test_org_a',true))::text,
  true
);
select public.current_organization_id()=current_setting('app.test_org_a',true)::uuid
  as own_tenant_header_is_accepted;

-- Anonymous access must expose neither tenant.
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select count(*)=0 as anon_cannot_list_organizations
from public.organizations
where id in (
  current_setting('app.test_org_a',true)::uuid,
  current_setting('app.test_org_b',true)::uuid
);

rollback;
