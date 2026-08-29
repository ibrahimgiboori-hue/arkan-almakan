export const ACTION_CONTEXT_EVENT = 'arkan:action-context-changed';

export const ACTION_MODE = Object.freeze({
  SELF: 'self',
  ON_BEHALF_OF: 'on_behalf_of',
});

export function normalizeActionContext(value, fallback = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const mode = raw.acting_mode === ACTION_MODE.ON_BEHALF_OF
    ? ACTION_MODE.ON_BEHALF_OF
    : ACTION_MODE.SELF;

  return {
    systemActorUserId: raw.system_actor_user_id || fallback.systemActorUserId || null,
    systemActorEmployeeId: raw.system_actor_employee_id || fallback.systemActorEmployeeId || null,
    realActorUserId: raw.real_actor_user_id || null,
    realActorEmployeeId: raw.real_actor_employee_id || fallback.systemActorEmployeeId || null,
    realActorName: raw.real_actor_name || fallback.realActorName || '',
    actingMode: mode,
    contextId: mode === ACTION_MODE.ON_BEHALF_OF ? (raw.action_context_id || null) : null,
    isPrimaryUser: raw.is_primary_user === true || fallback.isPrimaryUser === true,
    startedAt: raw.started_at || null,
  };
}

export function isOnBehalfMode(context) {
  return context?.actingMode === ACTION_MODE.ON_BEHALF_OF && Boolean(context?.realActorEmployeeId);
}

export function actionContextLabel(context) {
  if (!isOnBehalfMode(context)) return 'تنفيذ بصفتي';
  return `تنفيذ نيابة عن ${context.realActorName || 'الشخص المحدد'}`;
}
