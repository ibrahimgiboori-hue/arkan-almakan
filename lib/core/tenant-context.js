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

export function tenantWithModules(tenant, moduleRows = []) {
  if (!tenant || tenant.mode !== 'multi_tenant') return tenant;
  const modules = (moduleRows || [])
    .filter((row) => row?.module_key && (row.status === 'active' || row.status === 'trial'))
    .map((row) => Object.freeze({
      key:row.module_key,
      status:row.status,
      settings:row.settings || {},
    }));

  return Object.freeze({
    ...tenant,
    modules:Object.freeze(modules),
    moduleKeys:new Set(modules.map((module) => module.key)),
  });
}

export function applyTenantModuleEntitlements(access = {}, tenant = null) {
  if (!tenant || tenant.mode !== 'multi_tenant') return Object.freeze({ ...access });
  const keys = tenant.moduleKeys instanceof Set
    ? tenant.moduleKeys
    : new Set((tenant.modules || []).map((module) => module.key));

  const has = (key) => keys.has('core') && keys.has(key);
  return Object.freeze({
    ...access,
    moduleEntitlementsApplied:true,
    projects:Boolean(access.projects && has('projects')),
    projectsScreen:Boolean(access.projectsScreen && has('projects')),
    projectScoped:Boolean(access.projectScoped && has('projects')),
    hr:Boolean(access.hr && has('hr')),
    finance:Boolean(access.finance && has('finance_ops')),
    documents:Boolean(access.documents && has('documents')),
    admin:Boolean(access.admin && keys.has('core')),
    manageAccess:Boolean(access.manageAccess && keys.has('core')),
    approvals:Boolean(access.approvals && keys.has('core')),
  });
}
