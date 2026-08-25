// Approved UI governance: being inside the new dashboard shell is not enough.
// A route is native only after its internal page markup consumes the approved UI system.
export const UI_GOVERNANCE_VERSION = '2.1';

export const UI_STATUS = Object.freeze({
  NATIVE: 'native',
  COMPAT: 'compat',
});

const NATIVE_ROUTES = Object.freeze([
  '/dashboard',
  '/dashboard/employees',
]);

// High-use routes are intentionally explicit so migration progress cannot be hidden.
export const UI_MIGRATION_ROUTES = Object.freeze([
  { href:'/dashboard/employees', label:'الموظفون', priority:1 },
  { href:'/dashboard/leaves', label:'الإجازات', priority:1 },
  { href:'/dashboard/advances', label:'السلف والمديونيات', priority:1 },
  { href:'/dashboard/projects', label:'المشاريع', priority:1 },
  { href:'/dashboard/site-operations', label:'التشغيل اليومي', priority:1 },
  { href:'/dashboard/expenses', label:'المصروفات', priority:1 },
  { href:'/dashboard/contractors', label:'المقاولون', priority:1 },
  { href:'/dashboard/quotes', label:'عروض الأسعار', priority:2 },
  { href:'/dashboard/documents', label:'المستندات', priority:2 },
  { href:'/dashboard/recruitment', label:'التوظيف', priority:2 },
  { href:'/dashboard/approvals', label:'الاعتمادات', priority:2 },
  { href:'/dashboard/entities', label:'العملاء والجهات', priority:2 },
  { href:'/dashboard/board', label:'مجلس الإدارة', priority:3 },
  { href:'/dashboard/settings', label:'بيانات الشركة', priority:3 },
  { href:'/dashboard/system-user', label:'مستخدم النظام', priority:3 },
  { href:'/dashboard/org-structure', label:'الهيكل التنظيمي', priority:3 },
  { href:'/dashboard/archive', label:'الأرشيف', priority:3 },
  { href:'/dashboard/register', label:'الصادر والوارد', priority:3 },
  { href:'/dashboard/formbuilder', label:'محرر النماذج', priority:3 },
  { href:'/dashboard/backup', label:'النسخ الاحتياطي', priority:3 },
]);

function routeMatches(pathname, href) {
  if (pathname === href) return true;
  return href !== '/dashboard' && pathname.startsWith(`${href}/`);
}

export function uiGovernanceFor(pathname='') {
  const native = NATIVE_ROUTES.some((href) => routeMatches(pathname, href));
  return {
    version:UI_GOVERNANCE_VERSION,
    status:native ? UI_STATUS.NATIVE : UI_STATUS.COMPAT,
    route:UI_MIGRATION_ROUTES.find((item) => routeMatches(pathname, item.href)) || null,
  };
}

export function uiMigrationSummary() {
  const trackedNative = UI_MIGRATION_ROUTES.filter((item) => NATIVE_ROUTES.some((href) => routeMatches(item.href, href))).length;
  return {
    native:NATIVE_ROUTES.length,
    tracked:UI_MIGRATION_ROUTES.length,
    compatibility:UI_MIGRATION_ROUTES.length - trackedNative,
  };
}
