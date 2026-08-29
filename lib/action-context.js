export const ACTION_CONTEXT_EVENT = 'arkan:action-context-changed';

export const ACTION_MODE = Object.freeze({
  SELF: 'self',
  ON_BEHALF_OF: 'on_behalf_of',
});

export function normalizeActionContext(value, fallback = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const systemActorEmployeeId = raw.system_actor_employee_id || fallback.systemActorEmployeeId || null;
  const requestedRealActorEmployeeId = raw.real_actor_employee_id || null;
  const requestedOnBehalf = raw.acting_mode === ACTION_MODE.ON_BEHALF_OF
    && Boolean(requestedRealActorEmployeeId)
    && requestedRealActorEmployeeId !== systemActorEmployeeId;
  const mode = requestedOnBehalf ? ACTION_MODE.ON_BEHALF_OF : ACTION_MODE.SELF;

  return {
    systemActorUserId: raw.system_actor_user_id || fallback.systemActorUserId || null,
    systemActorEmployeeId,
    realActorUserId: mode === ACTION_MODE.ON_BEHALF_OF ? (raw.real_actor_user_id || null) : (raw.system_actor_user_id || fallback.systemActorUserId || null),
    realActorEmployeeId: mode === ACTION_MODE.ON_BEHALF_OF
      ? requestedRealActorEmployeeId
      : systemActorEmployeeId,
    realActorName: raw.real_actor_name || fallback.realActorName || '',
    actingMode: mode,
    contextId: mode === ACTION_MODE.ON_BEHALF_OF ? (raw.action_context_id || null) : null,
    isPrimaryUser: raw.is_primary_user === true || fallback.isPrimaryUser === true,
    startedAt: mode === ACTION_MODE.ON_BEHALF_OF ? (raw.started_at || null) : null,
  };
}

export function isOnBehalfMode(context) {
  return context?.actingMode === ACTION_MODE.ON_BEHALF_OF
    && Boolean(context?.realActorEmployeeId)
    && context.realActorEmployeeId !== context.systemActorEmployeeId;
}

export function actionContextLabel(context) {
  if (!isOnBehalfMode(context)) return 'تنفيذ بصفتي';
  return `تنفيذ نيابة عن ${context.realActorName || 'الشخص المحدد'}`;
}
