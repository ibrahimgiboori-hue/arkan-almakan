do $$
declare
  v_bundle_id uuid;
begin
  insert into public.permission_bundles(
    id,bundle_key,name_ar,name_en,description_ar,is_system,is_active
  ) values (
    gen_random_uuid(),
    'project_site_supervisor',
    'مشرف موقع',
    'Site Supervisor',
    'تشغيل ميداني محدود داخل مشروع محدد: الحضور والمصروفات فقط دون صلاحيات إدارة المشروع.',
    true,
    true
  )
  on conflict (bundle_key) do update set
    name_ar=excluded.name_ar,
    name_en=excluded.name_en,
    description_ar=excluded.description_ar,
    is_active=true,
    updated_at=now();

  select id into v_bundle_id
  from public.permission_bundles
  where bundle_key='project_site_supervisor';

  insert into public.permission_bundle_capabilities(bundle_id,capability_key)
  select v_bundle_id, c.capability_key
  from public.permission_capabilities c
  where c.capability_key in (
    'projects.timesheets.view',
    'projects.timesheets.create',
    'projects.timesheets.edit',
    'projects.timesheets.submit',
    'projects.expenses.view',
    'projects.expenses.create',
    'projects.expenses.edit',
    'projects.expenses.submit'
  )
  on conflict (bundle_id,capability_key) do nothing;
end $$;

create or replace function public.has_project_module_access(p_project_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select
    public.fn_is_primary_user()
    or coalesce((select is_system_admin from public.app_users where id=auth.uid() and is_active),false)
    or exists(
      select 1
      from public.v_my_capabilities c
      where c.module_key='projects'
        and (
          c.scope_type='all'
          or (c.scope_type='project' and c.scope_key=p_project_id::text)
        )
    );
$$;

grant execute on function public.has_project_module_access(uuid) to authenticated;

alter table public.projects enable row level security;
drop policy if exists p_projects_read on public.projects;
create policy p_projects_read on public.projects
for select to authenticated
using (
  public.has_project_module_access(id)
  or public.has_project_capability('finance.projects.view',id,null)
);

create or replace function public.can_access_workspace_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists(
    select 1
    from public.workspace_tasks t
    where t.id=p_task_id
      and (t.task_type <> 'personal_task' or t.creator_user_id=auth.uid())
      and (
        t.creator_user_id=auth.uid()
        or t.assignee_user_id=auth.uid()
        or exists(
          select 1
          from public.workspace_task_participants p
          where p.task_id=t.id and p.user_id=auth.uid()
        )
      )
      and (
        t.project_id is null
        or public.has_project_module_access(t.project_id)
      )
  );
$$;

grant execute on function public.can_access_workspace_task(uuid) to authenticated;
