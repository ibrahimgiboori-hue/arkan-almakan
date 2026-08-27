export const MODULE_ACCESS_KEYS = Object.freeze(['projects', 'hr', 'finance', 'documents', 'admin']);

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
  planning: ['projects.progress.view', 'projects.projects.view'],
  changes: ['projects.projects.view', 'projects.scope.view'],
  overview: ['projects.overview.view', 'projects.projects.view'],
  claims: ['projects.claims.view'],
  guarantees: ['projects.financial_summary.view', 'finance.projects.view'],
  'cost-control': ['projects.financial_summary.view', 'finance.projects.view'],
  docs: ['projects.documents.view', 'projects.materials.view'],
  correspondence: ['projects.documents.view'],
  settings: ['projects.projects.edit'],
});

// البوابة هي المستوى الأعلى. النطاق يصنع الهرمية داخلها بدل إنشاء نظام صلاحيات موازٍ.
export const PROJECT_ACCESS_LEVELS = Object.freeze([
  {
    key: 'projects_portal_full',
    label: 'كامل بوابة المشاريع',
    bundleKey: 'projects_full_access',
    scopeType: 'all',
    description: 'صفحة اليوم + بوابة المشاريع كاملة: إنشاء وإدارة جميع المشاريع وكل أدوات البوابة الحالية والمستقبلية.',
  },
  {
    key: 'project_supervisor',
    label: 'مشرف مشروع',
    bundleKey: 'projects_full_access',
    scopeType: 'project',
    description: 'صفحة اليوم + كامل الصلاحيات داخل المشروع أو المشاريع المسندة فقط.',
  },
  {
    key: 'site_supervisor',
    label: 'مشرف موقع',
    bundleKey: 'project_site_supervisor',
    scopeType: 'project',
    description: 'صفحة اليوم + أدوات الحضور والمصروفات فقط داخل المشروع المسند.',
  },
]);

export const PROJECT_ACCESS_BUNDLES = Object.freeze([
  { key: 'project_manager', label: 'مدير مشروع' },
  { key: 'project_supervisor', label: 'مشرف مشروع' },
  { key: 'project_originator', label: 'قراءة ومتابعة المشروع' },
]);

export function canSeeArea(areaKey, access = {}) {
  if (access.fullAdmin) return true;
  if (areaKey === 'projects') return Boolean(access.projectsScreen ?? access.projects ?? access.projectScoped);
  if (areaKey === 'workforce') return Boolean(access.hr);
  if (areaKey === 'finance') return Boolean(access.finance);
  if (areaKey === 'documents') return Boolean(access.documents);
  if (areaKey === 'admin') return Boolean(access.admin ?? access.manageAccess);
  if (areaKey === 'home') return false;
  return false;
}

export function filterAreasForAccess(areas, access = {}) {
  return areas.filter((area) => canSeeArea(area.key, access));
}

export function projectNavRequirement(itemKey) {
  return PROJECT_NAV_CAPABILITIES[itemKey] || [];
}
