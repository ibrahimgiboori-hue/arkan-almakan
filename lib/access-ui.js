import { PROJECT_NAV_GROUPS, projectNavigationHref } from './app-constitution';

export const MODULE_ACCESS_KEYS = Object.freeze(['projects', 'hr', 'finance', 'documents', 'admin']);

export const PROJECT_NAV_CAPABILITIES = Object.freeze({
  labor: ['projects.labor.view'],
  attendance: ['projects.timesheets.view'],
  'timesheet-reports': ['projects.timesheets.view'],
  'daily-output': ['projects.progress.view'],
  expenses: ['projects.expenses.view'],
  movements: ['projects.timesheets.view', 'projects.expenses.view'],
  quotes: ['projects.quotes.view'],
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

/*
 * إسقاط العرض فقط؛ قاعدة البيانات/RPC تظل صاحبة الحكم الأمني النهائي.
 * الصفحة لا تعيد بناء منطق الصلاحيات ولا تستعلم عنه من جديد.
 */
export function canUseCapability(session, capabilityKey, scopeType = 'all', scopeKey = null) {
  if (!session || !capabilityKey) return false;
  if (session.access?.fullAdmin) return true;
  const grants = session.capabilities || [];
  return grants.some((grant) => {
    if (grant.capability_key !== capabilityKey) return false;
    if (grant.scope_type === 'all') return true;
    if (scopeType === 'project' && grant.scope_type === 'project') return String(grant.scope_key || '') === String(scopeKey || '');
    if (scopeType === 'self' && grant.scope_type === 'self') return true;
    return grant.scope_type === scopeType && String(grant.scope_key || '') === String(scopeKey || '');
  });
}

export function canUseAnyCapability(session, capabilityKeys = [], scopeType = 'all', scopeKey = null) {
  return capabilityKeys.some((key) => canUseCapability(session, key, scopeType, scopeKey));
}

// فتح المشروع لا يبدأ بصفحة ثابتة للجميع؛ يبدأ بأول أداة مسموحة وفق ترتيب الدستور.
// بهذا يصبح ترتيب الملاحة نفسه هو مصدر قرار البداية، ولا نكرر منطقًا موازيًا داخل صفحة المشاريع.
export function preferredProjectHref(session, projectId) {
  if (!projectId) return '/dashboard/projects';
  for (const group of PROJECT_NAV_GROUPS) {
    for (const item of group.items) {
      const required = projectNavRequirement(item.key);
      if (required.length === 0 || canUseAnyCapability(session, required, 'project', projectId)) {
        return projectNavigationHref(projectId, item);
      }
    }
  }
  return `/dashboard/projects/${projectId}`;
}
