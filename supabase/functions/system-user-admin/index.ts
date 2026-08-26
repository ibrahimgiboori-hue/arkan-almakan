import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
});

const ACCESS_LEVELS = {
  projects_portal_full: { bundleKey: 'projects_full_access', scopeType: 'all' },
  projects_screen_full: { bundleKey: 'projects_full_access', scopeType: 'all' },
  project_supervisor: { bundleKey: 'projects_full_access', scopeType: 'project' },
  site_supervisor: { bundleKey: 'project_site_supervisor', scopeType: 'project' },
} as const;

type AccessLevelKey = keyof typeof ACCESS_LEVELS;

const MANAGED_BUNDLE_KEYS = [
  'projects_full_access',
  'project_site_supervisor',
  'project_manager',
  'project_supervisor',
  'project_originator',
];

function makeTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}

async function requireAccessManager(req: Request) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: json({ error: 'unauthorized' }, 401) };

  const caller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: allowed, error: accessError } = await caller.rpc('can_manage_access');
  if (accessError || allowed !== true) return { error: json({ error: 'forbidden' }, 403) };

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return { error: json({ error: 'unauthorized' }, 401) };
  return { admin, user };
}

async function replaceProjectAccess(admin: any, actorId: string, userId: string, accessLevel: AccessLevelKey, projectIds: string[]) {
  const level = ACCESS_LEVELS[accessLevel];
  if (!level) return { error: 'invalid_access_level' };

  const { data: bundles, error: bundleError } = await admin
    .from('permission_bundles')
    .select('id,bundle_key')
    .in('bundle_key', MANAGED_BUNDLE_KEYS)
    .eq('is_active', true);
  if (bundleError) return { error: 'bundle_lookup_failed', message: bundleError.message };

  const selected = (bundles || []).find((bundle: any) => bundle.bundle_key === level.bundleKey);
  if (!selected) return { error: 'bundle_not_found' };
  const managedIds = (bundles || []).map((bundle: any) => bundle.id);

  if (level.scopeType === 'project') {
    if (!projectIds.length) return { error: 'project_required' };
    const { data: projects, error: projectError } = await admin.from('projects').select('id').in('id', projectIds);
    if (projectError || (projects || []).length !== projectIds.length) return { error: 'project_not_found' };
  }

  if (managedIds.length) {
    const { error: disableError } = await admin
      .from('user_permission_bundles')
      .update({ is_active: false, note: 'إدارة الدخول: استبدلت صلاحية بوابة المشاريع' })
      .eq('user_id', userId)
      .in('bundle_id', managedIds);
    if (disableError) return { error: 'access_disable_failed', message: disableError.message };
  }

  if (level.scopeType === 'all') {
    const { data: existing, error: existingError } = await admin
      .from('user_permission_bundles')
      .select('id')
      .eq('user_id', userId)
      .eq('bundle_id', selected.id)
      .eq('scope_type', 'all')
      .is('scope_key', null)
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) return { error: 'access_lookup_failed', message: existingError.message };

    if (existing?.id) {
      const { error } = await admin.from('user_permission_bundles').update({
        is_active: true,
        valid_from: null,
        valid_until: null,
        granted_by: actorId,
        granted_at: new Date().toISOString(),
        note: 'إدارة الدخول: كامل بوابة المشاريع',
      }).eq('id', existing.id);
      if (error) return { error: 'access_save_failed', message: error.message };
    } else {
      const { error } = await admin.from('user_permission_bundles').insert({
        user_id: userId,
        bundle_id: selected.id,
        scope_type: 'all',
        scope_key: null,
        is_active: true,
        granted_by: actorId,
        note: 'إدارة الدخول: كامل بوابة المشاريع',
      });
      if (error) return { error: 'access_save_failed', message: error.message };
    }
  } else {
    const grants = projectIds.map((projectId) => ({
      user_id: userId,
      bundle_id: selected.id,
      scope_type: 'project',
      scope_key: projectId,
      is_active: true,
      granted_by: actorId,
      granted_at: new Date().toISOString(),
      note: `إدارة الدخول: ${accessLevel}`,
    }));
    const { error } = await admin.from('user_permission_bundles').upsert(grants, {
      onConflict: 'user_id,bundle_id,scope_type,scope_key',
    });
    if (error) return { error: 'access_save_failed', message: error.message };
  }

  return { ok: true };
}

