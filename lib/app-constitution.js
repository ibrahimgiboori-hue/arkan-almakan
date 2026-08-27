// دستور موحّد للبرنامج: الوحدات، الإجراءات، النطاق، ومستوى الاعتماد.
// أي بوابة رئيسية جديدة يجب أن تُعرّف هنا بدل اختراع منطق مستقل داخل الصفحة.

export const PERMISSION_ACTIONS = Object.freeze({
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  APPROVE: 'approve',
  FORWARD: 'forward',
  EXPORT: 'export',
});

export const APPROVAL_LEVELS = Object.freeze({
  OPERATE: 'operate',
  REVIEW: 'review',
  APPROVE: 'approve',
  TRANSFER: 'transfer',
});

export const SCOPE_TYPES = Object.freeze({
  ALL: 'all',
  ENTITY: 'entity',
  PROJECT: 'project',
  PROJECTS: 'projects',
  DEPARTMENT: 'department',
  SELF: 'self',
});

// المستوى الأعلى في النظام يسمى «بوابة»؛ البوابة تجمع كل وظائف المجال الحالي وما يضاف له مستقبلًا.
export const MODULES = Object.freeze({
  home: { label: 'اليوم', href: '/dashboard' },
  projects: { label: 'بوابة المشاريع', href: '/dashboard/projects' },
  workforce: { label: 'بوابة الموارد البشرية', href: '/dashboard/employees' },
  finance: { label: 'بوابة المالية', href: '/dashboard/advances' },
  documents: { label: 'بوابة المستندات', href: '/dashboard/documents' },
  admin: { label: 'بوابة الإدارة', href: '/dashboard/board' },
});

export const AREAS = Object.freeze([
  {
    key: 'home',
    ...MODULES.home,
    items: [{ href: '/dashboard', label: 'مركز القيادة' }],
  },
  {
    key: 'projects',
    ...MODULES.projects,
    items: [
      { href: '/dashboard/projects', label: 'المشاريع' },
      // مسارات التشغيل العامة القديمة تبقى توافقية فقط، ولا تظهر في الواجهة الموحدة لأن بديلها داخل المشروع نفسه.
      { href: '/dashboard/site-operations', label: 'التشغيل اليومي', hidden: true, legacy: true },
      { href: '/dashboard/quotes', label: 'سجل عروض الأسعار' },
      { href: '/dashboard/contractors', label: 'المقاولون' },
      { href: '/dashboard/entities', label: 'العملاء والجهات' },
      { href: '/dashboard/site-operations/reports', label: 'تقارير التايم شيت', hidden: true, legacy: true },
      { href: '/dashboard/site-operations/data-safety', label: 'سلامة بيانات التشغيل', hidden: true, legacy: true },
    ],
  },
  {
    key: 'workforce',
    ...MODULES.workforce,
    items: [
      { href: '/dashboard/employees/new', label: 'إضافة موظف' },
      { href: '/dashboard/employees', label: 'الموظفون' },
      { href: '/dashboard/recruitment', label: 'التوظيف والمرشحون' },
      { href: '/dashboard/recruitment/offers', label: 'العروض الوظيفية' },
      { href: '/dashboard/recruitment/contracts', label: 'مسودات العقود' },
      { href: '/dashboard/recruitment/onboarding', label: 'المباشرة والتهيئة' },
      { href: '/dashboard/leaves', label: 'الإجازات' },
      { href: '/dashboard/leave-history-import', label: 'استيراد الإجازات القديمة' },
    ],
  },
  {
    key: 'finance',
    ...MODULES.finance,
    items: [
      { href: '/dashboard/advances', label: 'السلف والمديونيات' },
      { href: '/dashboard/approvals', label: 'سجل الاعتمادات' },
    ],
  },
  {
    key: 'documents',
    ...MODULES.documents,
    items: [
      { href: '/dashboard/documents', label: 'النماذج والمستندات' },
      { href: '/dashboard/archive', label: 'الأرشيف' },
      { href: '/dashboard/register', label: 'الصادر والوارد' },
      { href: '/dashboard/formbuilder', label: 'محرر النماذج' },
    ],
  },
  {
    key: 'admin',
    ...MODULES.admin,
    items: [
      { href: '/dashboard/board', label: 'مجلس الإدارة' },
      { href: '/dashboard/settings', label: 'بيانات الشركة' },
      { href: '/dashboard/system-user', label: 'إدارة الدخول' },
      { href: '/dashboard/org-structure', label: 'الهيكل التنظيمي' },
      { href: '/dashboard/backup', label: 'النسخ الاحتياطي' },
    ],
  },
]);

export const QUICK_ACTIONS = Object.freeze([
  { label: 'إضافة موظف', href: '/dashboard/employees/new', meta: 'موارد بشرية' },
  { label: 'فتح المشاريع', href: '/dashboard/projects', meta: 'مشاريع' },
  { label: 'إنشاء مستند', href: '/dashboard/documents', meta: 'مستندات' },
  { label: 'فتح سجل عروض الأسعار', href: '/dashboard/quotes', meta: 'مشاريع' },
]);

export const AREA_PRIMARY_ACTIONS = Object.freeze({
  home: { label: 'فتح المشاريع', href: '/dashboard/projects' },
  projects: null,
  workforce: { label: 'إضافة موظف', href: '/dashboard/employees/new' },
  finance: { label: 'السلف والمديونيات', href: '/dashboard/advances' },
  documents: { label: 'إنشاء مستند', href: '/dashboard/documents' },
  admin: { label: 'بيانات الشركة', href: '/dashboard/settings' },
});

