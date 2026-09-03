// DNA الملاحة التشريحية في الجسد الجديد.
// «أركان المكان» هي الوعي المستتر للنظام وليست عقدة مرئية في شجرة التنقل.
// «مركز العمل» ليس وجهة في القائمة؛ هو وضع الخمول الطبيعي للمساحة الكبيرة فقط.

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
  idlePerspectiveOnly: true,
  workCenterMustNotAppearInNavigation: true,
});

// منظور المستخدم موجود في الجسد، لا في القائمة. عند الخمول يظهر «مركز العمل»
// تلقائيًا في المساحة الكبيرة، وعند اختيار بوابة يفسح المكان فورًا للملاحة والعمل.
export const IDLE_WORK_SURFACE = Object.freeze({
  key:'work-center',
  level:ANATOMY_LEVEL.PERSPECTIVE,
  label: 'مركز العمل',
  href:'/dashboard',
  visibility:'idle-body-only',
  navigationAccess:false,
  lenses:Object.freeze([
    Object.freeze({ key:'today', label:'اليوم', href:'/dashboard/my-work' }),
    Object.freeze({ key:'my-work', label:'أعمالي', href:'/dashboard/my-work' }),
    Object.freeze({ key:'decisions', label:'بانتظار قراري', href:'/dashboard/approvals' }),
    Object.freeze({ key:'followup', label:'أتابعها', href:'/dashboard/my-work' }),
    Object.freeze({ key:'completed', label:'المكتملة', href:'/dashboard/my-work' }),
  ]),
});

// هذا الاسم يخص جذر القائمة المرئي فقط. ليس هو مركز العمل ولا يمثل وعي البرنامج.
export const USER_PERSPECTIVE = Object.freeze({
  key:'navigation-root',
  level:ANATOMY_LEVEL.PERSPECTIVE,
  label:'البوابات',
  href:null,
  children:Object.freeze([]),
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

// أبقى التصدير للتوافق أثناء الهجرة، لكن القائمة لا تستقبل أي عدسة شخصية.
export function perspectiveQuickLinks() {
  return [];
}
