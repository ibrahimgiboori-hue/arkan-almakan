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

const PROJECT_BUNDLES = new Set(['project_manager', 'project_supervisor', 'project_originator']);

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
      const [employeesQ, usersQ, grantsQ, bundlesQ, projectsQ, settingsQ] = await Promise.all([
        admin.from('employees').select('id,employee_no,full_name_ar,job_title,department,email,status').order('full_name_ar'),
        admin.from('app_users').select('id,employee_id,role,is_active,is_system_admin,must_change_password,temporary_password_set_at,password_changed_at,access_note,created_at'),
        admin.from('user_permission_bundles').select('id,user_id,bundle_id,scope_type,scope_key,is_active,valid_from,valid_until,note,granted_at'),
        admin.from('permission_bundles').select('id,bundle_key,name_ar,description_ar,is_active').in('bundle_key', [...PROJECT_BUNDLES]),
        admin.from('projects').select('id,project_no,name_ar,city,stage,status').order('project_no'),
        admin.from('system_access_settings').select('primary_user_id').eq('singleton', true).maybeSingle(),
      ]);
      const firstError = [employeesQ, usersQ, grantsQ, bundlesQ, projectsQ, settingsQ].find((q) => q.error)?.error;
      if (firstError) return json({ error: 'directory_failed', message: firstError.message }, 400);
      return json({
        ok: true,
        employees: employeesQ.data || [],
        users: usersQ.data || [],
        grants: grantsQ.data || [],
        bundles: bundlesQ.data || [],
        projects: projectsQ.data || [],
        primaryUserId: settingsQ.data?.primary_user_id || null,
      });
    }

    if (action === 'provision') {
      const employeeId = String(body.employeeId || '');
      const bundleKey = String(body.bundleKey || 'project_supervisor');
      const projectIds = Array.isArray(body.projectIds) ? [...new Set(body.projectIds.map(String).filter(Boolean))] : [];
      if (!employeeId) return json({ error: 'employee_required' }, 400);
      if (!PROJECT_BUNDLES.has(bundleKey)) return json({ error: 'invalid_bundle' }, 400);
      if (!projectIds.length) return json({ error: 'project_required' }, 400);

      const { data: employee, error: employeeError } = await admin
        .from('employees')
        .select('id,employee_no,full_name_ar,email,status')
        .eq('id', employeeId)
        .maybeSingle();
      if (employeeError || !employee) return json({ error: 'employee_not_found' }, 404);
      if (!employee.email) return json({ error: 'employee_email_required' }, 400);

      const { data: existing } = await admin.from('app_users').select('id').eq('employee_id', employeeId).maybeSingle();
      if (existing) return json({ error: 'account_exists' }, 409);

      const { data: projects, error: projectError } = await admin.from('projects').select('id').in('id', projectIds);
      if (projectError || (projects || []).length !== projectIds.length) return json({ error: 'project_not_found' }, 400);
      const { data: bundle, error: bundleError } = await admin.from('permission_bundles').select('id,bundle_key').eq('bundle_key', bundleKey).eq('is_active', true).maybeSingle();
      if (bundleError || !bundle) return json({ error: 'bundle_not_found' }, 400);

      const password = makeTemporaryPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: String(employee.email).trim().toLowerCase(),
        password,
        email_confirm: true,
        app_metadata: { account_type: 'employee', employee_id: employee.id },
        user_metadata: { display_name: employee.full_name_ar },
      });
      if (createError || !created.user) return json({ error: 'auth_create_failed', message: createError?.message || 'تعذر إنشاء حساب الدخول' }, 400);

      const now = new Date().toISOString();
      const { error: appUserError } = await admin.from('app_users').insert({
        id: created.user.id,
        employee_id: employee.id,
        role: 'supervisor',
        is_active: true,
        is_system_admin: false,
        must_change_password: true,
        temporary_password_set_at: now,
        access_note: 'أُنشئ من إدارة الدخول بصلاحيات مشاريع محددة',
      });
      if (appUserError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: 'app_user_create_failed', message: appUserError.message }, 400);
      }

      const grants = projectIds.map((projectId) => ({
        user_id: created.user.id,
        bundle_id: bundle.id,
        scope_type: 'project',
        scope_key: projectId,
        is_active: true,
        granted_by: user.id,
        note: `إدارة الدخول: ${bundle.bundle_key}`,
      }));
      const { error: grantError } = await admin.from('user_permission_bundles').upsert(grants, {
        onConflict: 'user_id,bundle_id,scope_type,scope_key',
      });
      if (grantError) {
        await admin.from('app_users').delete().eq('id', created.user.id);
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: 'project_access_failed', message: grantError.message }, 400);
      }

      return json({
        ok: true,
        account: { userId: created.user.id, employeeId: employee.id, email: employee.email, displayName: employee.full_name_ar, isActive: true },
        temporaryPassword: password,
      });
    }

    const userId = String(body.userId || '');
    if (!userId) return json({ error: 'user_required' }, 400);
    const { data: appUser, error: lookupError } = await admin.from('app_users').select('id,employee_id,is_active,is_system_admin').eq('id', userId).maybeSingle();
    if (lookupError || !appUser) return json({ error: 'account_not_found' }, 404);
    if (appUser.id === user.id && ['set_active'].includes(action) && body.isActive === false) return json({ error: 'cannot_disable_self' }, 400);

    if (action === 'reset_password') {
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
      const isActive = Boolean(body.isActive);
      const { error } = await admin.from('app_users').update({ is_active: isActive }).eq('id', userId);
      if (error) return json({ error: 'status_update_failed', message: error.message }, 400);
      return json({ ok: true, isActive });
    }

    if (action === 'set_project_access') {
      const projectId = String(body.projectId || '');
      const bundleKey = String(body.bundleKey || '');
      if (!projectId || !PROJECT_BUNDLES.has(bundleKey)) return json({ error: 'invalid_project_access' }, 400);

      const { data: bundles, error: bundlesError } = await admin.from('permission_bundles').select('id,bundle_key').in('bundle_key', [...PROJECT_BUNDLES]);
      if (bundlesError) return json({ error: 'bundle_lookup_failed', message: bundlesError.message }, 400);
      const selected = (bundles || []).find((bundle) => bundle.bundle_key === bundleKey);
      if (!selected) return json({ error: 'bundle_not_found' }, 400);
      const bundleIds = (bundles || []).map((bundle) => bundle.id);

      if (bundleIds.length) {
        const { error: disableError } = await admin.from('user_permission_bundles')
          .update({ is_active: false, note: 'إدارة الدخول: استبدلت صلاحية المشروع' })
          .eq('user_id', userId)
          .eq('scope_type', 'project')
          .eq('scope_key', projectId)
          .in('bundle_id', bundleIds);
        if (disableError) return json({ error: 'project_access_disable_failed', message: disableError.message }, 400);
      }

      const { error: grantError } = await admin.from('user_permission_bundles').upsert({
        user_id: userId,
        bundle_id: selected.id,
        scope_type: 'project',
        scope_key: projectId,
        is_active: true,
        granted_by: user.id,
        note: `إدارة الدخول: ${bundleKey}`,
      }, { onConflict: 'user_id,bundle_id,scope_type,scope_key' });
      if (grantError) return json({ error: 'project_access_failed', message: grantError.message }, 400);
      return json({ ok: true });
    }

    if (action === 'revoke_project_access') {
      const projectId = String(body.projectId || '');
      if (!projectId) return json({ error: 'project_required' }, 400);
      const { data: bundles } = await admin.from('permission_bundles').select('id').in('bundle_key', [...PROJECT_BUNDLES]);
      const ids = (bundles || []).map((bundle) => bundle.id);
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
