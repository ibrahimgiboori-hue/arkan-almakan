// DNA الملاحة التشريحية في الجسد الجديد.
// «أركان المكان» هي الوعي المستتر للنظام وليست عقدة مرئية في شجرة التنقل.
// الواجهة تبدأ من منظور المستخدم، ثم الأجهزة، ثم الأعضاء/المناطق/الوظائف والمعاملات.

export const ANATOMY_LEVEL = Object.freeze({
  PERSPECTIVE: 'perspective',
  SYSTEM: 'system',
  ORGAN: 'organ',
  REGION: 'region',
  FUNCTION: 'function',
  TRANSACTION: 'transaction',
  DETAIL: 'detail',
});

export const IMPLICIT_CONSCIOUSNESS_POLICY = Object.freeze({
  id: 'implicit-consciousness-v1',
  productIdentityRole: 'implicit-consciousness-not-navigation-root',
  dailyNavigationMustNotRenderProductName: true,
  visibleRoot: ANATOMY_LEVEL.PERSPECTIVE,
  perspectiveExit: 'return-to-user-work-perspective-when-anatomical-parent-ends',
  backMeaning: 'anatomical-zoom-out-not-browser-history',
  parentNaming: 'show-real-parent-label-never-generic-back-or-all',
  siblingNaming: 'child-must-add-meaning-and-must-not-repeat-parent-label',
  singleChildPolicy: 'do-not-invent-a-navigation-level-for-a-single-child',
  routeHistoryPolicy: 'browser-history-is-not-the-anatomical-parent-graph',
});

export const USER_PERSPECTIVE = Object.freeze({
  key: 'work',
  level: ANATOMY_LEVEL.PERSPECTIVE,
  label: 'مركز العمل',
  href: '/dashboard',
  children: Object.freeze([
    Object.freeze({ key:'my-work', label:'أعمالي', href:'/dashboard/my-work' }),
    Object.freeze({ key:'approvals', label:'اعتماداتي', href:'/dashboard/my-work/approvals' }),
  ]),
});

export const AREA_ANATOMY = Object.freeze({
  projects: Object.freeze({ level:ANATOMY_LEVEL.SYSTEM, label:'المشاريع' }),
  workforce: Object.freeze({ level:ANATOMY_LEVEL.SYSTEM, label:'الموارد البشرية' }),
  finance: Object.freeze({ level:ANATOMY_LEVEL.SYSTEM, label:'المالية' }),
  documents: Object.freeze({ level:ANATOMY_LEVEL.SYSTEM, label:'المستندات' }),
  admin: Object.freeze({ level:ANATOMY_LEVEL.SYSTEM, label:'الإدارة' }),
});

// أسماء العرض التشريحية. لا نغيّر المسارات أو صلاحياتها؛ نمنع فقط أن يحمل الابن
// اسم أبيه نفسه أو اسمًا لا يشرح وظيفته داخل ذلك الأب.
const TOOL_LABELS = Object.freeze({
  '/dashboard/projects': 'سجل المشاريع',
  '/dashboard/quotes': 'سجل عروض الأسعار',
  '/dashboard/employees': 'سجل الموظفين',
  '/dashboard/documents': 'النماذج والمستندات',
  '/dashboard/board': 'مجلس الإدارة',
  '/dashboard/settings': 'بيانات الشركة',
});

export function anatomyAreaLabel(areaOrKey, fallback = '') {
  const key = typeof areaOrKey === 'string' ? areaOrKey : areaOrKey?.key;
  const configured = AREA_ANATOMY[key]?.label;
  if (configured) return configured;
  const raw = fallback || areaOrKey?.label || '';
  return String(raw).replace(/^بوابة\s+/, '').trim();
}

export function anatomyToolLabel(areaKey, item) {
  if (item?.sectionKey === 'disciplinary') return 'الإجراءات التأديبية';
  if (item?.sectionKey === 'performance') return 'فترة التجربة';
  const explicit = TOOL_LABELS[item?.href];
  if (explicit) return explicit;

  const label = String(item?.label || 'أداة').trim();
  const parent = AREA_ANATOMY[areaKey]?.label || '';
  if (label && parent && label === parent) return `سجل ${label}`;
  return label || 'أداة';
}

export function anatomyGroupLabel(areaKey, group) {
  const label = String(group?.label || '').trim();
  const parent = AREA_ANATOMY[areaKey]?.label || '';
  if (label && parent && label === parent) return 'السجل';
  return label || 'المجموعة';
}

export function isMeaningfulBranch(group) {
  return Array.isArray(group?.items) && group.items.length > 1;
}

export function perspectiveQuickLinks({ approvals = false } = {}) {
  return [
    { label:USER_PERSPECTIVE.label, href:USER_PERSPECTIVE.href },
    USER_PERSPECTIVE.children[0],
    ...(approvals ? [USER_PERSPECTIVE.children[1]] : []),
  ];
}
