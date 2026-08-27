// دستور أقسام البوابات — كل قسم هنا يجب أن يملك بيانات/وظيفة حقيقية وصلاحية مركزية.
// في الواجهة الموحدة تظهر جميع الوجهات المسموحة داخل الكتالوج؛ الاختصارات قد تكرر الوجهة ولا تُخفيها.

export const PORTAL_SECTION_ROUTE_PREFIX = '/dashboard/workspace';

export function portalSectionHref(portalKey, sectionKey) {
  return `${PORTAL_SECTION_ROUTE_PREFIX}/${portalKey}/section/${sectionKey}`;
}

const section = (portalKey, key, label, description, capabilities, dataKind = key) => Object.freeze({
  key,
  portalKey,
  label,
  description,
  capabilities: Object.freeze(capabilities || []),
  dataKind,
  href: portalSectionHref(portalKey, key),
});

export const PORTAL_SECTION_CATALOG = Object.freeze({
  workforce: Object.freeze({
    payroll: section('workforce', 'payroll', 'إعداد الرواتب', 'دورات الرواتب الشهرية ومكوناتها والخصومات وصافي الاستحقاق.', ['hr.payroll.view'], 'hr-payroll'),
    compliance: section('workforce', 'compliance', 'الوثائق والانتهاءات', 'وثائق الموظفين والهويات وتواريخ الانتهاء والتنبيهات المرتبطة بها.', ['hr.employee_documents.view'], 'hr-compliance'),
    disciplinary: section('workforce', 'disciplinary', 'العلاقات والإجراءات', 'المخالفات والتحقيقات والجزاءات وحالتها ضمن ملف الموظف.', ['hr.disciplinary.view'], 'hr-disciplinary'),
    endService: section('workforce', 'end-service', 'نهاية الخدمة', 'تسويات نهاية الخدمة والإجازات والديون والمستحقات النهائية.', ['hr.end_service.view'], 'hr-end-service'),
    performance: section('workforce', 'performance', 'فترة التجربة والأداء', 'متابعة تقييمات فترة التجربة وما يرتبط بقرار الاستمرار وخطط التحسين.', ['hr.recruitment.view'], 'hr-performance'),
    planning: section('workforce', 'planning', 'تخطيط القوى العاملة', 'الشواغر والهيكل والاحتياج الوظيفي وربط المطلوب بالموجود فعليًا.', ['hr.organization.view', 'hr.recruitment.view'], 'hr-planning'),
  }),
  finance: Object.freeze({
    cases: section('finance', 'cases', 'المعاملات المالية', 'المعاملات الواردة للمالية من مصادر النظام ومراحل المراجعة والإغلاق.', ['finance.cases.view'], 'finance-cases'),
    treasury: section('finance', 'treasury', 'الخزينة والبنوك', 'الحسابات البنكية والصندوق والأرصدة والحركات الداخلة والخارجة.', ['finance.treasury.view'], 'finance-treasury'),
    reconciliation: section('finance', 'reconciliation', 'المطابقة البنكية', 'قيود كشف البنك وحالة مطابقتها بالحركات المالية المسجلة في النظام.', ['finance.reconciliation.view'], 'finance-reconciliation'),
    dues: section('finance', 'dues', 'الذمم والمستحقات', 'المبالغ المستحقة على الموظفين والأطراف وما يحتاج متابعة مالية.', ['finance.dues.view'], 'finance-dues'),
    invoices: section('finance', 'invoices', 'الفواتير والتحصيل', 'المطالبات الجاهزة للفوترة وحالة الفاتورة والتحصيل من العميل.', ['finance.overview.view', 'finance.projects.view'], 'finance-invoices'),
    cashflow: section('finance', 'cashflow', 'السيولة والتوقعات', 'حالة المشاريع المالية والتحصيل والتكلفة ومؤشرات الضغط على السيولة.', ['finance.projects.view', 'finance.overview.view'], 'finance-cashflow'),
    payroll: section('finance', 'payroll', 'اعتماد وصرف الرواتب', 'عرض دورات الرواتب بعد إعدادها ومتابعة مسار المراجعة والاعتماد والصرف.', ['finance.payroll.view'], 'finance-payroll'),
    vat: section('finance', 'vat', 'الضريبة', 'ملخص ضريبة القيمة المضافة المرتبطة بالمطالبات والتحصيل حسب الفترة.', ['finance.overview.view'], 'finance-vat'),
  }),
  documents: Object.freeze({
    review: section('documents', 'review', 'المراجعة والاعتماد', 'المستندات وحركات الاعتماد المرتبطة بها قبل الإصدار أو الإقفال.', ['system.approvals.view'], 'documents-review'),
  }),
  admin: Object.freeze({
    procedureRoutes: section('admin', 'procedure-routes', 'دستور حركة المعاملات', 'جدول حي يحصر عمليات البرنامج ويحدد مجال حركة كل عملية والجهات المسموح توجيه الإجراء إليها.', ['system.approvals.route'], 'admin-procedure-routes'),
    workflows: section('admin', 'workflows', 'سير العمل والاعتمادات', 'مسارات الاعتماد الفعلية وحالتها وخطواتها عبر وحدات البرنامج.', ['system.approvals.view'], 'admin-workflows'),
    audit: section('admin', 'audit', 'سجل النظام والتدقيق', 'أثر التعديلات والإجراءات داخل النظام: من غيّر ماذا ومتى.', ['system.access.manage_access'], 'admin-audit'),
    catalogs: section('admin', 'catalogs', 'قواميس النظام', 'التسلسلات الرقمية ومكتبة البنود والقيم المرجعية التي تستخدمها الوحدات.', ['system.access.manage_access'], 'admin-catalogs'),
  }),
});

