export const PRINT_GOVERNANCE_VERSION = '1.3';

export const PRINT_STATUS = Object.freeze({
  LEGACY: 'legacy',
  MIGRATING: 'migrating',
  GOVERNED: 'governed',
});

export const PRINT_DOCUMENTS = Object.freeze({
  leave_request: {
    label: 'طلب إجازة',
    family: 'hr',
    status: PRINT_STATUS.GOVERNED,
    routes: ['/print/leave/[id]'],
    governedVersion: '1.3',
    note: 'خاضع للدستور: PrintFrame وشبكة Excel وإجراءات إلكترونية/يدوية مركزية، مع قاعدة التاريخ والتوقيع اليدوي الموحدة.',
  },
  claim_documents: {
    label: 'دورة المستخلص',
    family: 'projects-finance',
    status: PRINT_STATUS.MIGRATING,
    routes: ['/print/claims/[id]', '/print/claim/[id]', '/print/invoice-request/[id]'],
    governedVersion: null,
    note: 'محرك موحد لأربعة مستندات ويستخدم PrintFrame، لكنه ما زال يعتمد CSS محلياً يجب تقليصه إلى فروق العائلة فقط.',
  },
  quotation: {
    label: 'عرض السعر / جدول الكميات',
    family: 'commercial',
    status: PRINT_STATUS.LEGACY,
    routes: ['/print/quote/[id]'],
    governedVersion: null,
    note: 'محرك صفحة وتقسيم وCSS مستقل؛ يحتاج النقل إلى طبقة الدستور مع الحفاظ على خصائص التقسيم والسحب.',
  },
  employee_report: {
    label: 'تقرير الموظفين',
    family: 'hr',
    status: PRINT_STATUS.LEGACY,
    routes: ['/print/employees'],
    governedVersion: null,
    note: 'يبني A4 والترويسة والتذييل محلياً ويستخدم CSS مستقل.',
  },
  board_report: {
    label: 'مجلس الإدارة والملاك',
    family: 'governance',
    status: PRINT_STATUS.LEGACY,
    routes: ['/print/board'],
    governedVersion: null,
    note: 'يبني الصفحة والأصول محلياً ويشارك CSS تقرير الموظفين بدل محرك الدستور.',
  },
  generic_document: {
    label: 'محرك المستندات العام',
    family: 'general-documents',
    status: PRINT_STATUS.LEGACY,
    routes: ['/print/[id]'],
    governedVersion: null,
    note: 'محرك قوالب واسع بصفحة وCSS مستقلين؛ سيحوّل على دفعات حسب عائلات القوالب.',
  },
  recruitment_offer_public: {
    label: 'العرض الوظيفي للمرشح',
    family: 'recruitment',
    status: PRINT_STATUS.LEGACY,
    routes: ['/offers/[token]'],
    governedVersion: null,
    note: 'شاشة تفاعلية عامة وليست نسخة طباعة دستورية؛ عند الحاجة للطباعة تنشأ لها نسخة رسمية تحت /print.',
  },
  recruitment_contract_public: {
    label: 'مسودة عقد المرشح',
    family: 'recruitment',
    status: PRINT_STATUS.LEGACY,
    routes: ['/contracts/[token]'],
    governedVersion: null,
    note: 'شاشة تفاعلية عامة وليست نسخة طباعة دستورية؛ عند الحاجة للطباعة تنشأ لها نسخة رسمية تحت /print.',
  },
});

export function getPrintDefinition(documentKey) {
  const definition = PRINT_DOCUMENTS[documentKey];
  if (!definition) throw new Error(`Unknown print governance key: ${documentKey}`);
  return definition;
}

export function printGovernanceClassName(documentKey, extra = '') {
  const definition = getPrintDefinition(documentKey);
  return [
    'print-constitution',
    `print-family-${definition.family}`,
    `print-doc-${documentKey}`,
    `print-status-${definition.status}`,
    definition.status === PRINT_STATUS.GOVERNED ? 'print-governed' : '',
    extra,
  ].filter(Boolean).join(' ');
}

function routeRegex(route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\[[^/]+?\\\]/g, '[^/]+')}/?$`);
}

export function resolvePrintDocument(pathname = '') {
  const path = String(pathname || '').split('?')[0];
  for (const [key, definition] of Object.entries(PRINT_DOCUMENTS)) {
    if ((definition.routes || []).some((route) => routeRegex(route).test(path))) {
      return { key, ...definition };
    }
  }
  return null;
}

export function isGovernedPrint(documentKey) {
  return getPrintDefinition(documentKey).status === PRINT_STATUS.GOVERNED;
}

export function governedPrints() {
  return Object.entries(PRINT_DOCUMENTS)
    .filter(([, definition]) => definition.status === PRINT_STATUS.GOVERNED)
    .map(([key, definition]) => ({ key, ...definition }));
}
