// دستور واجهة أركان المكان.
// القاعدة: لا توجد هوية للمشاريع وهوية للموارد البشرية وهوية للمالية.
// كل البرنامج يرث Shell واحدًا، سطح بيانات واحدًا، ومسرح إدخال واحدًا.
export const UI_GOVERNANCE_VERSION = '3.0';

export const UI_STATUS = Object.freeze({
  NATIVE: 'native',
  COMPAT: 'compat',
});

export const INTERFACE_CONSTITUTION = Object.freeze({
  shell:'global-black-shell',
  canvas:'warm-neutral-canvas',
  dataSurface:'single-bordered-surface',
  accent:'single-maroon-action',
  navigation:'context-before-tools',
  entry:'full-focus-entry-theater',
  back:'single-back-action',
  cards:'no-card-inside-card',
  density:'calm-readable-data',
});

const NATIVE_ROUTES = Object.freeze([
  '/dashboard',
  '/dashboard/employees',
  '/dashboard/leaves',
  '/dashboard/advances',
  '/dashboard/projects',
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

// المسارات المستقلة المعروفة تدخل المسرح فورًا.
// الإدخال الموجود داخل شاشة عرض لا يحتاج تسجيل مسار: EntryTheaterController يكتشف
// مجموعة الإدخال الحقيقية مركزيًا عند الوصول إليها، مع استبعاد البحث والفلاتر.
const DATA_ENTRY_THEATERS = Object.freeze([
  {
    key:'employee-new',
    title:'إضافة موظف',
    description:'بيانات الموظف',
    fallback:'/dashboard/employees',
    match:(p)=>p === '/dashboard/employees/new' || p === '/dashboard/employees/new/',
  },
  {
    key:'document-new',
    title:'إنشاء مستند',
    description:'محرر المستند',
    fallback:'/dashboard/documents',
    match:(p)=>/^\/dashboard\/documents\/new\/[^/]+\/?$/.test(p),
  },
  {
    key:'document-edit',
    title:'تحرير المستند',
    description:'محرر المستند',
    fallback:'/dashboard/documents',
    match:(p)=>/^\/dashboard\/documents\/edit\/[^/]+\/?$/.test(p),
  },
  {
    key:'formbuilder-edit',
    title:'محرر النموذج',
    description:'تصميم النموذج',
    fallback:'/dashboard/formbuilder',
    match:(p)=>/^\/dashboard\/formbuilder\/[^/]+\/?$/.test(p),
  },
  {
    key:'quote-edit',
    title:'عرض السعر',
    description:'تحرير بيانات العرض',
    fallback:'/dashboard/quotes',
    match:(p)=>/^\/dashboard\/quotes\/[^/]+(?:\/terms)?\/?$/.test(p),
  },
  {
    key:'recruitment-offer',
    title:'العرض الوظيفي',
    description:'إعداد العرض',
    fallback:'/dashboard/recruitment',
    match:(p)=>/^\/dashboard\/recruitment\/applications\/[^/]+\/offer\/?$/.test(p),
  },
  {
    key:'recruitment-contract',
    title:'مسودة العقد',
    description:'تحرير العقد',
    fallback:'/dashboard/recruitment/contracts',
    match:(p)=>/^\/dashboard\/recruitment\/contracts\/[^/]+\/?$/.test(p),
  },
  {
    key:'onboarding-edit',
    title:'المباشرة والتهيئة',
    description:'إدخال بيانات المباشرة',
    fallback:'/dashboard/recruitment/onboarding',
    match:(p)=>/^\/dashboard\/recruitment\/onboarding\/[^/]+\/?$/.test(p),
  },
  {
    key:'timesheet-edit',
    title:'التايم شيت',
    description:'إدخال ومراجعة السجل',
    fallback:'/dashboard/timesheet',
    match:(p)=>/^\/dashboard\/timesheet\/[^/]+\/?$/.test(p) && !/^\/dashboard\/timesheet\/(?:day|week|worker|report|settlement)\/?$/.test(p),
  },
  {
    key:'generic-create',
    title:'إضافة بيانات',
    description:'مساحة إدخال',
    fallback:'/dashboard',
    match:(p)=>/^\/dashboard\/.+\/(?:new|create)\/?$/.test(p),
  },
  {
    key:'generic-edit',
    title:'تحرير البيانات',
    description:'مساحة إدخال',
    fallback:'/dashboard',
    match:(p)=>/^\/dashboard\/.+\/edit\/[^/]+\/?$/.test(p),
  },
]);

function routeMatches(pathname, href) {
  if (pathname === href) return true;
  return href !== '/dashboard' && pathname.startsWith(`${href}/`);
}

export function dataEntryTheaterFor(pathname='') {
  return DATA_ENTRY_THEATERS.find((item) => item.match(pathname)) || null;
}

export function isDataEntryTheater(pathname='') {
  return Boolean(dataEntryTheaterFor(pathname));
}

export function uiGovernanceFor(pathname='') {
  const native = NATIVE_ROUTES.some((href) => routeMatches(pathname, href));
  return {
    version:UI_GOVERNANCE_VERSION,
    status:native ? UI_STATUS.NATIVE : UI_STATUS.COMPAT,
    route:UI_MIGRATION_ROUTES.find((item) => routeMatches(pathname, item.href)) || null,
    entryTheater:dataEntryTheaterFor(pathname),
    constitution:INTERFACE_CONSTITUTION,
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
