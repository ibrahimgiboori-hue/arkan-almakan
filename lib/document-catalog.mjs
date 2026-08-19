const CATALOG_VERSION = '1.16';

export const DOCUMENT_CATEGORY_META = Object.freeze({
  recruitment: { label: 'الاستقطاب والتوظيف', prefix: 'REC' },
  onboarding: { label: 'التعيين والتهيئة', prefix: 'ONB' },
  employee_services: { label: 'خدمات الموظفين', prefix: 'ESV' },
  attendance_leave: { label: 'الدوام والإجازات', prefix: 'ATL' },
  performance_training: { label: 'الأداء والتدريب', prefix: 'PRF' },
  compensation_benefits: { label: 'الأجور والمزايا', prefix: 'CMP' },
  employee_relations: { label: 'علاقات الموظفين', prefix: 'ERL' },
  offboarding: { label: 'إنهاء الخدمة والمغادرة', prefix: 'EXT' },
  projects_operations: { label: 'المشاريع والتشغيل', prefix: 'OPS' },
  procurement_assets: { label: 'المشتريات والعهد', prefix: 'AST' },
  finance_admin: { label: 'المالية والإدارة', prefix: 'FIN' },
  correspondence_governance: { label: 'المراسلات والحوكمة', prefix: 'GOV' },
  hr: { label: 'الموارد البشرية', prefix: 'HR' },
  finance: { label: 'المالية', prefix: 'FIN' },
  projects: { label: 'المشاريع', prefix: 'PRJ' },
  correspondence: { label: 'المراسلات', prefix: 'LTR' },
  custom: { label: 'نماذج المستخدم', prefix: 'CST' },
});

export const DOCUMENT_RELATION_META = Object.freeze({
  employee: 'مرتبط بموظف',
  project: 'مرتبط بمشروع',
  party: 'مرتبط بطرف',
  general: 'إداري عام',
});

