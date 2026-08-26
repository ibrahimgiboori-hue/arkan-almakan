export const PRINT_GOVERNANCE_VERSION = '1.18';

export const PRINT_STATUS = Object.freeze({
  LEGACY: 'legacy',
  MIGRATING: 'migrating',
  GOVERNED: 'governed',
});

export const PRINT_BALANCE_POLICY = Object.freeze({
  minDensity:84,
  maxDensity:112,
  targetFillRatio:0.68,
  maxOffsetMm:18,
  offsetShare:0.28,
});

export const PRINT_FAMILY_LAYOUTS = Object.freeze({
  'projects-finance': Object.freeze({ sideMm: 19 }),
  hr: Object.freeze({ sideMm: 19 }),
  commercial: Object.freeze({ sideMm: 19 }),
  governance: Object.freeze({ sideMm: 19 }),
  'general-documents': Object.freeze({ sideMm: 19 }),
  'site-operations': Object.freeze({ sideMm: 19 }),
});

export const PRINT_DOCUMENTS = Object.freeze({
  leave_request: {
    label: 'طلب إجازة', family: 'hr', status: PRINT_STATUS.GOVERNED,
    routes: ['/print/leave/[id]'], governedVersion: '1.10',
    note: 'خاضع للمحرك المركزي وشبكة الصفحة الأم والموازنة تحافظ على العرض الفيزيائي الكامل بين الهامشين في المعاينة والطباعة.',
  },
  claim_documents: {
    label: 'دورة المستخلص', family: 'projects-finance', status: PRINT_STATUS.MIGRATING,
    routes: ['/print/claims/[id]', '/print/claim/[id]', '/print/invoice-request/[id]'], governedVersion: null,
    note: 'مربوط بمحرك الدستور وبطبقة projects-finance المركزية ومحرك الإجراءات وشبكة الصفحة الأم والموازنة العامة 1.14، مع محاور رأسية مشتركة بين معلومات المستخلص والتمتير وبيانات السداد، وتوزيع دلالي آمن عند تغير عدد الأعمدة. بانتظار اجتياز المراجعة البصرية للحالات الأربع قبل Governed.',
  },
  quotation: {
    label: 'عرض السعر / جدول الكميات', family: 'commercial', status: PRINT_STATUS.MIGRATING,
    routes: ['/print/quote/[id]'], governedVersion: null,
    note: 'مرتبط بإطار الصفحات المتعددة الدستوري ومحرك تقسيم ذري: لا يتجزأ بند أو سطر بين صفحتين، ويتكرر رأس الجدول مرة واحدة، ويبقى عنوان المجموعة مع أول بند متى أمكن. بانتظار مراجعة حالات جدول الكميات والختم والتوقيع قبل Governed.',
  },
  employee_report: {
    label: 'تقرير الموظفين', family: 'hr', status: PRINT_STATUS.MIGRATING,
    routes: ['/print/employees'], governedVersion: null,
    note: 'مرتبط بإطار الصفحات المتعددة الدستوري والهوية المركزية، مع تقسيم الصفوف حسب القياس الفعلي.',
  },
  timesheet_report: {
    label: 'تقارير التايم شيت ونموذج الحضور الورقي', family: 'site-operations', status: PRINT_STATUS.MIGRATING,
    routes: ['/print/timesheet'], governedVersion: null,
    layout: Object.freeze({
      pagination: Object.freeze({
        matrix: Object.freeze({ first: 13, regular: 16 }),
        detail: Object.freeze({ regular: 22 }),
        paper: Object.freeze({ regular: 18 }),
        summary: Object.freeze({ regular: 22, final: 13 }),
      }),
    }),
    note: 'مرتبط بإطار الصفحات الدستوري والهوية المركزية. التقرير الخارجي يخفي الأجور، ويميّز الغياب المسجل عن غير المسجل، ويعامل صف العامل كوحدة ذرية لا تنقسم بين صفحتين. سعات صفوف صفحات الحضور والتفصيل والنموذج الورقي والملخص معرفة هنا كمصدر حقيقة واحد؛ الصفحة الأولى للحضور أقل سعة بسبب رأس الهوية الكامل، وآخر صفحة للملخص أقل سعة بسبب كتلة الإجماليات والدليل.',
  },
  expense_report: {
    label: 'تقرير مصروفات المشروع',
    family: 'site-operations',
    status: PRINT_STATUS.MIGRATING,
    routes: ['/print/expenses'],
    governedVersion: null,
    layout: Object.freeze({
      pagination: Object.freeze({ first: 13, regular: 18 }),
    }),
    note: 'تقرير فترة للمصروفات التشغيلية المحفوظة في قاعدة البيانات. الحدود first/regular أصبحت من نفس محرك pagination المشترك بدل منطق محلي. ما زال التقرير MIGRATING لأن صفوفه ليست ثابتة الارتفاع، خصوصًا نص الدافع عند الدفع من الحساب الشخصي؛ لذلك عدّ الصفوف وحده لا يضمن منع القص ويجب نقله لاحقًا إلى قياس فعلي للارتفاع قبل اعتباره Governed.',
  },
  timesheet_blank: {
    label: 'نموذج حضور عمال مقاول — فارغ', family: 'site-operations', status: PRINT_STATUS.GOVERNED,
    routes: ['/print/timesheet/blank'], governedVersion: '1.16',
    note: 'نموذج عام مستقل عن المشروع والمقاول، مخصص للطباعة والنسخ الورقي وإعادة الاستخدام، ولا يحمل بيانات تشغيلية مسبقة.',
  },
  board_report: {
    label: 'مجلس الإدارة والملاك', family: 'governance', status: PRINT_STATUS.MIGRATING,
    routes: ['/print/board'], governedVersion: null,
    note: 'مرتبط بإطار الدستور وشبكة الصفوف المستقلة؛ بانتظار المراجعة البصرية قبل Governed.',
  },
  generic_document: {
    label: 'محرك المستندات العام', family: 'general-documents', status: PRINT_STATUS.MIGRATING,
    routes: ['/print/[id]'], governedVersion: null,
    note: 'دخل محرك الصفحة والهوية والموازنة المركزية، وأضيف كتالوج 120 قالبًا ببيانات 48 وحدة وربط دلالي بالموظف والمشروع والطرف، مع منع تجزئة صف الجدول وتكرار رأسه عند انتقال الصفحة. تبقى المراجعة البصرية للقوالب الطويلة قبل Governed.',
  },
  recruitment_offer_public: {
    label: 'العرض الوظيفي للمرشح', family: 'recruitment', status: PRINT_STATUS.LEGACY,
    routes: ['/offers/[token]'], governedVersion: null,
    note: 'شاشة تفاعلية عامة وليست نسخة طباعة دستورية؛ عند الحاجة للطباعة تنشأ لها نسخة رسمية تحت /print.',
  },
  recruitment_contract_public: {
    label: 'مسودة عقد المرشح', family: 'recruitment', status: PRINT_STATUS.LEGACY,
    routes: ['/contracts/[token]'], governedVersion: null,
    note: 'شاشة تفاعلية عامة وليست نسخة طباعة دستورية؛ عند الحاجة للطباعة تنشأ لها نسخة رسمية تحت /print.',
  },
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
    ...(PRINT_FAMILY_LAYOUTS[definition.family] || {}),
    ...(definition.layout || {}),
  };
}

