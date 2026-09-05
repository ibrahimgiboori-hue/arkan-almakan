export const PRINT_GOVERNANCE_VERSION = '3.2';

export const PRINT_STATUS = Object.freeze({
  GOVERNED: 'governed',
});

export const PRINT_ORIENTATION = Object.freeze({
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
});

// اتجاه الورقة ومصدر الليترهيد قراران مستقلان تمامًا.
// preprinted يعني: لا نرسم الهوية رقميًا، لكن نحجز مناطقها الفيزيائية على الورق الحقيقي.
export const PRINT_LETTERHEAD_SOURCE = Object.freeze({
  DIGITAL: 'digital',
  PREPRINTED: 'preprinted',
  NONE: 'none',
});

export const PRINT_PAPER_ROTATION = Object.freeze({
  CLOCKWISE: 'clockwise',
  COUNTERCLOCKWISE: 'counterclockwise',
});

// مرجع القبطان الفيزيائي هو ورقة Word الطبيعية، لا شاشة المتصفح.
// كل قرار نهائي للصفحة يحسب بالمليمتر؛ px مجرد حساس لقياس DOM بعد الرسم.
export const PRINT_WORD_STANDARD = Object.freeze({
  id:'word-standard-a4-v1',
  portraitWidthMm:210,
  portraitHeightMm:297,
  landscapeWidthMm:297,
  landscapeHeightMm:210,
  bodyMarginMm:25.4,
  headerFromEdgeMm:12.7,
  footerFromEdgeMm:12.7,
});

// قياس فعلي من ملف A4 المرفوع «Arkan Al Makan - LetterHead (2).pdf».
// العلامة المائية ليست منطقة حظر؛ الحجز الفيزيائي يخص الرسم العلوي والسفلي فقط.
export const ARKAN_LETTERHEAD_PROFILE = Object.freeze({
  id:'arkan-letterhead-a4-measured-2026-v1',
  portraitTopArtworkMm:34.23,
  portraitBottomArtworkMm:19.13,
  watermarkBlocksContent:false,
});

// لغة الفصل غير المرئية للقبطان. الحدود لا ترسم شيئًا للمستخدم؛ هي فقط نقاط قرار للكود.
export const PRINT_FLOW_BOUNDARY = Object.freeze({
  ALLOW: 'allow',
  KEEP_WITH_NEXT: 'keep-with-next',
  FORCE_PAGE: 'force-page',
});

export const PRINT_FLOW_KIND = Object.freeze({
  BLOCK: 'block',
  REPEATABLE_TABLE: 'repeatable-table',
});

// لا يوجد قبطان ثانٍ للنص. ConstitutionPagedFrame نفسه ينزل من مستوى الكتلة
// إلى line boxes الحقيقية التي رسمها المتصفح عندما يحتاج صف جدول للانقسام.
export const PRINT_LINE_FLOW_POLICY = Object.freeze({
  id:'visual-line-seams-v1',
  owner:'ConstitutionPagedFrame',
  measurementUnit:'visual-line-box',
  geometryUnit:'mm',
  browserSensorUnit:'px',
  invisibleToReader:true,
  splitOnlyAfterCompletedLine:true,
  avoidSingleLineWidowWhenPossible:true,
  appliesTo:'repeatable-table-cell-text',
});

export const PRINT_BALANCE_POLICY = Object.freeze({
  minDensity:84,
  maxDensity:112,
  targetFillRatio:0.68,
  maxOffsetMm:18,
  offsetShare:0.28,
});

/* Physical rules live here, never inside a document page. */
export const PRINT_FAMILY_LAYOUTS = Object.freeze({
  'projects-finance': Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
  'corporate-finance': Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
  hr: Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
  commercial: Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
  governance: Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
  'general-documents': Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
  'site-operations': Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
});

