import { legacyTenantContext, resolveTenantContext } from '../core/tenant-context';
import {
  clearActiveOrganizationId,
  getActiveOrganizationId,
  setActiveOrganizationId,
} from '../tenant-context';

function isMissingTenantFoundation(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '').toLowerCase();
  return code === 'PGRST205'
    || code === '42P01'
    || message.includes('organization_memberships')
    || message.includes('relation') && message.includes('does not exist')
    || message.includes('schema cache') && message.includes('organization');
}

async function loadTenantSnapshot(client, session) {
  const membershipQ = await client
    .from('organization_memberships')
    .select('organization_id,membership_role,status,is_default')
    .eq('user_id', session.user.id)
    .eq('status','active');

  if (membershipQ.error) {
    if (isMissingTenantFoundation(membershipQ.error)) {
      clearActiveOrganizationId({ announce:false });
      return { tenant:legacyTenantContext(), error:null };
    }
    return {
      tenant:Object.freeze({
        mode:'error',
        activeOrganization:null,
        activeRole:null,
        memberships:Object.freeze([]),
      }),
      error:membershipQ.error,
    };
  }

  const memberships = membershipQ.data || [];
  if (!memberships.length) {
    clearActiveOrganizationId({ announce:false });
    return {
      tenant:resolveTenantContext({ memberships:[], organizations:[] }),
      error:null,
    };
  }

  const orgIds = [...new Set(memberships.map((item) => item.organization_id).filter(Boolean))];
  const organizationsQ = await client
    .from('organizations')
    .select('id,slug,name_ar,name_en,status')
    .in('id', orgIds);

  if (organizationsQ.error) {
    return {
      tenant:Object.freeze({
        mode:'error',
        activeOrganization:null,
        activeRole:null,
        memberships:Object.freeze([]),
      }),
      error:organizationsQ.error,
    };
  }

  const tenant = resolveTenantContext({
    memberships,
    organizations:organizationsQ.data || [],
    preferredOrganizationId:getActiveOrganizationId(),
  });

  if (tenant.mode === 'multi_tenant' && tenant.activeOrganization?.id) {
    setActiveOrganizationId(tenant.activeOrganization.id,{ announce:false });
  } else {
    clearActiveOrganizationId({ announce:false });
  }

  return { tenant, error:null };
}

// محول بنية تحتية فقط: يعرف أسماء جداول/RPC في Supabase ولا يقرر صلاحيات أو سلوك واجهة.
export async function loadDashboardBootstrapSnapshot(client) {
  const sessionQ = await client.auth.getSession();
  const session = sessionQ?.data?.session || null;

  if (!session) {
    clearActiveOrganizationId({ announce:false });
    return {
      session:null,
      tenant:legacyTenantContext(),
      tenantQ:null,
      userQ:null,
      capsQ:null,
      primaryQ:null,
      actionQ:null,
      themeQ:null,
    };
  }

  const tenantQ = await loadTenantSnapshot(client,session);
  const tenant = tenantQ.tenant;

  // Important transitional contract:
  // production stays on the legacy single-company model until the tenant
  // foundation is actually present there. Once present, tenant membership
  // becomes mandatory before any business bootstrap is allowed.
  if (tenant.mode === 'error' || tenant.mode === 'unassigned') {
    return {
      session,
      tenant,
      tenantQ,
      userQ:null,
      capsQ:null,
      primaryQ:null,
      actionQ:null,
      themeQ:null,
    };
  }

  const themeQuery = tenant.mode === 'multi_tenant'
    ? client
        .from('organization_settings')
        .select('ui_theme_preset')
        .eq('organization_id',tenant.activeOrganization.id)
        .maybeSingle()
    : client.from('app_settings').select('ui_theme_preset').eq('id',1).maybeSingle();

  const [userQ, capsQ, primaryQ, actionQ, themeQ] = await Promise.all([
    client
      .from('app_users')
      .select('employee_id,role,is_active,is_system_admin,must_change_password,access_profile')
      .eq('id', session.user.id)
      .maybeSingle(),
    client.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
    client.rpc('fn_is_primary_user'),
    client.rpc('fn_my_action_context'),
    themeQuery,
  ]);

  return { session, tenant, tenantQ, userQ, capsQ, primaryQ, actionQ, themeQ };
}

export async function loadCurrentActionContextSnapshot(client) {
  return client.rpc('fn_my_action_context');
}

export async function loadCurrentUiThemeSnapshot(client) {
  const organizationId = getActiveOrganizationId();
  if (organizationId) {
    const tenantThemeQ = await client
      .from('organization_settings')
      .select('ui_theme_preset')
      .eq('organization_id',organizationId)
      .maybeSingle();
    if (!tenantThemeQ.error) return tenantThemeQ;
    if (!isMissingTenantFoundation(tenantThemeQ.error)) return tenantThemeQ;
    clearActiveOrganizationId({ announce:false });
  }
  return client.from('app_settings').select('ui_theme_preset').eq('id',1).maybeSingle();
}

export async function signOutDashboardSession(client) {
  clearActiveOrganizationId({ announce:false });
  return client.auth.signOut();
}
