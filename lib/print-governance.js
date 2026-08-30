export const PRINT_GOVERNANCE_VERSION = '2.1';

export const PRINT_STATUS = Object.freeze({
  LEGACY: 'legacy',
  MIGRATING: 'migrating',
  GOVERNED: 'governed',
});

export const PRINT_ORIENTATION = Object.freeze({
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
});

export const PRINT_PAGINATION_MODE = Object.freeze({
  FIXED: 'fixed',
  FLOW: 'flow',
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
  'projects-finance': Object.freeze({ sideMm:19, orientation:PRINT_ORIENTATION.PORTRAIT, paginationMode:PRINT_PAGINATION_MODE.FIXED }),
  'corporate-finance': Object.freeze({ sideMm:16, orientation:PRINT_ORIENTATION.PORTRAIT, paginationMode:PRINT_PAGINATION_MODE.FIXED }),
  hr: Object.freeze({ sideMm:19, orientation:PRINT_ORIENTATION.PORTRAIT, paginationMode:PRINT_PAGINATION_MODE.FIXED }),
  commercial: Object.freeze({ sideMm:19, orientation:PRINT_ORIENTATION.PORTRAIT, paginationMode:PRINT_PAGINATION_MODE.FIXED }),
  governance: Object.freeze({ sideMm:19, orientation:PRINT_ORIENTATION.PORTRAIT, paginationMode:PRINT_PAGINATION_MODE.FIXED }),
  'general-documents': Object.freeze({
    sideMm:19,
    topMm:47,
    bottomMm:39,
    orientation:PRINT_ORIENTATION.PORTRAIT,
    paginationMode:PRINT_PAGINATION_MODE.FLOW,
  }),
  'site-operations': Object.freeze({ sideMm:19, orientation:PRINT_ORIENTATION.PORTRAIT, paginationMode:PRINT_PAGINATION_MODE.FIXED }),
  recruitment: Object.freeze({ sideMm:19, orientation:PRINT_ORIENTATION.PORTRAIT, paginationMode:PRINT_PAGINATION_MODE.FIXED }),
});

export const PRINT_DOCUMENTS = Object.freeze({
  leave_request: {
    label:'طلب إجازة', family:'hr', status:PRINT_STATUS.GOVERNED,
    routes:['/print/leave/[id]'], governedVersion:'2.0',
  },
  payroll_run: {
    label:'مسير الرواتب', family:'hr', status:PRINT_STATUS.GOVERNED,
    routes:['/print/payroll/[id]'], governedVersion:'2.0',
    layout:Object.freeze({
      orientation:PRINT_ORIENTATION.LANDSCAPE,
      sideMm:9,
      pagination:Object.freeze({ first:14, regular:16, final:12 }),
    }),
  },
  operating_budget_report: {
    label:'تقرير ميزانية التشغيل', family:'corporate-finance', status:PRINT_STATUS.GOVERNED,
    routes:['/print/operating-budget'], governedVersion:'2.0',
    layout:Object.freeze({ sideMm:14, orientation:PRINT_ORIENTATION.PORTRAIT }),
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
    layout:Object.freeze({ pagination:Object.freeze({ first:13, regular:18 }) }),
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
    routes:['/print/[id]'], governedVersion:'2.1',
    layout:Object.freeze({ paginationMode:PRINT_PAGINATION_MODE.FLOW }),
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

export function getPrintDefinition(documentKey) {
  const definition = PRINT_DOCUMENTS[documentKey];
  if (!definition) throw new Error(`Unknown print governance key: ${documentKey}`);
  return definition;
}

export function getPrintLayoutPolicy(documentKey) {
  const definition = getPrintDefinition(documentKey);
  return {
    balance:PRINT_BALANCE_POLICY,
    orientation:PRINT_ORIENTATION.PORTRAIT,
    paginationMode:PRINT_PAGINATION_MODE.FIXED,
    ...(PRINT_FAMILY_LAYOUTS[definition.family] || {}),
    ...(definition.layout || {}),
  };
}

export function getPrintOrientation(documentKey) {
  return getPrintLayoutPolicy(documentKey).orientation || PRINT_ORIENTATION.PORTRAIT;
}

export function isFlowPrint(documentKey) {
  return getPrintLayoutPolicy(documentKey).paginationMode === PRINT_PAGINATION_MODE.FLOW;
}

function positiveRowCap(value, name) {
  const cap = Number(value);
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError(`${name} must be a positive integer`);
  return cap;
}

/* Fixed-height row pagination is centralized here. Variable-height content uses Captain flow pagination. */
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

export function printGovernanceClassName(documentKey, extra='') {
  const definition=getPrintDefinition(documentKey);
  const layout=getPrintLayoutPolicy(documentKey);
  const orientation=layout.orientation || PRINT_ORIENTATION.PORTRAIT;
  return [
    'print-constitution',
    `print-family-${definition.family}`,
    `print-doc-${documentKey}`,
    `print-status-${definition.status}`,
    `print-orientation-${orientation}`,
    `print-pagination-${layout.paginationMode || PRINT_PAGINATION_MODE.FIXED}`,
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
