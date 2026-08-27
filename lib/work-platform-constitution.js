// دستور تجربة «منصة الأعمال».
// القاعدة النهائية: واجهة واحدة، سياق واحد نشط، وكل أداة مسموحة ظاهرة داخل الكتالوج الكامل.
// البحث والاختصارات أدوات مساعدة فقط، ولا تملك أي وجهة حصرية مخفية عن الكتالوج.

export const WORK_PLATFORM_LAYOUT_POLICY = Object.freeze({
  layers: Object.freeze(['context','direct-work','complete-catalog']),
  sharedContextBaseline: true,
  sharedDirectBandGeometry: true,
  completeCatalogAlwaysVisible: true,
  searchIsHelperOnly: true,
  directShortcutsMayRepeatCatalogEntries: true,
  legacyNavigationHidden: true,
  projectMustCompressToSharedBaseline: true,
  contentMovesStructureStays: true,
  approvalsHaveSingleNavigationEntry: true,
});

export const WORK_PLATFORM_PRIMARY_OPERATION_KEY = 'attendance';

// 2–3 أدوات تشغيلية متكررة فقط. الاعتمادات لها مدخل مستقل ثابت في مركز العمل.
export const WORK_PLATFORM_OPERATION_KEYS = Object.freeze([
  'attendance',
  'expenses',
  'labor',
]);

export const WORK_PLATFORM_APPROVAL_CENTER = Object.freeze({
  href: '/dashboard/my-work/approvals',
  label: 'الاعتمادات',
  description: 'المعاملات التي تنتظر منك مراجعة أو قرارًا.',
});

// العمل المباشر في البوابات العامة. كل عنصر هنا مجرد اختصار ذكي، ويظل مكان الأداة الطبيعي في الكتالوج.
export const PORTAL_DIRECT_WORK = Object.freeze({
  workforce: Object.freeze({
    daily: Object.freeze([
      Object.freeze({ href: '/dashboard/employees', copy: 'ملفات الموظفين والحالة الوظيفية الحالية.' }),
      Object.freeze({ href: '/dashboard/leaves', copy: 'طلبات وحركات الإجازات والأرصدة.' }),
      Object.freeze({ href: '/dashboard/employees/new', copy: 'إضافة موظف عند الحاجة دون البحث عن الأداة.' }),
    ]),
    primaryHref: '/dashboard/employees',
    primaryCopy: 'ابدأ من سجل الموظفين للوصول السريع إلى ملفات العاملين وحالتهم الحالية.',
    primaryStatus: 'ملفات الموظفين هي نقطة البدء',
    secondaryHref: '/dashboard/leaves',
    secondaryCopy: 'الإجازات والحركات المرتبطة برصيد الموظف.',
  }),
  finance: Object.freeze({
    daily: Object.freeze([
      Object.freeze({ href: '/dashboard/advances', copy: 'السلف والمديونيات والطلبات المالية اليومية.' }),
      Object.freeze({ href: '/dashboard/workspace/finance/section/cases', copy: 'المعاملات الواردة للمالية ومتابعة حالتها.' }),
      Object.freeze({ href: '/dashboard/workspace/finance/section/treasury', copy: 'الخزينة والبنوك والحركة النقدية.' }),
    ]),
    primaryHref: '/dashboard/advances',
    primaryCopy: 'ابدأ من السلف والمديونيات لتسجيل ومتابعة الطلب المالي من مصدر واحد.',
    primaryStatus: 'الطلبات المالية هي نقطة البدء',
    secondaryHref: '/dashboard/workspace/finance/section/cases',
    secondaryCopy: 'المعاملات الواردة للمالية ومتابعة حالتها.',
  }),
  documents: Object.freeze({
    daily: Object.freeze([
      Object.freeze({ href: '/dashboard/documents', copy: 'إنشاء المستند أو متابعة العمل الجاري.' }),
      Object.freeze({ href: '/dashboard/register', copy: 'الصادر والوارد للحركات الرسمية.' }),
      Object.freeze({ href: '/dashboard/archive', copy: 'الوصول السريع إلى النسخ والسجلات المحفوظة.' }),
    ]),
    primaryHref: '/dashboard/documents',
    primaryCopy: 'ابدأ من مساحة المستندات لإنشاء المستند أو متابعة العمل الجاري.',
    primaryStatus: 'المستند الجاري هو نقطة البدء',
    secondaryHref: '/dashboard/register',
    secondaryCopy: 'الصادر والوارد للحركات الرسمية أثناء العمل.',
  }),
  admin: Object.freeze({
    daily: Object.freeze([
      Object.freeze({ href: '/dashboard/system-user', copy: 'إنشاء المستخدمين وضبط الدخول والوصول.' }),
      Object.freeze({ href: '/dashboard/org-structure', copy: 'الهيكل التنظيمي والمسؤوليات.' }),
      Object.freeze({ href: '/dashboard/workspace/admin/section/procedure-routes', copy: 'دستور حركة المعاملات والصنارات.' }),
    ]),
    primaryHref: '/dashboard/system-user',
    primaryCopy: 'ابدأ من إدارة الدخول عند الحاجة لإنشاء مستخدم أو ضبط وصوله.',
    primaryStatus: 'الدخول والصلاحيات من محرك واحد',
    secondaryHref: '/dashboard/org-structure',
    secondaryCopy: 'الهيكل التنظيمي والمسؤوليات داخل المنشأة.',
  }),
});

