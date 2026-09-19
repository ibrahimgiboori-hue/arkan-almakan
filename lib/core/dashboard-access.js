import {
  capabilityKeySet,
  capabilitiesForModule,
  hasModuleCapability,
  normalizeCapabilities,
} from './capabilities.js';

// سياسة الدخول نفسها التي كانت داخل DashboardLayout، لكن كقاعدة برنامج مستقلة عن التوكسيدو.
export function buildDashboardAccess({ capabilities:rawCapabilities, isPrimaryUser = false, isSystemAdmin = false, accessProfile = 'operational' } = {}) {
  const capabilities = normalizeCapabilities(rawCapabilities);
  const capabilityKeys = capabilityKeySet(capabilities);
  const fullAdmin = Boolean(isPrimaryUser || isSystemAdmin);
  const projectCaps = capabilitiesForModule(capabilities, 'projects');
  const projectsScreen = fullAdmin || projectCaps.some((item) => item.scope_type === 'all');
  const projectScoped = fullAdmin || projectCaps.length > 0;
  const manageAccess = fullAdmin || capabilityKeys.has('system.access.manage_access');
  const approverOnly = !fullAdmin && accessProfile === 'approval_only';

  return {
    capabilities,
    capabilityKeys,
    access:Object.freeze({
      fullAdmin,
      approverOnly,
      projects:approverOnly ? false : projectsScreen,
      projectsScreen:approverOnly ? false : projectsScreen,
      projectScoped:approverOnly ? false : projectScoped,
      hr:approverOnly ? false : (fullAdmin || hasModuleCapability(capabilities, 'hr')),
      finance:approverOnly ? false : (fullAdmin || hasModuleCapability(capabilities, 'finance')),
      documents:approverOnly ? false : (fullAdmin || hasModuleCapability(capabilities, 'documents')),
      admin:approverOnly ? false : (fullAdmin || hasModuleCapability(capabilities, 'admin') || manageAccess),
      manageAccess:approverOnly ? false : manageAccess,
      approvals:fullAdmin || capabilityKeys.has('system.approvals.view') || approverOnly,
    }),
  };
}