const GROUPS = [
  ['recruitment', [
    ['JOB_CREATION_REQUEST', 'طلب استحداث وظيفة', 'employee_request'],
    ['JOB_DESCRIPTION_CARD', 'بطاقة وصف وظيفي', 'employee_record'],
    ['VACANCY_APPROVAL', 'طلب اعتماد شاغر', 'employee_request'],
    ['CANDIDATE_SCREENING', 'نموذج فرز مرشح', 'recruitment_record'],
    ['INITIAL_INTERVIEW', 'محضر مقابلة أولية', 'recruitment_record'],
    ['TECHNICAL_INTERVIEW', 'تقييم مقابلة فنية', 'recruitment_record'],
    ['PRACTICAL_TEST', 'اختبار عملي للمرشح', 'recruitment_record'],
    ['REFERENCE_CHECK', 'نموذج التحقق من المراجع', 'recruitment_record'],
    ['JOB_OFFER_APPROVAL', 'طلب اعتماد عرض وظيفي', 'employee_request'],
    ['VACANCY_CLOSURE', 'تقرير إغلاق شاغر', 'employee_record'],
  ]],
  ['onboarding', [
    ['HIRING_DOCUMENTS_CHECKLIST', 'قائمة استلام مستندات التعيين', 'checklist'],
    ['NEW_EMPLOYEE_DATA', 'نموذج بيانات موظف جديد', 'employee_record'],
    ['FIRST_DAY_PLAN', 'خطة اليوم الأول', 'employee_record'],
    ['POLICY_ORIENTATION', 'محضر تعريف بسياسات الشركة', 'employee_record'],
    ['NEW_EMPLOYEE_ASSET_HANDOVER', 'تسليم عهدة لموظف جديد', 'asset_record'],
    ['SYSTEM_ACCESS_REQUEST', 'طلب إنشاء حسابات وأنظمة', 'employee_request'],
    ['BUDDY_ASSIGNMENT', 'تعيين موظف مرافق', 'employee_request'],
    ['THIRTY_DAY_ONBOARDING_PLAN', 'خطة تهيئة 30 يومًا', 'employee_record'],
    ['THIRTY_DAY_REVIEW', 'تقييم اليوم الثلاثين', 'employee_record'],
    ['PROBATION_COMPLETION', 'محضر اجتياز فترة التجربة', 'employee_notice'],
  ]],
  ['employee_services', [
    ['SALARY_CERTIFICATE_REQUEST', 'طلب تعريف بالراتب', 'employee_request'],
    ['EMPLOYMENT_CERTIFICATE_REQUEST', 'طلب تعريف موظف', 'employee_request'],
    ['PERSONAL_DATA_UPDATE', 'طلب تحديث بيانات شخصية', 'employee_request'],
    ['IBAN_UPDATE', 'طلب تعديل الآيبان', 'employee_request'],
    ['EMBASSY_LETTER_REQUEST', 'طلب خطاب للسفارة', 'employee_request'],
    ['EXIT_REENTRY_REQUEST', 'طلب تأشيرة خروج وعودة', 'employee_request'],
    ['SERVICE_TRANSFER_REQUEST', 'طلب نقل خدمات', 'employee_request'],
    ['RESIDENCY_RENEWAL_REQUEST', 'طلب تمديد إقامة', 'employee_request'],
    ['DEPENDENT_ADDITION_REQUEST', 'طلب إضافة تابع', 'employee_request'],
    ['EXPERIENCE_CERTIFICATE_REQUEST', 'طلب شهادة خبرة', 'employee_request'],
  ]],
  ['attendance_leave', [
    ['EXCEPTIONAL_LEAVE', 'طلب إجازة استثنائية', 'employee_request'],
    ['EXIT_PERMISSION', 'طلب إذن خروج', 'employee_request'],
    ['REMOTE_WORK_REQUEST', 'طلب عمل عن بُعد', 'employee_request'],
    ['ATTENDANCE_CORRECTION', 'طلب تعديل بصمة', 'employee_request'],
    ['ABSENCE_RECORD', 'محضر غياب', 'employee_notice'],
    ['LATE_ARRIVAL_LOG', 'سجل تأخر', 'employee_record'],
    ['OVERTIME_ASSIGNMENT', 'تكليف عمل إضافي', 'employee_request'],
    ['TIME_OFF_IN_LIEU', 'طلب تعويض ساعات', 'employee_request'],
    ['SHIFT_SCHEDULE', 'جدول مناوبات', 'employee_record'],
    ['EVENT_ATTENDANCE_LOG', 'سجل حضور فعالية', 'employee_record'],
  ]],
  ['performance_training', [
    ['ANNUAL_GOALS_PLAN', 'خطة أهداف سنوية', 'employee_record'],
    ['MONTHLY_PERFORMANCE_REVIEW', 'تقييم أداء شهري', 'employee_record'],
    ['QUARTERLY_PERFORMANCE_REVIEW', 'تقييم أداء ربع سنوي', 'employee_record'],
    ['PROBATION_REVIEW', 'تقييم فترة تجربة', 'employee_record'],
    ['PERFORMANCE_IMPROVEMENT_PLAN', 'خطة تحسين أداء', 'employee_record'],
    ['IMPROVEMENT_PLAN_FOLLOWUP', 'متابعة خطة تحسين', 'employee_record'],
    ['TRAINING_NEEDS', 'تحديد احتياج تدريبي', 'employee_request'],
    ['TRAINING_REQUEST', 'طلب دورة تدريبية', 'employee_request'],
    ['TRAINING_EVALUATION', 'تقييم دورة تدريبية', 'employee_record'],
    ['DEVELOPMENT_SESSION', 'محضر جلسة تطوير', 'employee_record'],
  ]],
  ['compensation_benefits', [
    ['SALARY_ADJUSTMENT', 'طلب تعديل راتب', 'finance_request'],
    ['ALLOWANCE_REQUEST', 'طلب بدل', 'finance_request'],
    ['BONUS_REQUEST', 'طلب مكافأة', 'finance_request'],
    ['EMPLOYEE_ADVANCE', 'طلب سلفة موظف', 'finance_request'],
    ['PAYROLL_DEDUCTION', 'طلب استقطاع', 'finance_request'],
    ['SALARY_CHANGE_NOTICE', 'إشعار تغيير راتب', 'employee_notice'],
    ['PAYROLL_ADJUSTMENT', 'كشف تسوية راتب', 'finance_request'],
    ['EXPENSE_REIMBURSEMENT', 'طلب تعويض مصروف', 'finance_request'],
    ['TRAVEL_TICKET_REQUEST', 'طلب تذكرة سفر', 'finance_request'],
    ['BUSINESS_TRIP_SETTLEMENT', 'تسوية مهمة عمل', 'finance_request'],
  ]],
  ['employee_relations', [
    ['EMPLOYEE_COMPLAINT', 'شكوى موظف', 'employee_notice'],
    ['ADMINISTRATIVE_GRIEVANCE', 'تظلم إداري', 'employee_notice'],
    ['HEARING_MINUTES', 'محضر استماع', 'employee_record'],
    ['INVESTIGATION_MINUTES', 'محضر تحقيق', 'employee_record'],
    ['VERBAL_WARNING_RECORD', 'إنذار شفهي موثق', 'employee_notice'],
    ['WRITTEN_WARNING', 'إنذار كتابي', 'employee_notice'],
    ['EMPLOYEE_UNDERTAKING', 'تعهد موظف', 'employee_notice'],
    ['DISPUTE_SETTLEMENT', 'محضر تسوية خلاف', 'employee_record'],
    ['INTERNAL_TRANSFER', 'طلب نقل داخلي', 'employee_request'],
    ['MANAGER_CHANGE', 'طلب تغيير مدير مباشر', 'employee_request'],
  ]],
  ['offboarding', [
    ['RESIGNATION_REQUEST', 'طلب استقالة', 'employee_notice'],
    ['NON_RENEWAL_NOTICE', 'إشعار عدم تجديد', 'employee_notice'],
    ['EXIT_INTERVIEW', 'محضر مقابلة خروج', 'employee_record'],
    ['CLEARANCE_CHECKLIST', 'قائمة إخلاء طرف', 'checklist'],
    ['EXIT_ASSET_HANDOVER', 'تسليم عهدة عند المغادرة', 'asset_record'],
    ['FINAL_SETTLEMENT', 'كشف تسوية نهائية', 'finance_request'],
    ['EXPERIENCE_CERTIFICATE', 'شهادة خبرة', 'employee_notice'],
    ['ACCESS_REVOCATION', 'إلغاء الصلاحيات', 'checklist'],
    ['KNOWLEDGE_TRANSFER', 'نقل المعرفة', 'employee_record'],
    ['EMPLOYMENT_END_MINUTES', 'محضر إنهاء علاقة عمل', 'employee_record'],
  ]],
  ['projects_operations', [
    ['PROJECT_OPENING', 'طلب فتح مشروع', 'project_request'],
    ['PROJECT_KICKOFF_CARD', 'بطاقة بدء مشروع', 'project_record'],
    ['SITE_HANDOVER', 'محضر تسليم موقع', 'project_record'],
    ['DAILY_PROGRESS', 'تقرير تقدم يومي', 'project_record'],
    ['WEEKLY_PROGRESS', 'تقرير تقدم أسبوعي', 'project_record'],
    ['PROJECT_RESOURCE_REQUEST', 'طلب موارد للمشروع', 'project_request'],
    ['SCOPE_CHANGE_REQUEST', 'طلب تغيير نطاق', 'project_request'],
    ['PROJECT_BLOCKERS_LOG', 'سجل عوائق المشروع', 'project_record'],
    ['SITE_COORDINATION_MINUTES', 'محضر تنسيق موقع', 'meeting_record'],
    ['PROJECT_CLOSURE_REPORT', 'تقرير إغلاق مشروع', 'project_record'],
  ]],
  ['procurement_assets', [
    ['PURCHASE_REQUEST', 'طلب شراء', 'project_request'],
    ['QUOTATION_COMPARISON', 'مقارنة عروض أسعار', 'project_record'],
    ['SUPPLIER_APPROVAL', 'طلب اعتماد مورد', 'party_record'],
    ['MATERIAL_RECEIPT', 'أمر استلام مواد', 'project_record'],
    ['INSPECTION_RECEIPT', 'محضر فحص واستلام', 'project_record'],
    ['STOCK_ISSUE', 'نموذج صرف مخزون', 'asset_record'],
    ['STOCK_RETURN', 'نموذج مرتجع مخزون', 'asset_record'],
    ['ASSET_HANDOVER', 'تسليم عهدة', 'asset_record'],
    ['ASSET_TRANSFER', 'نقل عهدة', 'asset_record'],
    ['ASSET_INVENTORY', 'جرد عهدة', 'asset_record'],
  ]],
  ['finance_admin', [
    ['PAYMENT_REQUEST', 'طلب صرف', 'finance_request'],
    ['ADVANCE_PAYMENT_REQUEST', 'طلب دفعة مقدمة', 'finance_request'],
    ['INTERNAL_RECEIPT', 'سند استلام داخلي', 'finance_request'],
    ['CASH_RECONCILIATION', 'محضر مطابقة صندوق', 'finance_request'],
    ['JOURNAL_MEMO', 'مذكرة قيد', 'finance_request'],
    ['INVOICE_APPROVAL', 'طلب اعتماد فاتورة', 'finance_request'],
    ['EXPENSE_STATEMENT', 'كشف مصروفات', 'finance_request'],
    ['PETTY_CASH_SETTLEMENT', 'تسوية صندوق', 'finance_request'],
    ['COST_CENTER_OPENING', 'طلب فتح مركز تكلفة', 'finance_request'],
    ['BUDGET_VARIANCE', 'تقرير انحراف ميزانية', 'finance_request'],
  ]],
  ['correspondence_governance', [
    ['INTERNAL_MEMO', 'مذكرة داخلية', 'letter'],
    ['ADMINISTRATIVE_CIRCULAR', 'تعميم إداري', 'letter'],
    ['MEETING_MINUTES', 'محضر اجتماع', 'meeting_record'],
    ['DECISIONS_REGISTER', 'سجل قرارات', 'meeting_record'],
    ['AUTHORITY_DELEGATION', 'تفويض صلاحية', 'letter'],
    ['POLICY_APPROVAL', 'طلب اعتماد سياسة', 'employee_request'],
    ['DOCUMENT_REVIEW_LOG', 'سجل مراجعة مستند', 'checklist'],
    ['DOCUMENT_HANDOVER', 'محضر تسليم مستندات', 'checklist'],
    ['CONFLICT_OF_INTEREST', 'نموذج إفصاح تعارض مصالح', 'employee_notice'],
    ['CORRECTIVE_ACTION_NOTICE', 'إشعار إجراء تصحيحي', 'employee_notice'],
  ]],
];