// هذا السجل يحتوي فقط مسارات /print الحقيقية. صفحات المرشح التفاعلية ليست مطبوعات
// ولا تدخل الدستور لمجرد أن المستخدم يستطيع استعمال أمر الطباعة في المتصفح.
export const PRINT_DOCUMENTS = Object.freeze({
  leave_request: {
    label:'طلب إجازة', family:'hr', status:PRINT_STATUS.GOVERNED,
    routes:['/print/leave/[id]'], governedVersion:'3.2',
  },
  payroll_run: {
    label:'مسير الرواتب', family:'hr', status:PRINT_STATUS.GOVERNED,
    routes:['/print/payroll/[id]'], governedVersion:'3.2',
    layout:Object.freeze({ orientation:PRINT_ORIENTATION.LANDSCAPE }),
  },
  operating_budget_report: {
    label:'تقرير ميزانية التشغيل', family:'corporate-finance', status:PRINT_STATUS.GOVERNED,
    routes:['/print/operating-budget'], governedVersion:'3.2',
    layout:Object.freeze({
      orientation:PRINT_ORIENTATION.PORTRAIT,
      letterheadSource:PRINT_LETTERHEAD_SOURCE.DIGITAL,
    }),
  },
  claim_documents: {
    label:'دورة المستخلص', family:'projects-finance', status:PRINT_STATUS.GOVERNED,
    routes:['/print/claims/[id]','/print/claim/[id]','/print/invoice-request/[id]'], governedVersion:'3.2',
  },
  quotation: {
    label:'عرض السعر / جدول الكميات', family:'commercial', status:PRINT_STATUS.GOVERNED,
    routes:['/print/quote/[id]'], governedVersion:'3.2',
  },
  employee_report: {
    label:'تقرير الموظفين', family:'hr', status:PRINT_STATUS.GOVERNED,
    routes:['/print/employees'], governedVersion:'3.2',
  },
  timesheet_report: {
    label:'تقارير التايم شيت ونموذج الحضور الورقي', family:'site-operations', status:PRINT_STATUS.GOVERNED,
    routes:['/print/timesheet'], governedVersion:'3.2',
  },
  expense_report: {
    label:'تقرير مصروفات المشروع', family:'site-operations', status:PRINT_STATUS.GOVERNED,
    routes:['/print/expenses'], governedVersion:'3.2',
  },
  timesheet_blank: {
    label:'نموذج حضور عمال مقاول — فارغ', family:'site-operations', status:PRINT_STATUS.GOVERNED,
    routes:['/print/timesheet/blank'], governedVersion:'3.2',
  },
  board_report: {
    label:'مجلس الإدارة والملاك', family:'governance', status:PRINT_STATUS.GOVERNED,
    routes:['/print/board'], governedVersion:'3.2',
  },
  generic_document: {
    label:'محرك المستندات العام', family:'general-documents', status:PRINT_STATUS.GOVERNED,
    routes:['/print/[id]'], governedVersion:'3.2',
  },
});

