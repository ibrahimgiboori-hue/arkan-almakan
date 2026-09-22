import { PRINT_FAMILY_SYSTEM_SHEETS } from './excel-print-family-contract.mjs';

export const PRINT_FAMILY_MIGRATION_ORDER = Object.freeze([
  'quotations',
  'treasury_vouchers',
  'hr',
  'projects_finance',
  'attendance',
  'approvals_reports',
  'general_documents',
]);

export const PRINT_FAMILIES = Object.freeze({
  quotations: Object.freeze({
    labelAr: 'عروض الأسعار',
    migrationStage: 'building',
    workbook: 'public/print-families/quotations.xlsx',
    models: Object.freeze([
      'عرض سعر كميات - بضريبة',
      'عرض سعر كميات - بدون ضريبة',
      'عرض سعر مقطوعية - بضريبة',
      'عرض سعر مقطوعية - بدون ضريبة',
    ]),
    routes: Object.freeze(['app/print/quote/[id]']),
  }),
  treasury_vouchers: Object.freeze({
    labelAr: 'السندات المالية',
    migrationStage: 'queued',
    workbook: 'public/print-families/treasury_vouchers.xlsx',
    models: Object.freeze(['سند صرف', 'سند قبض']),
    routes: Object.freeze(['app/print/treasury-voucher/[id]']),
  }),
  hr: Object.freeze({
    labelAr: 'الموارد البشرية',
    migrationStage: 'queued',
    workbook: 'public/print-families/hr.xlsx',
    models: Object.freeze(['كشف الموظفين', 'مسير رواتب', 'مسير رواتب خارجي', 'قسيمة راتب', 'طلب إجازة']),
    routes: Object.freeze([
      'app/print/employees',
      'app/print/payroll/[id]',
      'app/print/external-payroll/[batchId]',
      'app/print/external-payroll/[batchId]/payslip/[lineId]',
      'app/print/leave/[id]',
    ]),
  }),
  projects_finance: Object.freeze({
    labelAr: 'المشاريع والمالية',
    migrationStage: 'queued',
    workbook: 'public/print-families/projects_finance.xlsx',
    models: Object.freeze(['مستخلص', 'تقرير مصروفات', 'ميزانية تشغيلية', 'طلب فاتورة']),
    routes: Object.freeze([
      'app/print/claim/[id]',
      'app/print/claims/[id]',
      'app/print/expenses',
      'app/print/operating-budget',
      'app/print/invoice-request/[id]',
    ]),
  }),
  attendance: Object.freeze({
    labelAr: 'الحضور والتايم شيت',
    migrationStage: 'queued',
    workbook: 'public/print-families/attendance.xlsx',
    models: Object.freeze(['كشف حضور', 'كشف حضور مقاول', 'نموذج حضور فارغ']),
    routes: Object.freeze([
      'app/print/timesheet',
      'app/print/timesheet/blank',
      'app/print/contractor-timesheet/[id]',
    ]),
  }),
  approvals_reports: Object.freeze({
    labelAr: 'الاعتمادات والتقارير',
    migrationStage: 'queued',
    workbook: 'public/print-families/approvals_reports.xlsx',
    models: Object.freeze(['سجل اعتماد', 'تقرير مجلس']),
    routes: Object.freeze(['app/print/approval/[id]', 'app/print/board']),
  }),
  general_documents: Object.freeze({
    labelAr: 'المستندات العامة',
    migrationStage: 'queued',
    workbook: 'public/print-families/general_documents.xlsx',
    models: Object.freeze(['مستند عام', 'خطاب رسمي', 'محضر', 'إقرار وتعهد', 'استلام عهدة']),
    routes: Object.freeze(['app/print/[id]']),
  }),
});

export function getPrintFamily(id) {
  return PRINT_FAMILIES[id] || null;
}

export function findPrintFamilyByRoute(route) {
  const normalized = String(route || '').replace(/^\/+|\/+$/g, '');
  for (const [id, family] of Object.entries(PRINT_FAMILIES)) {
    if (family.routes.includes(normalized)) return { id, ...family };
  }
  return null;
}

export function validatePrintFamilyCatalog() {
  const errors = [];
  const routeOwners = new Map();

  for (const familyId of PRINT_FAMILY_MIGRATION_ORDER) {
    const family = PRINT_FAMILIES[familyId];
    if (!family) {
      errors.push(`migration order references unknown family ${familyId}`);
      continue;
    }
    if (!family.models.length) errors.push(`${familyId}: no model sheets declared`);
    if (new Set(family.models).size !== family.models.length) errors.push(`${familyId}: duplicate model sheet name`);
    if (PRINT_FAMILY_SYSTEM_SHEETS.some((name) => family.models.includes(name))) {
      errors.push(`${familyId}: system sheet declared as a model`);
    }

    for (const route of family.routes) {
      if (routeOwners.has(route)) errors.push(`${route}: owned by both ${routeOwners.get(route)} and ${familyId}`);
      routeOwners.set(route, familyId);
    }
  }

  return errors;
}