const PROFILE_RELATIONS = Object.freeze({
  employee_request: ['employee'],
  employee_record: ['employee'],
  employee_notice: ['employee'],
  recruitment_record: ['party'],
  project_request: ['project'],
  project_record: ['project'],
  finance_request: ['employee', 'project'],
  asset_record: ['employee', 'project'],
  party_record: ['party'],
  meeting_record: ['project', 'general'],
  letter: ['party', 'general'],
  checklist: ['employee', 'project'],
});

const f = (key, label, type = 'text', span = 16, extra = {}) => ({ key, label, type, span, ...extra });

function baseFields(relations) {
  const fields = [f('transaction_date', 'تاريخ المعاملة', 'date', 12, { required: true })];
  if (relations.includes('employee')) fields.push(
    f('employee_name', 'اسم الموظف', 'text', 24, { required: true }),
    f('employee_no', 'الرقم الوظيفي', 'text', 12),
    f('job_title', 'المسمى الوظيفي', 'text', 24),
    f('department', 'الإدارة / القسم', 'text', 24),
  );
  if (relations.includes('project')) fields.push(
    f('project_name', 'المشروع', 'text', 24, { required: true }),
    f('project_no', 'رقم المشروع', 'text', 12),
    f('site_location', 'الموقع', 'text', 24),
    f('client_name', 'العميل / الجهة', 'text', 24),
  );
  if (relations.includes('party')) fields.push(
    f('party_name', 'اسم الطرف', 'text', 24, { required: true }),
    f('party_role', 'صفة الطرف', 'text', 12),
    f('party_identifier', 'رقم الهوية / السجل', 'text', 16),
    f('party_contact', 'وسيلة التواصل', 'text', 20),
  );
  if (relations.includes('general') && fields.length === 1) fields.push(
    f('department', 'الإدارة المعنية', 'text', 24),
    f('reference_no', 'المرجع', 'text', 12),
  );
  return fields;
}

