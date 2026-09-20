'use client';

export const TENANT_HEADER = 'x-organization-id';
export const TENANT_STORAGE_KEY = 'arkan-platform-active-organization-id';
export const TENANT_CONTEXT_EVENT = 'arkan:tenant-context-changed';

function storage() {
  if (typeof window === 'undefined') return null;
  try { return window.sessionStorage; } catch (_) { return null; }
}

export function getActiveOrganizationId() {
  return storage()?.getItem(TENANT_STORAGE_KEY) || null;
}

export function setActiveOrganizationId(organizationId, { announce = true } = {}) {
  const target = storage();
  if (!target) return;
  if (organizationId) target.setItem(TENANT_STORAGE_KEY, String(organizationId));
  else target.removeItem(TENANT_STORAGE_KEY);

  if (announce && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TENANT_CONTEXT_EVENT, {
      detail:{ organizationId:organizationId ? String(organizationId) : null },
    }));
  }
}

export function clearActiveOrganizationId(options) {
  setActiveOrganizationId(null, options);
}

export async function tenantAwareFetch(input, init = {}) {
  const organizationId = getActiveOrganizationId();
  if (!organizationId) return fetch(input, init);

  const inheritedHeaders =
    init?.headers ||
    (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(inheritedHeaders || {});
  headers.set(TENANT_HEADER, organizationId);
  return fetch(input, { ...init, headers });
}
