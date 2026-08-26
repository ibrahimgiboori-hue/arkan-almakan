// دستور تجربة «منصة الأعمال».
// القاعدة: سياق واحد نشط، إجراء يومي رئيسي واحد، وكل أداة لها موضع واحد فقط.
// «مسرح العمليات» مخصص للحضور والمصروفات فقط؛ بقية الأدوات تُدار خارج وضع التركيز.

export const WORK_PLATFORM_PRIMARY_OPERATION_KEY = 'attendance';

export const WORK_PLATFORM_OPERATION_KEYS = Object.freeze([
  'attendance',
  'expenses',
]);

export const WORK_PLATFORM_SECONDARY_SECTIONS = Object.freeze([
  Object.freeze({
    key: 'execution',
    label: 'إدارة التنفيذ',
    shortLabel: 'التنفيذ',
    description: 'إعداد موارد المشروع ونطاقه وقياساته وتسجيل إنجازه. هذه عناصر تُدار عند الحاجة خارج مسرح العمليات.',
    itemKeys: Object.freeze(['labor', 'daily-output', 'scope', 'progress']),
  }),
  Object.freeze({
    key: 'finance-followup',
    label: 'المالية والمتابعة',
    shortLabel: 'المالية',
    description: 'العهدة والدفعات والمستخلصات والضمانات؛ حركات مالية تُستخدم عند الحاجة وليست جزءًا ثابتًا من كل يوم.',
    itemKeys: Object.freeze(['custody', 'payments', 'claims', 'guarantees']),
  }),
  Object.freeze({
    key: 'reports-history',
    label: 'التقارير والسجل',
    shortLabel: 'التقارير',
    description: 'قراءة ما تم وتتبعه، وليس تنفيذ حركة يومية جديدة.',
    itemKeys: Object.freeze(['timesheet-reports', 'movements']),
  }),
  Object.freeze({
    key: 'project-file',
    label: 'ملف المشروع',
    shortLabel: 'ملف المشروع',
    description: 'الملخص والمستندات والبيانات المرجعية للمشروع.',
    itemKeys: Object.freeze(['overview', 'docs', 'settings']),
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
