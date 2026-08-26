// دستور تجربة «منصة الأعمال».
// كل أداة مشروع لها موضع واحد فقط داخل المنصة؛ لا نكرر نفس الوجهة في أكثر من مجموعة.
// التشغيل الآن = ما ينفذه المستخدم مباشرة في الموقع خلال اليوم.

export const WORK_PLATFORM_OPERATION_KEYS = Object.freeze([
  'labor',
  'attendance',
  'daily-output',
  'expenses',
  'custody',
]);

export const WORK_PLATFORM_SECONDARY_SECTIONS = Object.freeze([
  Object.freeze({
    key: 'execution',
    label: 'إدارة التنفيذ',
    description: 'النطاق والقياسات التي تضبط تنفيذ المشروع.',
    itemKeys: Object.freeze(['scope', 'progress']),
  }),
  Object.freeze({
    key: 'finance-followup',
    label: 'المالية والمتابعة',
    description: 'الدفعات والمستخلصات والضمانات دون مزاحمة التشغيل اليومي.',
    itemKeys: Object.freeze(['payments', 'claims', 'guarantees']),
  }),
  Object.freeze({
    key: 'reports-history',
    label: 'التقارير والسجل',
    description: 'قراءة ما تم وتتبعه، وليس تنفيذ حركة يومية جديدة.',
    itemKeys: Object.freeze(['timesheet-reports', 'movements']),
  }),
  Object.freeze({
    key: 'project-file',
    label: 'ملف المشروع',
    description: 'الملخص والمستندات والبيانات المرجعية للمشروع.',
    itemKeys: Object.freeze(['overview', 'docs', 'settings']),
  }),
]);

export const WORK_PLATFORM_OPERATION_COPY = Object.freeze({
  labor: 'توزيع العمالة وربطها بالمقاولين.',
  attendance: 'تسجيل الحضور ونصف اليوم للموقع.',
  'daily-output': 'تسجيل الكميات أو الإنجاز المنفذ اليوم.',
  expenses: 'تسجيل مصروفات الموقع اليومية.',
  custody: 'استلام وصرف وتسوية العهدة.',
});

export const WORK_PLATFORM_PORTAL_ENTRY_COPY = Object.freeze({
  '/dashboard/projects': 'السجل العام وإنشاء المشاريع وإدارتها.',
  '/dashboard/quotes': 'عروض الأسعار وجداول الكميات.',
  '/dashboard/contractors': 'المقاولون وحساباتهم وربطهم بالأعمال.',
  '/dashboard/entities': 'العملاء والجهات المرتبطة بالمشاريع.',
});