function profileFields(profile) {
  if (profile === 'recruitment_record') return [
    f('vacancy_title', 'المسمى الشاغر', 'text', 24, { required: true }),
    f('candidate_name', 'اسم المرشح', 'text', 24, { required: true }),
    f('interviewer_name', 'المقيّم / المقابل', 'text', 24),
    f('overall_score', 'النتيجة', 'number', 8),
  ];
  if (profile === 'finance_request') return [
    f('amount', 'المبلغ', 'money', 12, { required: true }),
    f('cost_center', 'مركز التكلفة', 'text', 16),
    f('payment_method', 'طريقة الصرف', 'select', 12, { options: ['تحويل بنكي', 'نقدي', 'عهدة', 'تسوية'] }),
    f('due_date', 'تاريخ الاستحقاق', 'date', 12),
  ];
  if (profile === 'asset_record') return [
    f('asset_no', 'رقم العهدة / الأصل', 'text', 12),
    f('asset_name', 'اسم العهدة / الأصل', 'text', 24, { required: true }),
    f('serial_no', 'الرقم التسلسلي', 'text', 16),
    f('asset_condition', 'الحالة', 'select', 12, { options: ['جديد', 'جيد', 'يحتاج صيانة', 'تالف'] }),
  ];
  if (profile === 'meeting_record') return [
    f('meeting_title', 'موضوع الاجتماع', 'text', 24, { required: true }),
    f('meeting_location', 'مكان الاجتماع', 'text', 16),
    f('chairperson', 'رئيس الاجتماع', 'text', 16),
    f('attendees', 'الحاضرون', 'textarea', 32),
  ];
  if (profile === 'letter') return [
    f('addressee', 'المخاطب', 'text', 24, { required: true }),
    f('addressee_title', 'صفة المخاطب', 'text', 16),
    f('our_ref', 'إشارتنا', 'text', 12),
    f('your_ref', 'إشارتكم', 'text', 12),
    f('letter_title', 'موضوع الخطاب', 'text', 36, { required: true }),
  ];
  if (profile === 'employee_notice') return [
    f('notice_subject', 'موضوع الإشعار', 'text', 32, { required: true }),
    f('response_due_date', 'آخر موعد للرد', 'date', 12),
  ];
  if (profile === 'project_request') return [
    f('request_type', 'نوع الطلب', 'text', 20),
    f('required_date', 'التاريخ المطلوب', 'date', 12),
    f('priority', 'الأولوية', 'select', 10, { options: ['عادية', 'عاجلة', 'حرجة'] }),
  ];
  return [
    f('subject', 'الموضوع', 'text', 32, { required: true }),
    f('effective_date', 'تاريخ السريان', 'date', 12),
  ];
}

