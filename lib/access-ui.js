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

// هرمية الوصول للشاشة: نفس محرك الصلاحيات، ويختلف النطاق بدل اختراع نظام موازٍ.
export const PROJECT_ACCESS_LEVELS = Object.freeze([
  {
    key: 'projects_screen_full',
    label: 'كامل شاشة المشاريع',
    bundleKey: 'projects_full_access',
    scopeType: 'all',
    description: 'صفحة اليوم + شاشة المشاريع وجميع أدواتها وعلى جميع المشاريع.',
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

// إبقاء الحزم القديمة متاحة مؤقتًا للتوافق مع شاشة إدارة الدخول الحالية.
export const PROJECT_ACCESS_BUNDLES = Object.freeze([
  { key: 'project_manager', label: 'مدير مشروع' },
  { key: 'project_supervisor', label: 'مشرف مشروع' },
  { key: 'project_originator', label: 'قراءة ومتابعة المشروع' },
]);

export function canSeeArea(areaKey, access = {}) {
  if (access.fullAdmin) return true;
  if (areaKey === 'projects') return Boolean(access.projectsScreen ?? access.projects);
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