function positiveRowCap(value, name) {
  const cap = Number(value);
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError(`${name} must be a positive integer`);
  return cap;
}

// Central row-count paginator for print tables whose rows have a fixed/known height.
// Document-specific capacities belong only in PRINT_DOCUMENTS.layout.pagination.
// Variable-height content must use measured-height pagination instead of guessing caps.
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
    for (let index = 0; index < rows.length; index += regular) pages.push(rows.slice(index, index + regular));
    return pages;
  }

  if (hasFirst && hasFinal && rows.length <= Math.min(first, final)) return [rows];
  if (hasFirst && !hasFinal && rows.length <= first) return [rows];
  if (!hasFirst && hasFinal && rows.length <= final) return [rows];

  const pages = [];
  let index = 0;

  if (hasFirst) {
    const take = Math.min(first, hasFinal ? rows.length - 1 : rows.length);
    pages.push(rows.slice(0, take));
    index = take;
  }

  let remaining = rows.length - index;
  if (hasFinal) {
    while (remaining > final) {
      const take = Math.min(regular, remaining - final);
      pages.push(rows.slice(index, index + take));
      index += take;
      remaining -= take;
    }
    if (remaining > 0) pages.push(rows.slice(index));
  } else {
    for (; index < rows.length; index += regular) pages.push(rows.slice(index, index + regular));
  }

  return pages.length ? pages : [[]];
}

export function printGovernanceClassName(documentKey, extra = '') {
  const definition = getPrintDefinition(documentKey);
  return ['print-constitution',`print-family-${definition.family}`,`print-doc-${documentKey}`,`print-status-${definition.status}`,definition.status === PRINT_STATUS.GOVERNED ? 'print-governed' : '',extra].filter(Boolean).join(' ');
}

function routeRegex(route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\[[^/]+?\\\]/g, '[^/]+')}/?$`);
}

export function resolvePrintDocument(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  for (const [key, definition] of Object.entries(PRINT_DOCUMENTS)) {
    if ((definition.routes || []).some((route) => routeRegex(route).test(path))) return { key, ...definition };
  }
  return null;
}

export function isGovernedPrint(documentKey) { return getPrintDefinition(documentKey).status === PRINT_STATUS.GOVERNED; }
export function governedPrints() { return Object.entries(PRINT_DOCUMENTS).filter(([, definition]) => definition.status === PRINT_STATUS.GOVERNED).map(([key, definition]) => ({ key, ...definition })); }