function tableFor(profile) {
  if (profile === 'meeting_record') return {
    id: 'actions', kind: 'table', style: 'strict', title: 'القرارات والإجراءات', columns: [
      f('action', 'القرار / الإجراء', 'text', 22, { required: true }),
      f('owner', 'المسؤول', 'text', 10),
      f('due_date', 'الاستحقاق', 'date', 8),
      f('status', 'الحالة', 'text', 8),
    ],
  };
  if (profile === 'finance_request') return {
    id: 'financial_lines', kind: 'table', style: 'strict', title: 'تفصيل المبالغ', columns: [
      f('description', 'البيان', 'text', 25, { required: true }),
      f('quantity', 'الكمية', 'number', 7),
      f('unit_price', 'سعر الوحدة', 'money', 8),
      f('line_total', 'الإجمالي', 'money', 8),
    ],
  };
  if (profile === 'asset_record' || profile === 'checklist') return {
    id: 'checklist_lines', kind: 'table', style: 'strict', title: 'قائمة البنود', columns: [
      f('item', 'البند', 'text', 23, { required: true }),
      f('reference', 'الرقم / المرجع', 'text', 9),
      f('status', 'الحالة', 'select', 8, { options: ['مكتمل', 'غير مكتمل', 'لا ينطبق'] }),
      f('notes', 'ملاحظات', 'text', 8),
    ],
  };
  if (profile === 'project_record') return {
    id: 'record_lines', kind: 'table', style: 'strict', title: 'سجل البنود', columns: [
      f('description', 'البيان / العمل', 'text', 24, { required: true }),
      f('quantity', 'الكمية', 'number', 7),
      f('unit', 'الوحدة', 'text', 6),
      f('status', 'الحالة', 'text', 11),
    ],
  };
  return null;
}

