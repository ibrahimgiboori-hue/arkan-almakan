export function normalizeTenantMemberships({ memberships = [], organizations = [] } = {}) {
  const organizationById = new Map(
    (organizations || []).filter(Boolean).map((organization) => [String(organization.id), organization])
  );

  return (memberships || [])
    .filter((membership) => membership?.status === 'active' && membership?.organization_id)
    .map((membership) => {
      const organization = organizationById.get(String(membership.organization_id)) || null;
      if (!organization || organization.status !== 'active') return null;
      return Object.freeze({
        organizationId:organization.id,
        role:membership.membership_role || 'member',
        isDefault:Boolean(membership.is_default),
        organization:Object.freeze({
          id:organization.id,
          slug:organization.slug,
          nameAr:organization.name_ar || '',
          nameEn:organization.name_en || '',
          status:organization.status,
        }),
      });
    })
    .filter(Boolean);
}

export function resolveTenantContext({
  memberships = [],
  organizations = [],
  preferredOrganizationId = null,
} = {}) {
  const normalized = normalizeTenantMemberships({ memberships, organizations });
  if (!normalized.length) {
    return Object.freeze({
      mode:'unassigned',
      activeOrganization:null,
      memberships:Object.freeze([]),
    });
  }

  const preferred = preferredOrganizationId
    ? normalized.find((membership) => String(membership.organizationId) === String(preferredOrganizationId))
    : null;
  const fallback = normalized.find((membership) => membership.isDefault) || normalized[0];
  const selected = preferred || fallback;

  return Object.freeze({
    mode:'multi_tenant',
    activeOrganization:selected.organization,
    activeRole:selected.role,
    memberships:Object.freeze(normalized),
  });
}

export function legacyTenantContext() {
  return Object.freeze({
    mode:'legacy',
    activeOrganization:null,
    activeRole:null,
    memberships:Object.freeze([]),
  });
}