// تعريف التقرير يملك أسماء العرض وترتيب الحقول فقط. مصدر البيانات يظل مالك الحقيقة،
// والقبطان يظل مالك الهندسة الفيزيائية. تغيير label لا يغير field أو أي معادلة.
export const PRINT_REPORT_COLUMNS = Object.freeze({
  operating_budget_report:Object.freeze([
    Object.freeze({ field:'item_name', label:'البند', type:'text' }),
    Object.freeze({ field:'monthly_cost', label:'تكلفة الشهر', type:'money' }),
    Object.freeze({ field:'accumulated_cost', label:'المتراكم', type:'money' }),
    Object.freeze({ field:'cycle_amount', label:'قيمة الدفعة', type:'money' }),
    Object.freeze({ field:'due_amount_this_period', label:'استحقاق هذا الشهر', type:'money' }),
    Object.freeze({ field:'next_due_date', label:'الاستحقاق القادم', type:'date' }),
    Object.freeze({ field:'payment_status', label:'السداد', type:'status' }),
  ]),
  payroll_run:Object.freeze([
    Object.freeze({ field:'employee', label:'الموظف', type:'text' }),
    Object.freeze({ field:'basic_salary', label:'الأساسي', type:'money' }),
    Object.freeze({ field:'housing_allowance', label:'السكن', type:'money' }),
    Object.freeze({ field:'transport_allowance', label:'النقل', type:'money' }),
    Object.freeze({ field:'other_allowance', label:'بدلات أخرى', type:'money' }),
    Object.freeze({ field:'overtime_amount', label:'إضافي', type:'money' }),
    Object.freeze({ field:'commission_amount', label:'عمولة', type:'money' }),
    Object.freeze({ field:'gross_pay', label:'الإجمالي', type:'money' }),
    Object.freeze({ field:'total_deductions', label:'الخصومات', type:'money' }),
    Object.freeze({ field:'net_pay', label:'الصافي', type:'money' }),
  ]),
  expense_report:Object.freeze([
    Object.freeze({ field:'expense_date', label:'التاريخ', type:'date' }),
    Object.freeze({ field:'category', label:'التصنيف', type:'text' }),
    Object.freeze({ field:'notes', label:'البيان', type:'text' }),
    Object.freeze({ field:'project_item', label:'البند', type:'text' }),
    Object.freeze({ field:'payer', label:'جهة السداد', type:'text' }),
    Object.freeze({ field:'amount', label:'المبلغ', type:'money' }),
  ]),
});

export function getPrintDefinition(documentKey) {
  const definition = PRINT_DOCUMENTS[documentKey];
  if (!definition) throw new Error(`Unknown print governance key: ${documentKey}`);
  return definition;
}

export function getPrintLayoutPolicy(documentKey) {
  const definition = getPrintDefinition(documentKey);
  return {
    balance:PRINT_BALANCE_POLICY,
    paper:PRINT_WORD_STANDARD,
    letterheadProfile:ARKAN_LETTERHEAD_PROFILE,
    lineFlow:PRINT_LINE_FLOW_POLICY,
    orientation:PRINT_ORIENTATION.PORTRAIT,
    letterheadSource:PRINT_LETTERHEAD_SOURCE.DIGITAL,
    paperRotation:PRINT_PAPER_ROTATION.CLOCKWISE,
    ...(PRINT_FAMILY_LAYOUTS[definition.family] || {}),
    ...(definition.layout || {}),
  };
}

export function getPrintOrientation(documentKey) {
  return getPrintLayoutPolicy(documentKey).orientation || PRINT_ORIENTATION.PORTRAIT;
}

export function getPrintReportColumns(documentKey) {
  return PRINT_REPORT_COLUMNS[documentKey] || Object.freeze([]);
}

export function defaultPrintColumnLabels(documentKey) {
  return Object.fromEntries(getPrintReportColumns(documentKey).map((column)=>[column.field,column.label]));
}

export function printGovernanceClassName(documentKey, extra='', orientationOverride=null) {
  const definition=getPrintDefinition(documentKey);
  const orientation=orientationOverride || getPrintOrientation(documentKey);
  return [
    'print-constitution',
    `print-family-${definition.family}`,
    `print-doc-${documentKey}`,
    `print-status-${definition.status}`,
    `print-orientation-${orientation}`,
    'print-governed',
    extra,
  ].filter(Boolean).join(' ');
}

function routeRegex(route) {
  const escaped=route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`^${escaped.replace(/\\\[[^/]+?\\\]/g,'[^/]+')}/?$`);
}

export function resolvePrintDocument(pathname='') {
  const path=String(pathname||'').split('?')[0];
  for (const [key,definition] of Object.entries(PRINT_DOCUMENTS)) {
    if ((definition.routes||[]).some((route)=>routeRegex(route).test(path))) return { key,...definition };
  }
  return null;
}

export function isGovernedPrint(documentKey) {
  return Boolean(getPrintDefinition(documentKey));
}

export function governedPrints() {
  return Object.entries(PRINT_DOCUMENTS).map(([key,definition])=>({ key,...definition }));
}