// التقسيم المنطقي لكتالوج أدوات المشروع. جميع الأقسام تظهر معًا في المستوى السفلي.
export const WORK_PLATFORM_SECONDARY_SECTIONS = Object.freeze([
  Object.freeze({
    key: 'reports-history',
    label: 'التقارير',
    shortLabel: 'التقارير',
    description: 'قراءة ما تم وتتبعه، وليس تنفيذ حركة يومية جديدة.',
    itemKeys: Object.freeze(['timesheet-reports', 'movements']),
  }),
  Object.freeze({
    key: 'finance-followup',
    label: 'المالية',
    shortLabel: 'المالية',
    description: 'عروض الأسعار والعهدة والدفعات والمستخلصات والضمانات والتحكم المالي الخاص بهذا المشروع، دون خلطه بصلاحيات المالية العامة.',
    itemKeys: Object.freeze(['quotes', 'quote-register', 'custody', 'payments', 'claims', 'guarantees', 'cost-control']),
  }),
  Object.freeze({
    key: 'execution',
    label: 'التنفيذ',
    shortLabel: 'التنفيذ',
    description: 'الموارد والنطاق والقياسات والتخطيط والتغييرات التي تؤثر في التنفيذ.',
    itemKeys: Object.freeze(['labor', 'daily-output', 'scope', 'progress', 'planning', 'changes']),
  }),
  Object.freeze({
    key: 'project-file',
    label: 'ملف المشروع',
    shortLabel: 'ملف المشروع',
    description: 'الملخص والمستندات والمراسلات والبيانات المرجعية للمشروع.',
    itemKeys: Object.freeze(['overview', 'docs', 'correspondence', 'settings']),
  }),
]);

export const WORK_PLATFORM_OPERATION_COPY = Object.freeze({
  attendance: 'تسجيل حضور الموقع بسرعة ووضوح وفق العمالة المسندة.',
  expenses: 'تسجيل مصروفات الموقع اليومية وإرفاق إثباتها.',
  labor: 'إدارة العمالة وإضافة عامل للمشروع الجاري.',
});

export const WORK_PLATFORM_PORTAL_ENTRY_COPY = Object.freeze({
  '/dashboard/projects': 'السجل العام، البحث، وإنشاء مشروع جديد.',
  '/dashboard/quotes': 'سجل عروض الأسعار القديمة والجديدة.',
  '/dashboard/contractors': 'المقاولون وحساباتهم وربطهم بالأعمال.',
  '/dashboard/entities': 'العملاء والجهات المرتبطة بالمشاريع.',
});
