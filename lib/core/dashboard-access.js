import {
  capabilityKeySet,
  capabilitiesForModule,
  hasModuleCapability,
  normalizeCapabilities,
} from '@/lib/core/capabilities';

// سياسة الدخول نفسها التي كانت داخل DashboardLayout، لكن كقاعدة برنامج مستقلة عن التوكسيدو.
export function buildDashboardAccess({ capabilities:rawCapabilities, isPrimaryUser = false, isSystemAdmin = false } = {}) {
  const capabilities = normalizeCapabilities(rawCapabilities);
  const capabilityKeys = capabilityKeySet(capabilities);
  const fullAdmin = Boolean(isPrimaryUser || isSystemAdmin);
  const projectCaps = capabilitiesForModule(capabilities, 'projects');
  const projectsScreen = fullAdmin || projectCaps.some((item) => item.scope_type === 'all');
  const projectScoped = fullAdmin || projectCaps.length > 0;
  const manageAccess = fullAdmin || capabilityKeys.has('system.access.manage_access');

  return {
    capabilities,
    capabilityKeys,
    access:Object.freeze({
      fullAdmin,
      projects:projectsScreen,
      projectsScreen,
      projectScoped,
      hr:fullAdmin || hasModuleCapability(capabilities, 'hr'),
      finance:fullAdmin || hasModuleCapability(capabilities, 'finance'),
      documents:fullAdmin || hasModuleCapability(capabilities, 'documents'),
      admin:fullAdmin || hasModuleCapability(capabilities, 'admin') || manageAccess,
      manageAccess,
      approvals:fullAdmin || capabilityKeys.has('system.approvals.view'),
    }),
  };
}
