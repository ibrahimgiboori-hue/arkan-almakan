import { normalizeActionContext } from '../action-context.js';
import { buildDashboardAccess } from './dashboard-access.js';

// يحوّل لقطة البنية التحتية إلى قرار جلسة نقي. لا توجيه صفحات، لا CSS، لا نصوص عرض، ولا تفاصيل تخزين هنا.
export function composeDashboardSession(snapshot = {}) {
  const session = snapshot.session || null;
  if (!session) return Object.freeze({ kind:'anonymous' });

  const userQ = snapshot.userQ || null;
  if (userQ?.error) {
    return Object.freeze({ kind:'denied', reason:'user_lookup_failed' });
  }

  const userRow = userQ?.data || null;
  if (userRow?.must_change_password) {
    return Object.freeze({ kind:'password_change_required' });
  }

  if (!userRow?.is_active || !userRow?.role) {
    return Object.freeze({ kind:'denied', reason:'account_unconfigured' });
  }

  const rawCapabilities = snapshot.capsQ?.error ? [] : (snapshot.capsQ?.data || []);
  const isPrimaryUser = snapshot.primaryQ?.data === true;
  const { capabilities, capabilityKeys, access } = buildDashboardAccess({
    capabilities:rawCapabilities,
    isPrimaryUser,
    isSystemAdmin:Boolean(userRow.is_system_admin),
  });

  const actionContext = normalizeActionContext(snapshot.actionQ?.error ? null : snapshot.actionQ?.data, {
    systemActorUserId:session.user.id,
    systemActorEmployeeId:userRow.employee_id,
    isPrimaryUser,
  });

  return Object.freeze({
    kind:'allowed',
    me:{
      ...userRow,
      email:session.user.email,
      userId:session.user.id,
      capabilities,
      capabilityKeys,
      access,
      actionContext,
    },
  });
}