// الصلاحيات المطلوبة للوجهات الموجودة مسبقًا في البوابات.
// المطلوب هنا «واحدة من» القيم، بينما RLS يبقى صاحب القرار النهائي داخل قاعدة البيانات.
export const PORTAL_EXISTING_DESTINATION_CAPABILITIES = Object.freeze({
  '/dashboard/employees/new': Object.freeze(['hr.employees.create']),
  '/dashboard/employees': Object.freeze(['hr.employees.view']),
  '/dashboard/leaves': Object.freeze(['hr.leaves.view']),
  '/dashboard/leave-history-import': Object.freeze(['hr.leaves.record', 'hr.leaves.create']),
  '/dashboard/recruitment': Object.freeze(['hr.recruitment.view']),
  '/dashboard/recruitment/offers': Object.freeze(['hr.recruitment.view']),
  '/dashboard/recruitment/contracts': Object.freeze(['hr.contracts.view', 'hr.recruitment.view']),
  '/dashboard/recruitment/onboarding': Object.freeze(['hr.recruitment.view']),
  '/dashboard/advances': Object.freeze(['finance.advances.view']),
  '/dashboard/approvals': Object.freeze(['system.approvals.view', 'finance.cases.view']),
  '/dashboard/board': Object.freeze(['system.access.manage_access']),
  '/dashboard/settings': Object.freeze(['system.access.manage_access']),
  '/dashboard/system-user': Object.freeze(['system.access.manage_access']),
  '/dashboard/org-structure': Object.freeze(['hr.organization.view', 'system.access.manage_access']),
  '/dashboard/backup': Object.freeze(['system.access.manage_access']),
});

export const PORTAL_SECTION_ITEMS = Object.freeze(
  Object.fromEntries(Object.entries(PORTAL_SECTION_CATALOG).map(([portalKey, catalog]) => [
    portalKey,
    Object.values(catalog).map((item) => Object.freeze({
      href: item.href,
      label: item.label,
      capabilities: item.capabilities,
      sectionKey: item.key,
    })),
  ])),
);