export const PROJECT_NAV_GROUPS = Object.freeze([
  {
    key: 'daily',
    label: 'العمل اليومي',
    items: Object.freeze([
      { key: 'labor', label: 'العمالة وإضافة عامل', suffix: '/operations/labor' },
      { key: 'attendance', label: 'الحضور', suffix: '/operations' },
      { key: 'timesheet-reports', label: 'تقارير التايم شيت', suffix: '/operations/reports' },
      { key: 'daily-output', label: 'الإنجاز اليومي', suffix: '/operations/output' },
      { key: 'expenses', label: 'المصروفات', suffix: '/operations/expenses' },
      { key: 'movements', label: 'حركات اليوم', suffix: '/operations/movements' },
    ]),
  },
  {
    key: 'operational-finance',
    label: 'المالية التشغيلية',
    items: Object.freeze([
      { key: 'quotes', label: 'عروض المشروع', suffix: '/quotes' },
      { key: 'quote-register', label: 'سجل عروض الأسعار', href: '/dashboard/quotes' },
      { key: 'custody', label: 'العهدة', suffix: '/operations/custody' },
      { key: 'payments', label: 'السلف والدفعات', suffix: '/operations/finance' },
      { key: 'cost-control', label: 'التحكم المالي', suffix: '/insights/cost-control' },
    ]),
  },
  {
    key: 'execution',
    label: 'إدارة التنفيذ',
    items: Object.freeze([
      { key: 'scope', label: 'النطاق والإسناد', view: 'scope' },
      { key: 'progress', label: 'قياسات الإنجاز', view: 'progress' },
      { key: 'planning', label: 'التخطيط والجدولة', suffix: '/insights/planning' },
      { key: 'changes', label: 'التغييرات', suffix: '/insights/changes' },
    ]),
  },
  {
    key: 'review',
    label: 'المتابعة',
    items: Object.freeze([
      { key: 'overview', label: 'ملخص المشروع', view: 'overview' },
      { key: 'claims', label: 'المستخلصات', view: 'claims' },
      { key: 'guarantees', label: 'الضمانات والمحتجزات', view: 'guarantees' },
    ]),
  },
  {
    key: 'reference',
    label: 'الملفات والإعدادات',
    items: Object.freeze([
      { key: 'docs', label: 'المستندات والمواد', view: 'docs' },
      { key: 'correspondence', label: 'المراسلات الفنية', suffix: '/insights/correspondence' },
      { key: 'settings', label: 'بيانات المشروع', view: 'settings' },
    ]),
  },
]);

const PROJECT_VIEW_KEYS = new Set(['overview','scope','progress','claims','guarantees','docs','settings']);

export function normalizeProjectView(value) {
  if (value === 'exec') return 'scope';
  return PROJECT_VIEW_KEYS.has(value) ? value : 'overview';
}

export function projectNavigationHref(projectId, item) {
  if (item?.href) return item.href;
  const base = `/dashboard/projects/${projectId}`;
  if (item?.suffix !== undefined) return `${base}${item.suffix}`;
  const view = normalizeProjectView(item?.view);
  return view === 'overview' ? base : `${base}?view=${encodeURIComponent(view)}`;
}

export function activeProjectNavigationKey({ projectId, pathname, view }) {
  if (!projectId || !pathname) return null;
  const base = `/dashboard/projects/${projectId}`;
  if (pathname === base) return normalizeProjectView(view);
  const pathItems = PROJECT_NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => item.suffix !== undefined)
    .sort((a, b) => b.suffix.length - a.suffix.length);
  const match = pathItems.find((item) => {
    const href = `${base}${item.suffix}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
  return match?.key || null;
}

export const ROLE_BUNDLES = Object.freeze({
  module_manager: {
    label: 'مدير البوابة',
    actions: Object.values(PERMISSION_ACTIONS),
    approvalLevel: APPROVAL_LEVELS.TRANSFER,
  },
  project_supervisor: {
    label: 'مشرف مشروع',
    actions: [
      PERMISSION_ACTIONS.VIEW,
      PERMISSION_ACTIONS.CREATE,
      PERMISSION_ACTIONS.EDIT,
      PERMISSION_ACTIONS.EXPORT,
    ],
    approvalLevel: APPROVAL_LEVELS.OPERATE,
    scopeType: SCOPE_TYPES.PROJECTS,
  },
  reviewer: {
    label: 'مراجع',
    actions: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.EDIT, PERMISSION_ACTIONS.EXPORT],
    approvalLevel: APPROVAL_LEVELS.REVIEW,
  },
  approver: {
    label: 'معتمد',
    actions: [PERMISSION_ACTIONS.VIEW, PERMISSION_ACTIONS.APPROVE, PERMISSION_ACTIONS.FORWARD],
    approvalLevel: APPROVAL_LEVELS.APPROVE,
  },
});

export function matchesConstitutionPath(pathname, href) {
  if (pathname === href) return true;
  if (href === '/dashboard') return false;
  return pathname.startsWith(`${href}/`);
}

export function activeConstitutionItem(pathname) {
  return AREAS.flatMap((area) => area.items.map((item) => ({ ...item, area })))
    .filter((item) => matchesConstitutionPath(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0] || null;
}

export function permissionKey(moduleKey, action) {
  return `${moduleKey}:${action}`;
}

export function canForwardBetweenModules(grant) {
  return Boolean(
    grant &&
    grant.actions?.includes(PERMISSION_ACTIONS.FORWARD) &&
    grant.approvalLevel === APPROVAL_LEVELS.TRANSFER
  );
}
