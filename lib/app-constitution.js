// دستور موحّد للبرنامج: الوحدات، الإجراءات، النطاق، ومستوى الاعتماد.
// أي شاشة رئيسية جديدة يجب أن تُعرّف هنا بدل اختراع منطق مستقل داخل الصفحة.

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

export const MODULES = Object.freeze({
  home: { label: 'اليوم', href: '/dashboard' },
  projects: { label: 'المشاريع', href: '/dashboard/projects' },
  workforce: { label: 'القوى العاملة', href: '/dashboard/employees' },
  finance: { label: 'المالية', href: '/dashboard/advances' },
  documents: { label: 'المستندات', href: '/dashboard/documents' },
  admin: { label: 'الإدارة', href: '/dashboard/board' },
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
      { href: '/dashboard/site-operations', label: 'التشغيل اليومي', hidden: true },
      { href: '/dashboard/site-operations/reports', label: 'تقارير التايم شيت' },
      { href: '/dashboard/site-operations/data-safety', label: 'سلامة بيانات التشغيل' },
      { href: '/dashboard/quotes', label: 'عروض الأسعار' },
      { href: '/dashboard/contractors', label: 'المقاولون' },
      { href: '/dashboard/entities', label: 'العملاء والجهات' },
    ],
  },
  {
    key: 'workforce',
    ...MODULES.workforce,
    items: [
      { href: '/dashboard/employees', label: 'الموظفون' },
      { href: '/dashboard/recruitment', label: 'التوظيف والمرشحون' },
      { href: '/dashboard/recruitment/offers', label: 'العروض الوظيفية' },
      { href: '/dashboard/recruitment/contracts', label: 'مسودات العقود' },
      { href: '/dashboard/recruitment/onboarding', label: 'المباشرة والتهيئة' },
      { href: '/dashboard/leaves', label: 'الإجازات' },
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
      { href: '/dashboard/system-user', label: 'مستخدم النظام' },
      { href: '/dashboard/org-structure', label: 'الهيكل التنظيمي' },
      { href: '/dashboard/backup', label: 'النسخ الاحتياطي' },
    ],
  },
]);

export const QUICK_ACTIONS = Object.freeze([
  { label: 'إضافة موظف', href: '/dashboard/employees/new', meta: 'قوى عاملة' },
  { label: 'فتح المشاريع', href: '/dashboard/projects', meta: 'مشاريع' },
  { label: 'إنشاء مستند', href: '/dashboard/documents', meta: 'مستندات' },
  { label: 'فتح عروض الأسعار', href: '/dashboard/quotes', meta: 'مشاريع' },
]);

export const AREA_PRIMARY_ACTIONS = Object.freeze({
  home: { label: 'فتح المشاريع', href: '/dashboard/projects' },
  projects: null,
  workforce: { label: 'إضافة موظف', href: '/dashboard/employees/new' },
  finance: { label: 'السلف والمديونيات', href: '/dashboard/advances' },
  documents: { label: 'إنشاء مستند', href: '/dashboard/documents' },
  admin: { label: 'بيانات الشركة', href: '/dashboard/settings' },
});

export const ROLE_BUNDLES = Object.freeze({
  module_manager: {
    label: 'مدير الوحدة',
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
