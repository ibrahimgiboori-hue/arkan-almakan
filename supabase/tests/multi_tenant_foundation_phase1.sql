-- Multi-tenant phase 1 verification
-- Run only against the disposable arkan-al-makan-dev project.
-- Rollback-only: leaves no test data behind.

begin;

create temporary table mt_phase1_results (
  test_name text primary key,
  passed boolean not null
) on commit drop;
grant select, insert on mt_phase1_results to authenticated;

do $$
declare
  v_user uuid;
  v_org_a uuid;
  v_org_b uuid;
begin
  select id into v_user from auth.users order by created_at asc limit 1;
  if v_user is null then
    raise exception 'No auth.users row exists in the dev project';
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

insert into mt_phase1_results values (
  'member_can_read_own_tenant',
  (select count(*) from public.organizations
   where id=current_setting('app.test_org_a',true)::uuid)=1
);

insert into mt_phase1_results values (
  'member_cannot_read_other_tenant',
  (select count(*) from public.organizations
   where id=current_setting('app.test_org_b',true)::uuid)=0
);

select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.test_org_b',true))::text,
  true
);
insert into mt_phase1_results values (
  'forged_tenant_header_is_rejected',
  public.current_organization_id() is null
);

select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.test_org_a',true))::text,
  true
);
insert into mt_phase1_results values (
  'own_tenant_header_is_accepted',
  public.current_organization_id()=current_setting('app.test_org_a',true)::uuid
);

reset role;

insert into mt_phase1_results values (
  'anon_has_no_organization_select_grant',
  not has_table_privilege('anon','public.organizations','SELECT')
);

select test_name, passed
from mt_phase1_results
order by test_name;

rollback;
