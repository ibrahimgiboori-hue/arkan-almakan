// دستور تجربة «منصة الأعمال».
// القاعدة: سياق واحد نشط، إجراء يومي رئيسي واحد، وكل أداة لها موضع واحد فقط.
// لا نكرر نفس الوجهة في أكثر من مجموعة، ولا نساوي الأدوات اليومية بالتقارير أو الإعدادات.

export const WORK_PLATFORM_PRIMARY_OPERATION_KEY = 'attendance';

export const WORK_PLATFORM_OPERATION_KEYS = Object.freeze([
  'attendance',
  'daily-output',
  'expenses',
  'custody',
]);

export const WORK_PLATFORM_SECONDARY_SECTIONS = Object.freeze([
  Object.freeze({
    key: 'execution',
    label: 'إدارة التنفيذ',
    shortLabel: 'التنفيذ',
    description: 'إعداد موارد المشروع ونطاقه وقياساته. هذه عناصر تُدار عند الحاجة وليست حركة يومية متكررة.',
    itemKeys: Object.freeze(['labor', 'scope', 'progress']),
  }),
  Object.freeze({
    key: 'finance-followup',
    label: 'المالية والمتابعة',
    shortLabel: 'المالية',
    description: 'الدفعات والمستخلصات والضمانات دون مزاحمة التشغيل اليومي.',
    itemKeys: Object.freeze(['payments', 'claims', 'guarantees']),
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
  attendance: 'ابدأ يوم الموقع من هنا: حضور كامل أو نصف يوم وفق العمالة المسندة.',
  'daily-output': 'تسجيل الكميات أو الإنجاز المنفذ اليوم.',
  expenses: 'تسجيل مصروفات الموقع اليومية.',
  custody: 'استلام وصرف وتسوية العهدة.',
});

export const WORK_PLATFORM_PORTAL_ENTRY_COPY = Object.freeze({
  '/dashboard/projects': 'السجل العام، البحث، وإنشاء مشروع جديد.',
  '/dashboard/quotes': 'عروض الأسعار وجداول الكميات.',
  '/dashboard/contractors': 'المقاولون وحساباتهم وربطهم بالأعمال.',
  '/dashboard/entities': 'العملاء والجهات المرتبطة بالمشاريع.',
});
