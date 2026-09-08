// محول بنية تحتية فقط: يعرف أسماء جداول/RPC في Supabase ولا يقرر صلاحيات أو سلوك واجهة.
export async function loadDashboardBootstrapSnapshot(client) {
  const sessionQ = await client.auth.getSession();
  const session = sessionQ?.data?.session || null;

  if (!session) {
    return {
      session:null,
      userQ:null,
      capsQ:null,
      primaryQ:null,
      actionQ:null,
      themeQ:null,
    };
  }

  const [userQ, capsQ, primaryQ, actionQ, themeQ] = await Promise.all([
    client
      .from('app_users')
      .select('employee_id,role,is_active,is_system_admin,must_change_password')
      .eq('id', session.user.id)
      .maybeSingle(),
    client.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
    client.rpc('fn_is_primary_user'),
    client.rpc('fn_my_action_context'),
    client.from('app_settings').select('ui_theme_preset').eq('id',1).maybeSingle(),
  ]);

  return { session, userQ, capsQ, primaryQ, actionQ, themeQ };
}

export async function loadCurrentActionContextSnapshot(client) {
  return client.rpc('fn_my_action_context');
}

export async function loadCurrentUiThemeSnapshot(client) {
  return client.from('app_settings').select('ui_theme_preset').eq('id',1).maybeSingle();
}

export async function signOutDashboardSession(client) {
  return client.auth.signOut();
}