// هندسة كتالوج الأدوات داخل كل بوابة. كل الأقسام تُعرض معًا في الواجهة الموحدة.
export const PORTAL_MANAGEMENT_SECTIONS = Object.freeze({
  workforce: Object.freeze([
    Object.freeze({
      key: 'people', label: 'الأفراد', shortLabel: 'الأفراد',
      description: 'ملف الموظف أثناء الخدمة: الإضافة والبيانات والإجازات والوثائق والعلاقات الوظيفية ونهاية الخدمة.',
      hrefs: Object.freeze([
        '/dashboard/employees/new', '/dashboard/employees', '/dashboard/leaves', '/dashboard/leave-history-import',
        portalSectionHref('workforce','compliance'),
        portalSectionHref('workforce','disciplinary'),
        portalSectionHref('workforce','end-service'),
      ]),
    }),
    Object.freeze({
      key: 'recruitment', label: 'التوظيف والتخطيط', shortLabel: 'التوظيف',
      description: 'من تحديد الاحتياج والشاغر إلى المرشح والعرض والعقد والمباشرة وفترة التجربة.',
      hrefs: Object.freeze([
        portalSectionHref('workforce','planning'),
        '/dashboard/recruitment','/dashboard/recruitment/offers','/dashboard/recruitment/contracts','/dashboard/recruitment/onboarding',
        portalSectionHref('workforce','performance'),
      ]),
    }),
    Object.freeze({
      key: 'compensation', label: 'الرواتب والتعويضات', shortLabel: 'الرواتب',
      description: 'إعداد دورة الراتب وربط الاستحقاقات والخصومات بالبيانات المسجلة في ملف الموظف.',
      hrefs: Object.freeze([portalSectionHref('workforce','payroll')]),
    }),
  ]),
  finance: Object.freeze([
    Object.freeze({
      key: 'operations', label: 'المعاملات والذمم', shortLabel: 'المعاملات',
      description: 'الطلبات والمعاملات والذمم التي تصل إلى المالية من الموظفين والمشاريع والأطراف.',
      hrefs: Object.freeze(['/dashboard/advances', portalSectionHref('finance','cases'), portalSectionHref('finance','dues')]),
    }),
    Object.freeze({
      key: 'treasury', label: 'الخزينة والبنوك', shortLabel: 'الخزينة',
      description: 'الأرصدة والحركات البنكية ومطابقة الكشف مع الحركة المالية المسجلة.',
      hrefs: Object.freeze([portalSectionHref('finance','treasury'), portalSectionHref('finance','reconciliation')]),
    }),
    Object.freeze({
      key: 'control', label: 'التحكم المالي', shortLabel: 'التحكم',
      description: 'الفواتير والتحصيل والسيولة والرواتب والضريبة كطبقة متابعة وتحكم مالي.',
      hrefs: Object.freeze([
        portalSectionHref('finance','invoices'), portalSectionHref('finance','cashflow'),
        portalSectionHref('finance','payroll'), portalSectionHref('finance','vat'),
      ]),
    }),
    Object.freeze({
      key: 'approvals', label: 'الاعتمادات', shortLabel: 'الاعتمادات',
      description: 'المعاملات التي وصلت إلى مسار المراجعة والقرار الرسمي.',
      hrefs: Object.freeze(['/dashboard/approvals']),
    }),
  ]),
  documents: Object.freeze([
    Object.freeze({
      key: 'current', label: 'العمل الجاري', shortLabel: 'العمل الجاري',
      description: 'إنشاء المستندات ومتابعة الصادر والوارد أثناء العمل.',
      hrefs: Object.freeze(['/dashboard/documents','/dashboard/register']),
    }),
    Object.freeze({
      key: 'review', label: 'المراجعة والاعتماد', shortLabel: 'المراجعة',
      description: 'المستندات التي تمر بمراجعة أو اعتماد قبل الإصدار أو الإقفال.',
      hrefs: Object.freeze([portalSectionHref('documents','review')]),
    }),
    Object.freeze({
      key: 'archive', label: 'الأرشيف', shortLabel: 'الأرشيف',
      description: 'الوصول إلى النسخ والسجلات المحفوظة بعد انتهاء العمل عليها.',
      hrefs: Object.freeze(['/dashboard/archive']),
    }),
    Object.freeze({
      key: 'templates', label: 'النماذج', shortLabel: 'النماذج',
      description: 'مكتبة القوالب وبناء النماذج التي تستخدمها المستندات ومساحات الإدخال.',
      hrefs: Object.freeze(['/dashboard/formbuilder']),
    }),
  ]),
  admin: Object.freeze([
    Object.freeze({
      key: 'company', label: 'الشركة والهيكل', shortLabel: 'الشركة',
      description: 'بيانات الشركة ومجلس الإدارة والهيكل التنظيمي.',
      hrefs: Object.freeze(['/dashboard/board','/dashboard/settings','/dashboard/org-structure']),
    }),
    Object.freeze({
      key: 'access', label: 'الدخول والصلاحيات', shortLabel: 'الدخول',
      description: 'إدارة دخول المستخدمين والصلاحيات ضمن المحرك المركزي.',
      hrefs: Object.freeze(['/dashboard/system-user']),
    }),
    Object.freeze({
      key: 'governance', label: 'الحوكمة وسير العمل', shortLabel: 'الحوكمة',
      description: 'دستور حركة العمليات ومسارات الاعتماد وسجل التدقيق والقواميس واستمرارية النظام.',
      hrefs: Object.freeze([
        portalSectionHref('admin','procedure-routes'), portalSectionHref('admin','workflows'), portalSectionHref('admin','audit'),
        portalSectionHref('admin','catalogs'), '/dashboard/backup',
      ]),
    }),
  ]),
});

export function portalSectionDefinition(portalKey, sectionKey) {
  return PORTAL_SECTION_CATALOG?.[portalKey]?.[sectionKey] || null;
}

export function portalDestinationCapabilities(item) {
  return item?.capabilities || PORTAL_EXISTING_DESTINATION_CAPABILITIES[item?.href] || [];
}

export function canSeePortalDestination(item, capabilityKeys, fullAdmin = false) {
  if (fullAdmin) return true;
  const required = portalDestinationCapabilities(item);
  if (!required.length) return true;
  const keys = capabilityKeys instanceof Set ? capabilityKeys : new Set(capabilityKeys || []);
  return required.some((key) => keys.has(key));
}
