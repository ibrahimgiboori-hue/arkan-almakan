export const PRINT_GOVERNANCE_VERSION = '3.1';

export const PRINT_STATUS = Object.freeze({
  LEGACY: 'legacy',
  MIGRATING: 'migrating',
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
  recruitment: Object.freeze({ orientation:PRINT_ORIENTATION.PORTRAIT }),
});

export const PRINT_DOCUMENTS = Object.freeze({
  leave_request: {
    label:'طلب إجازة', family:'hr', status:PRINT_STATUS.GOVERNED,
    routes:['/print/leave/[id]'], governedVersion:'3.1',
  },
  payroll_run: {
    label:'مسير الرواتب', family:'hr', status:PRINT_STATUS.GOVERNED,
    routes:['/print/payroll/[id]'], governedVersion:'3.1',
    layout:Object.freeze({ orientation:PRINT_ORIENTATION.LANDSCAPE }),
  },
  operating_budget_report: {
    label:'تقرير ميزانية التشغيل', family:'corporate-finance', status:PRINT_STATUS.GOVERNED,
    routes:['/print/operating-budget'], governedVersion:'3.1',
    layout:Object.freeze({
      orientation:PRINT_ORIENTATION.PORTRAIT,
      letterheadSource:PRINT_LETTERHEAD_SOURCE.DIGITAL,
    }),
  },
  claim_documents: {
    label:'دورة المستخلص', family:'projects-finance', status:PRINT_STATUS.MIGRATING,
    routes:['/print/claims/[id]','/print/claim/[id]','/print/invoice-request/[id]'], governedVersion:null,
  },
  quotation: {
    label:'عرض السعر / جدول الكميات', family:'commercial', status:PRINT_STATUS.MIGRATING,
    routes:['/print/quote/[id]'], governedVersion:null,
  },
  employee_report: {
    label:'تقرير الموظفين', family:'hr', status:PRINT_STATUS.MIGRATING,
    routes:['/print/employees'], governedVersion:null,
  },
  timesheet_report: {
    label:'تقارير التايم شيت ونموذج الحضور الورقي', family:'site-operations', status:PRINT_STATUS.MIGRATING,
    routes:['/print/timesheet'], governedVersion:null,
    layout:Object.freeze({
      pagination:Object.freeze({
        matrix:Object.freeze({ first:13, regular:16 }),
        detail:Object.freeze({ regular:22 }),
        paper:Object.freeze({ regular:18 }),
        summary:Object.freeze({ regular:22, final:13 }),
      }),
    }),
  },
  expense_report: {
    label:'تقرير مصروفات المشروع', family:'site-operations', status:PRINT_STATUS.MIGRATING,
    routes:['/print/expenses'], governedVersion:null,
  },
  timesheet_blank: {
    label:'نموذج حضور عمال مقاول — فارغ', family:'site-operations', status:PRINT_STATUS.GOVERNED,
    routes:['/print/timesheet/blank'], governedVersion:'2.0',
  },
  board_report: {
    label:'مجلس الإدارة والملاك', family:'governance', status:PRINT_STATUS.MIGRATING,
    routes:['/print/board'], governedVersion:null,
  },
  generic_document: {
    label:'محرك المستندات العام', family:'general-documents', status:PRINT_STATUS.MIGRATING,
    routes:['/print/[id]'], governedVersion:null,
  },
  recruitment_offer_public: {
    label:'العرض الوظيفي للمرشح', family:'recruitment', status:PRINT_STATUS.LEGACY,
    routes:['/offers/[token]'], governedVersion:null,
  },
  recruitment_contract_public: {
    label:'مسودة عقد المرشح', family:'recruitment', status:PRINT_STATUS.LEGACY,
    routes:['/contracts/[token]'], governedVersion:null,
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

function positiveRowCap(value, name) {
  const cap = Number(value);
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError(`${name} must be a positive integer`);
  return cap;
}

/*
 * مرحلة هجرة واحدة متبقية: التايم شيت يملك بعدًا أفقيًا (مجموعات أيام) بجانب التقسيم الرأسي.
 * يبقى هذا المساعد فقط حتى إحلال ذلك التقرير ثم يُحذف هو وإعداداته في نفس التغيير.
 */
export function paginateRows(items, caps = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return [[]];

  const regular = positiveRowCap(caps.regular, 'pagination.regular');
  const hasFirst = caps.first != null;
  const hasFinal = caps.final != null;
  const first = hasFirst ? positiveRowCap(caps.first, 'pagination.first') : regular;
  const final = hasFinal ? positiveRowCap(caps.final, 'pagination.final') : regular;

  if (!hasFirst && !hasFinal) {
    const pages = [];
    for (let index=0; index<rows.length; index+=regular) pages.push(rows.slice(index,index+regular));
    return pages;
  }
  if (hasFirst && hasFinal && rows.length <= Math.min(first,final)) return [rows];
  if (hasFirst && !hasFinal && rows.length <= first) return [rows];
  if (!hasFirst && hasFinal && rows.length <= final) return [rows];

  const pages=[];
  let index=0;
  if (hasFirst) {
    const take=Math.min(first,hasFinal ? rows.length-1 : rows.length);
    pages.push(rows.slice(0,take));
    index=take;
  }
  let remaining=rows.length-index;
  if (hasFinal) {
    while (remaining>final) {
      const take=Math.min(regular,remaining-final);
      pages.push(rows.slice(index,index+take));
      index+=take;
      remaining-=take;
    }
    if (remaining>0) pages.push(rows.slice(index));
  } else {
    for (; index<rows.length; index+=regular) pages.push(rows.slice(index,index+regular));
  }
  return pages.length ? pages : [[]];
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
    definition.status===PRINT_STATUS.GOVERNED ? 'print-governed' : '',
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
  return getPrintDefinition(documentKey).status===PRINT_STATUS.GOVERNED;
}

export function governedPrints() {
  return Object.entries(PRINT_DOCUMENTS)
    .filter(([,definition])=>definition.status===PRINT_STATUS.GOVERNED)
    .map(([key,definition])=>({ key,...definition }));
}
