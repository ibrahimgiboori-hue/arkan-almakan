export const PRINT_FAMILY_ROUTE_GOVERNANCE = Object.freeze({
  quotations:Object.freeze({
    familyId:'quotations',
    label:'عروض الأسعار',
    canonicalPrintPath:'/print/quote/[id]',
    workbenchPath:'/dashboard/quotes/[id]/workbook-print',
    renderer:'excel_workbook_family',
    legacyCaptainKey:'quotation',
  }),
  treasury_vouchers:Object.freeze({
    familyId:'treasury_vouchers',
    label:'السندات المالية',
    canonicalPrintPath:'/print/treasury-voucher/[id]',
    workbenchPath:null,
    renderer:'excel_workbook_family',
    legacyCaptainKey:'treasury_voucher',
  }),
});

export function getPrintFamilyGovernance(familyId) {
  return PRINT_FAMILY_ROUTE_GOVERNANCE[familyId] || null;
}

export function canonicalPrintHref(familyId, id) {
  const record = getPrintFamilyGovernance(familyId);
  if (!record || !id) return '';
  return record.canonicalPrintPath.replace('[id]', encodeURIComponent(String(id)));
}

export function isWorkbookFamilyGoverned(familyId) {
  return getPrintFamilyGovernance(familyId)?.renderer === 'excel_workbook_family';
}

export function routeGovernanceLabel(familyId) {
  const record = getPrintFamilyGovernance(familyId);
  return record ? `${record.label} — ${record.canonicalPrintPath}` : 'عائلة طباعة غير مسجلة';
}
