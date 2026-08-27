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
});

export const WORK_PLATFORM_PRIMARY_OPERATION_KEY = 'attendance';

// هذه اختصارات فقط. لا تُحذف هذه الأدوات من الكتالوج السفلي بسبب ظهورها هنا.
export const WORK_PLATFORM_OPERATION_KEYS = Object.freeze([
  'attendance',
  'expenses',
]);

// العمل المباشر في البوابات العامة. ظهور أي href هنا لا يلغي ظهوره داخل الكتالوج الكامل.
export const PORTAL_DIRECT_WORK = Object.freeze({
  workforce: Object.freeze({
    primaryHref: '/dashboard/employees',
    primaryCopy: 'ابدأ من سجل الموظفين للوصول السريع إلى ملفات العاملين وحالتهم الحالية.',
    primaryStatus: 'ملفات الموظفين هي نقطة البدء',
    secondaryHref: '/dashboard/leaves',
    secondaryCopy: 'الإجازات والحركات المرتبطة برصيد الموظف.',
  }),
  finance: Object.freeze({
    primaryHref: '/dashboard/advances',
    primaryCopy: 'ابدأ من السلف والمديونيات لتسجيل ومتابعة الطلب المالي من مصدر واحد.',
    primaryStatus: 'الطلبات المالية هي نقطة البدء',
    secondaryHref: null,
    secondaryCopy: 'المراجعة والاعتماد موجودان أيضًا ضمن كتالوج المالية الكامل.',
  }),
  documents: Object.freeze({
    primaryHref: '/dashboard/documents',
    primaryCopy: 'ابدأ من مساحة المستندات لإنشاء المستند أو متابعة العمل الجاري.',
    primaryStatus: 'المستند الجاري هو نقطة البدء',
    secondaryHref: '/dashboard/register',
    secondaryCopy: 'الصادر والوارد للحركات الرسمية أثناء العمل.',
  }),
  admin: Object.freeze({
    primaryHref: '/dashboard/system-user',
    primaryCopy: 'ابدأ من إدارة الدخول عند الحاجة لإنشاء مستخدم أو ضبط وصوله.',
    primaryStatus: 'الدخول والصلاحيات من محرك واحد',
    secondaryHref: '/dashboard/settings',
    secondaryCopy: 'بيانات الشركة المرجعية المستخدمة عبر البرنامج.',
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
    itemKeys: Object.freeze(['quotes', 'custody', 'payments', 'claims', 'guarantees', 'cost-control']),
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
});

export const WORK_PLATFORM_PORTAL_ENTRY_COPY = Object.freeze({
  '/dashboard/projects': 'السجل العام، البحث، وإنشاء مشروع جديد.',
  '/dashboard/quotes': 'عروض الأسعار وجداول الكميات.',
  '/dashboard/contractors': 'المقاولون وحساباتهم وربطهم بالأعمال.',
  '/dashboard/entities': 'العملاء والجهات المرتبطة بالمشاريع.',
});
