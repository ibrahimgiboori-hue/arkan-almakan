-- Organization membership governance verification.
-- Run only in disposable multi-tenant test environments.

begin;

create temporary table mt_membership_guard_results(
  test_name text primary key,
  passed boolean not null
) on commit drop;
grant select,insert on mt_membership_guard_results to authenticated;

select set_config(
  'app.test_user',
  (select id::text from auth.users order by created_at asc limit 1),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',current_setting('app.test_user',true),
    'role','authenticated'
  )::text,
  true
);

do $$
begin
  begin
    insert into public.organizations(slug,name_ar,name_en)
    values ('unauthorized-org-create','غير مصرح','Unauthorized');
    insert into mt_membership_guard_results values ('non_platform_user_cannot_create_org',false);
  exception when insufficient_privilege then
    insert into mt_membership_guard_results values ('non_platform_user_cannot_create_org',true);
  when others then
    if sqlstate='42501' then
      insert into mt_membership_guard_results values ('non_platform_user_cannot_create_org',true);
    else
      raise;
    end if;
  end;
end $$;

do $$
begin
  begin
    update public.organization_memberships
       set status='revoked'
     where user_id=current_setting('app.test_user',true)::uuid
       and membership_role='owner'
       and status='active';
    insert into mt_membership_guard_results values ('last_owner_cannot_be_revoked',false);
  exception when check_violation then
    insert into mt_membership_guard_results values ('last_owner_cannot_be_revoked',true);
  end;
end $$;

select test_name,passed
from mt_membership_guard_results
order by test_name;

rollback;