export function buildCatalogLayout(profile, relations = PROFILE_RELATIONS[profile] || ['general']) {
  const sections = [{
    id: 'basic_data', kind: 'cards', style: 'info', title: 'البيانات الأساسية',
    fields: [...baseFields(relations), ...profileFields(profile)],
  }];
  const table = tableFor(profile);
  if (table) sections.push(table);
  sections.push(
    { id: 'details', kind: 'text', style: 'strict', title: 'التفاصيل والمبررات', key: 'details' },
    { id: 'signatures', kind: 'signatures', style: 'strict', title: 'الاعتمادات', roles: ['مُعدّ النموذج', 'المراجع', 'صاحب الصلاحية'] },
  );
  return { schemaVersion: 3, constitutionVersion: CATALOG_VERSION, gridColumns: 48, profile, sections };
}

export const DOCUMENT_CATALOG = Object.freeze(GROUPS.flatMap(([category, entries], groupIndex) => {
  const meta = DOCUMENT_CATEGORY_META[category];
  return entries.map(([slug, nameAr, profile], itemIndex) => {
    const relationScope = PROFILE_RELATIONS[profile] || ['general'];
    return Object.freeze({
      code: `CAT_${category.toUpperCase()}_${slug}`,
      nameAr,
      category,
      prefix: meta.prefix,
      profile,
      relationScope,
      descriptionAr: `نموذج ${nameAr} وفق دورة المسودة والمراجعة والاعتماد والأرشفة.`,
      keywords: [meta.label, nameAr, ...relationScope.map((x) => DOCUMENT_RELATION_META[x])],
      catalogOrder: (groupIndex + 1) * 100 + itemIndex + 1,
      constitutionVersion: CATALOG_VERSION,
      layout: buildCatalogLayout(profile, relationScope),
    });
  });
}));

export const DOCUMENT_CATALOG_VERSION = CATALOG_VERSION;

export function categoryLabel(category) {
  return DOCUMENT_CATEGORY_META[category]?.label || category || 'غير مصنف';
}

export function relationLabels(scope = []) {
  return (scope || []).map((key) => DOCUMENT_RELATION_META[key] || key);
}
