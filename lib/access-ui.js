export const MODULE_ACCESS_KEYS = Object.freeze(['projects', 'hr', 'finance']);

export const PROJECT_NAV_CAPABILITIES = Object.freeze({
  labor: ['projects.labor.view'],
  attendance: ['projects.timesheets.view'],
  'timesheet-reports': ['projects.timesheets.view'],
  'daily-output': ['projects.progress.view'],
  expenses: ['projects.expenses.view'],
  movements: ['projects.timesheets.view', 'projects.expenses.view'],
  custody: ['projects.custody.view'],
  payments: ['projects.financial_summary.view', 'finance.projects.view'],
  scope: ['projects.scope.view'],
  progress: ['projects.progress.view'],
  overview: ['projects.overview.view', 'projects.projects.view'],
  claims: ['projects.claims.view'],
  guarantees: ['projects.financial_summary.view', 'finance.projects.view'],
  docs: ['projects.documents.view', 'projects.materials.view'],
  settings: ['projects.projects.edit'],
});

export const PROJECT_ACCESS_BUNDLES = Object.freeze([
  { key: 'project_manager', label: 'مدير مشروع' },
  { key: 'project_supervisor', label: 'مشرف مشروع' },
  { key: 'project_originator', label: 'قراءة ومتابعة المشروع' },
]);

export function canSeeArea(areaKey, access = {}) {
  if (access.fullAdmin) return true;
  if (areaKey === 'projects') return Boolean(access.projects || access.finance);
  if (areaKey === 'workforce') return Boolean(access.hr);
  if (areaKey === 'finance') return Boolean(access.finance);
  if (areaKey === 'admin') return Boolean(access.manageAccess);
  if (areaKey === 'documents') return false;
  if (areaKey === 'home') return false;
  return false;
}

export function filterAreasForAccess(areas, access = {}) {
  return areas.filter((area) => canSeeArea(area.key, access));
}

export function projectNavRequirement(itemKey) {
  return PROJECT_NAV_CAPABILITIES[itemKey] || [];
}
