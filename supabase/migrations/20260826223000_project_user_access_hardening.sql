-- Project-scoped employee users: enforce first-login password change and close
-- project data paths that were broader than the central capability engine.

create or replace function public.confirm_own_password_change()
returns boolean
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.app_users
  set must_change_password = false,
      temporary_password_set_at = null,
      password_changed_at = now()
  where id = auth.uid()
    and is_active;

  if not found then
    raise exception 'ACTIVE_APP_USER_REQUIRED';
  end if;

  return true;
end;
$$;

revoke all on function public.confirm_own_password_change() from public;
grant execute on function public.confirm_own_password_change() to authenticated;

-- A project user must only read/write measurements for projects granted by
-- the existing capability engine. The former policies only checked that the
-- user was active, which was too broad for project-scoped accounts.
drop policy if exists item_measurements_active_user_select on public.item_measurements;
drop policy if exists item_measurements_active_user_insert on public.item_measurements;
drop policy if exists item_measurements_active_user_update on public.item_measurements;
drop policy if exists item_measurements_active_user_delete on public.item_measurements;

create policy item_measurements_project_select
on public.item_measurements
for select
to authenticated
using (
  public.has_project_capability('projects.progress.view', project_id, amount)
  or public.has_project_capability('finance.projects.view', project_id, amount)
);

create policy item_measurements_project_insert
on public.item_measurements
for insert
to authenticated
with check (
  public.has_project_capability('projects.progress.edit', project_id, amount)
);

create policy item_measurements_project_update
on public.item_measurements
for update
to authenticated
using (
  public.has_project_capability('projects.progress.edit', project_id, amount)
)
with check (
  public.has_project_capability('projects.progress.edit', project_id, amount)
);

create policy item_measurements_project_delete
on public.item_measurements
for delete
to authenticated
using (
  public.has_project_capability('projects.progress.edit', project_id, amount)
);

-- Contractor portal submissions: correlate the signed-in portal account with
-- the OUTER submission contractor. The previous self-comparison could allow a
-- contractor portal account to read submissions belonging to another contractor.
drop policy if exists contractor_portal_submissions_read_cap on public.contractor_portal_submissions;

create policy contractor_portal_submissions_read_cap
on public.contractor_portal_submissions
for select
to authenticated
using (
  exists (
    select 1
    from public.contractor_portal_accounts a
    where a.auth_user_id = auth.uid()
      and a.is_active
      and a.contractor_id = contractor_portal_submissions.contractor_id
  )
  or public.has_project_capability('projects.timesheets.view', project_id, null)
  or public.has_project_capability('finance.projects.view', project_id, null)
);

-- The project list consumes this view directly. Make it honor the invoking
-- user's grants/RLS instead of the view owner's privileges.
alter view public.v_project_financials set (security_invoker = true);