async function userImpact(admin: any, userId: string) {
  const { data, error } = await admin.rpc('admin_user_data_impact', { p_user_id: userId });
  if (error) return { error: 'impact_scan_failed', message: error.message };
  const total = Number(data?.total || 0);
  return { ok: true, total, items: Array.isArray(data?.items) ? data.items : [] };
}

async function archiveUser(admin: any, actorId: string, userId: string, total: number) {
  const now = new Date().toISOString();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  if (banError) return { error: 'archive_auth_failed', message: banError.message };

  const { error: appError } = await admin.from('app_users').update({
    is_active: false,
    archived_at: now,
    archived_by: actorId,
    access_note: `مؤرشف من إدارة الدخول مع الاحتفاظ بالسجل التاريخي (${total} ارتباط)`,
  }).eq('id', userId);
  if (appError) return { error: 'archive_failed', message: appError.message };

  await Promise.all([
    admin.from('user_permission_bundles').update({ is_active: false, note: 'الحساب مؤرشف' }).eq('user_id', userId),
    admin.from('user_permission_overrides').update({ is_active: false, note: 'الحساب مؤرشف' }).eq('user_id', userId),
  ]);

  return { ok: true, mode: 'archived' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const gate = await requireAccessManager(req);
    if ('error' in gate) return gate.error;
    const { admin, user } = gate;
    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'directory') {
      const [employeesQ, usersQ, grantsQ, bundlesQ, projectsQ, settingsQ, authUsersQ] = await Promise.all([
        admin.from('employees').select('id,employee_no,full_name_ar,job_title,department,email,status').order('full_name_ar'),
        admin.from('app_users').select('id,employee_id,role,is_active,is_system_admin,must_change_password,temporary_password_set_at,password_changed_at,access_note,archived_at,archived_by,created_at'),
        admin.from('user_permission_bundles').select('id,user_id,bundle_id,scope_type,scope_key,is_active,valid_from,valid_until,note,granted_at'),
        admin.from('permission_bundles').select('id,bundle_key,name_ar,description_ar,is_active').in('bundle_key', MANAGED_BUNDLE_KEYS),
        admin.from('projects').select('id,project_no,name_ar,city,stage,status').order('project_no'),
        admin.from('system_access_settings').select('primary_user_id').eq('singleton', true).maybeSingle(),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      const firstError = [employeesQ, usersQ, grantsQ, bundlesQ, projectsQ, settingsQ].find((q) => q.error)?.error;
      if (firstError) return json({ error: 'directory_failed', message: firstError.message }, 400);
      const emailById = new Map((authUsersQ.data?.users || []).map((item: any) => [item.id, item.email || '']));
      const users = (usersQ.data || []).map((item: any) => ({ ...item, auth_email: emailById.get(item.id) || '' }));
      return json({
        ok: true,
        employees: employeesQ.data || [],
        users,
        grants: grantsQ.data || [],
        bundles: bundlesQ.data || [],
        projects: projectsQ.data || [],
        primaryUserId: settingsQ.data?.primary_user_id || null,
      });
    }

    if (action === 'provision') {
      const employeeId = String(body.employeeId || '');
      const accessLevel = String(body.accessLevel || 'projects_portal_full') as AccessLevelKey;
      const projectIds = Array.isArray(body.projectIds) ? [...new Set(body.projectIds.map(String).filter(Boolean))] : [];
      if (!employeeId) return json({ error: 'employee_required' }, 400);
      if (!ACCESS_LEVELS[accessLevel]) return json({ error: 'invalid_access_level' }, 400);

      const { data: employee, error: employeeError } = await admin
        .from('employees')
        .select('id,employee_no,full_name_ar,email,status')
        .eq('id', employeeId)
        .maybeSingle();
      if (employeeError || !employee) return json({ error: 'employee_not_found' }, 404);
      if (!employee.email) return json({ error: 'employee_email_required' }, 400);

      const { data: existingByEmployee } = await admin.from('app_users').select('id,archived_at').eq('employee_id', employeeId).maybeSingle();
      if (existingByEmployee) return json({ error: existingByEmployee.archived_at ? 'archived_account_exists' : 'account_exists' }, 409);

      const normalizedEmail = String(employee.email).trim().toLowerCase();
      const authList = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existingAuth = (authList.data?.users || []).find((item: any) => String(item.email || '').toLowerCase() === normalizedEmail);
      const password = makeTemporaryPassword();
      let authUser = existingAuth || null;

      if (authUser) {
        const { data: existingApp } = await admin.from('app_users').select('id,employee_id,archived_at').eq('id', authUser.id).maybeSingle();
        if (existingApp) return json({ error: existingApp.archived_at ? 'archived_account_exists' : 'email_account_exists' }, 409);
        const { error: passwordError } = await admin.auth.admin.updateUserById(authUser.id, {
          password,
          email_confirm: true,
          app_metadata: { account_type: 'employee', employee_id: employee.id },
          user_metadata: { display_name: employee.full_name_ar },
        });
        if (passwordError) return json({ error: 'auth_update_failed', message: passwordError.message }, 400);
      } else {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          app_metadata: { account_type: 'employee', employee_id: employee.id },
          user_metadata: { display_name: employee.full_name_ar },
        });
        if (createError || !created.user) return json({ error: 'auth_create_failed', message: createError?.message || 'تعذر إنشاء حساب الدخول' }, 400);
        authUser = created.user;
      }

      const now = new Date().toISOString();
      const { error: appUserError } = await admin.from('app_users').upsert({
        id: authUser.id,
        employee_id: employee.id,
        role: 'supervisor',
        is_active: true,
        is_system_admin: false,
        must_change_password: true,
        temporary_password_set_at: now,
        archived_at: null,
        archived_by: null,
        access_note: 'أُنشئ من إدارة الدخول وفق هرمية البوابات',
      }, { onConflict: 'id' });
      if (appUserError) return json({ error: 'app_user_create_failed', message: appUserError.message }, 400);

      const accessResult = await replaceProjectAccess(admin, user.id, authUser.id, accessLevel, projectIds);
      if ('error' in accessResult) return json(accessResult, 400);

      return json({
        ok: true,
        account: { userId: authUser.id, employeeId: employee.id, email: normalizedEmail, displayName: employee.full_name_ar, isActive: true },
        temporaryPassword: password,
      });
    }

    const userId = String(body.userId || '');
    if (!userId) return json({ error: 'user_required' }, 400);
    const { data: appUser, error: lookupError } = await admin
      .from('app_users')
      .select('id,employee_id,is_active,is_system_admin,archived_at')
      .eq('id', userId)
      .maybeSingle();
    if (lookupError || !appUser) return json({ error: 'account_not_found' }, 404);

    const { data: settings } = await admin.from('system_access_settings').select('primary_user_id').eq('singleton', true).maybeSingle();
    const isPrimaryTarget = settings?.primary_user_id === userId;

    if (action === 'delete_preview') {
      if (isPrimaryTarget) return json({ error: 'primary_user_protected' }, 400);
      if (appUser.id === user.id) return json({ error: 'cannot_delete_self' }, 400);
      const impact = await userImpact(admin, userId);
      if ('error' in impact) return json(impact, 400);
      return json({
        ok: true,
        mode: impact.total === 0 ? 'delete' : 'archive',
        impactCount: impact.total,
        impactItems: impact.items,
      });
    }

    if (action === 'delete_user') {
      if (isPrimaryTarget) return json({ error: 'primary_user_protected' }, 400);
      if (appUser.id === user.id) return json({ error: 'cannot_delete_self' }, 400);
      const impact = await userImpact(admin, userId);
      if ('error' in impact) return json(impact, 400);

      if (impact.total > 0) {
        const archived = await archiveUser(admin, user.id, userId, impact.total);
        if ('error' in archived) return json(archived, 400);
        return json({ ok: true, mode: 'archived', impactCount: impact.total });
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (!deleteError) return json({ ok: true, mode: 'deleted', impactCount: 0 });

      const archived = await archiveUser(admin, user.id, userId, 0);
      if ('error' in archived) return json({ error: 'delete_failed', message: deleteError.message }, 400);
      return json({ ok: true, mode: 'archived', impactCount: 0, safeguarded: true });
    }

    if (appUser.archived_at) return json({ error: 'account_archived' }, 409);

    if (action === 'reset_password') {
      if (isPrimaryTarget) return json({ error: 'primary_user_protected' }, 400);
      const password = makeTemporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: 'password_reset_failed', message: error.message }, 400);
      const { error: flagError } = await admin.from('app_users').update({
        must_change_password: true,
        temporary_password_set_at: new Date().toISOString(),
      }).eq('id', userId);
      if (flagError) return json({ error: 'password_flag_failed', message: flagError.message }, 400);
      return json({ ok: true, temporaryPassword: password });
    }

    if (action === 'set_active') {
      if (isPrimaryTarget) return json({ error: 'primary_user_protected' }, 400);
      if (appUser.id === user.id && body.isActive === false) return json({ error: 'cannot_disable_self' }, 400);
      const isActive = Boolean(body.isActive);
      const { error } = await admin.from('app_users').update({ is_active: isActive }).eq('id', userId);
      if (error) return json({ error: 'status_update_failed', message: error.message }, 400);
      return json({ ok: true, isActive });
    }

    if (action === 'set_access_level') {
      if (isPrimaryTarget) return json({ error: 'primary_user_protected' }, 400);
      const accessLevel = String(body.accessLevel || '') as AccessLevelKey;
      const projectIds = Array.isArray(body.projectIds) ? [...new Set(body.projectIds.map(String).filter(Boolean))] : [];
      if (!ACCESS_LEVELS[accessLevel]) return json({ error: 'invalid_access_level' }, 400);
      const result = await replaceProjectAccess(admin, user.id, userId, accessLevel, projectIds);
      if ('error' in result) return json(result, 400);
      return json({ ok: true });
    }

    if (action === 'set_project_access') {
      if (isPrimaryTarget) return json({ error: 'primary_user_protected' }, 400);
      const projectId = String(body.projectId || '');
      const result = await replaceProjectAccess(admin, user.id, userId, 'project_supervisor', projectId ? [projectId] : []);
      if ('error' in result) return json(result, 400);
      return json({ ok: true });
    }

    if (action === 'revoke_project_access') {
      if (isPrimaryTarget) return json({ error: 'primary_user_protected' }, 400);
      const projectId = String(body.projectId || '');
      if (!projectId) return json({ error: 'project_required' }, 400);
      const { data: bundles } = await admin.from('permission_bundles').select('id').in('bundle_key', MANAGED_BUNDLE_KEYS);
      const ids = (bundles || []).map((bundle: any) => bundle.id);
      if (ids.length) {
        const { error } = await admin.from('user_permission_bundles')
          .update({ is_active: false, note: 'إدارة الدخول: أُلغي إسناد المشروع' })
          .eq('user_id', userId)
          .eq('scope_type', 'project')
          .eq('scope_key', projectId)
          .in('bundle_id', ids);
        if (error) return json({ error: 'project_access_revoke_failed', message: error.message }, 400);
      }
      return json({ ok: true });
    }

    return json({ error: 'unsupported_action' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: 'internal_error' }, 500);
  }
});
