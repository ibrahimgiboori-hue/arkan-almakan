-- Wave 1 multi-tenant isolation verification.
-- Requires the disposable test environment with the Wave 1 representative roots.

begin;

create temporary table mt_wave1_results(
  test_name text primary key,
  passed boolean not null,
  detail text null
) on commit drop;
grant select,insert on mt_wave1_results to authenticated;

select set_config('app.test_user',(select id::text from auth.users order by created_at asc limit 1),true);
select set_config('app.org_a',(select id::text from public.organizations where slug='arkan-al-makan'),true);

with created as (
  insert into public.organizations(slug,name_ar,name_en)
  values ('tenant-b-wave1','شركة ب','Tenant B')
  returning id
)
select set_config('app.org_b',(select id::text from created),true);

insert into public.organization_settings(
  organization_id,company_name_ar,company_name_en,document_prefix
)
values (current_setting('app.org_b',true)::uuid,'شركة ب','Tenant B','BCO');

insert into public.organization_modules(organization_id,module_key,status)
select current_setting('app.org_b',true)::uuid,module_key,'active'
from public.platform_modules;

insert into public.organization_memberships(
  organization_id,user_id,membership_role,status,is_default,joined_at
)
values (
  current_setting('app.org_b',true)::uuid,
  current_setting('app.test_user',true)::uuid,
  'owner','active',false,now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub',current_setting('app.test_user',true),'role','authenticated')::text,
  true
);

select set_config('request.headers','{}',true);
insert into mt_wave1_results
select 'default_context_is_tenant_a',
       public.current_organization_id()=current_setting('app.org_a',true)::uuid,
       null;

select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.org_a',true))::text,
  true
);
insert into mt_wave1_results
select 'active_a_sees_only_a_employees',count(*)=1,count(*)::text
from public.employees;

do $$
begin
  begin
    insert into public.employees(organization_id,employee_no,name_ar)
    values (current_setting('app.org_b',true)::uuid,'BYPASS-1','محاولة عابرة');
    insert into mt_wave1_results values ('active_a_cannot_write_b',false,'write unexpectedly succeeded');
  exception when others then
    insert into mt_wave1_results values ('active_a_cannot_write_b',sqlstate='42501',sqlstate);
  end;
end $$;

select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.org_b',true))::text,
  true
);

do $$
begin
  begin
    insert into public.employees(employee_no,name_ar) values ('E001','موظف شركة ب');
    insert into mt_wave1_results values ('same_employee_no_allowed_across_tenants',true,null);
  exception when unique_violation then
    insert into mt_wave1_results values ('same_employee_no_allowed_across_tenants',false,sqlerrm);
  end;
end $$;

insert into public.entities(entity_code,name_ar) values ('C001','عميل شركة ب');

do $$
begin
  begin
    insert into public.projects(project_no,name_ar,entity_id,originator_id,supervisor_id)
    select 'P001','مشروع شركة ب',en.id,em.id,em.id
    from public.entities en
    cross join public.employees em
    where en.organization_id=current_setting('app.org_b',true)::uuid
      and em.organization_id=current_setting('app.org_b',true)::uuid
    limit 1;
    insert into mt_wave1_results values ('same_project_no_allowed_across_tenants',true,null);
  exception when unique_violation then
    insert into mt_wave1_results values ('same_project_no_allowed_across_tenants',false,sqlerrm);
  end;
end $$;

insert into mt_wave1_results
select 'active_b_sees_only_b_employees',count(*)=1,count(*)::text
from public.employees;
insert into mt_wave1_results
select 'active_b_sees_only_b_projects',count(*)=1,count(*)::text
from public.projects;

select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.org_a',true))::text,
  true
);

do $$
declare v_b_entity uuid;
begin
  reset role;
  select id into v_b_entity
  from public.entities
  where organization_id=current_setting('app.org_b',true)::uuid
  limit 1;
  set local role authenticated;
  begin
    insert into public.projects(project_no,name_ar,entity_id)
    values ('P-CROSS','مشروع عابر',v_b_entity);
    insert into mt_wave1_results values ('cross_tenant_fk_is_rejected',false,'cross-tenant reference succeeded');
  exception when foreign_key_violation then
    insert into mt_wave1_results values ('cross_tenant_fk_is_rejected',true,sqlstate);
  end;
end $$;

with updated as (
  update public.organization_settings
  set company_name_en='SHOULD NOT CHANGE'
  where organization_id=current_setting('app.org_b',true)::uuid
  returning 1
)
insert into mt_wave1_results
select 'active_a_cannot_edit_b_settings',count(*)=0,count(*)::text
from updated;

insert into mt_wave1_results
select 'arkan_numbering_keeps_ark_prefix',
       public.next_document_number('payment_voucher','PAY') like 'ARK-PAY-%',
       null;

select set_config(
  'request.headers',
  jsonb_build_object('x-organization-id',current_setting('app.org_b',true))::text,
  true
);
insert into mt_wave1_results
select 'tenant_b_numbering_is_independent',
       public.next_document_number('payment_voucher','PAY') like 'BCO-PAY-%-0001',
       null;

update public.organization_modules
set status='disabled',disabled_at=now()
where organization_id=current_setting('app.org_b',true)::uuid
  and module_key='projects';

insert into mt_wave1_results
select 'disabled_projects_module_hides_projects_from_owner',count(*)=0,count(*)::text
from public.projects;

select test_name,passed,detail
from mt_wave1_results
order by test_name;

rollback;
