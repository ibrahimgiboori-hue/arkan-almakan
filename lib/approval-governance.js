// دستور الأطراف والاعتمادات — مصدر واحد لقواعد هوية أطراف المستند.
// الصفحات تجمع البيانات فقط؛ من يظهر وكيف يُسمّى وما الأسطر المطلوبة يُحسم هنا.

export const CLIENT_KIND = Object.freeze({
  ENTITY: 'entity',
  INDIVIDUAL: 'individual',
});

export function normalizeClientKind(value) {
  return value === CLIENT_KIND.INDIVIDUAL ? CLIENT_KIND.INDIVIDUAL : CLIENT_KIND.ENTITY;
}

export function isEntityClient(record) {
  return normalizeClientKind(record?.client_kind) === CLIENT_KIND.ENTITY;
}

export function employeeApprovalTitle(employee) {
  if (!employee) return '';
  const boardRole = String(employee.board_role || '').trim();
  const jobTitle = String(employee.job_title || '').trim();
  if (employee.person_kind === 'board') return [boardRole, jobTitle].filter(Boolean).join(' و ');
  return jobTitle || boardRole;
}

// عند اختيار موظف نحفظ لقطة الاسم والصفة داخل المستند مع إبقاء employee_id
// كمرجع للمصدر. بذلك لا يتغير مستند قديم إذا تغير المسمى الوظيفي لاحقاً.
export function employeeSignatoryPatch(employee) {
  if (!employee?.id) {
    return {
      arkan_signatory_employee_id: null,
      arkan_signatory_name: null,
      arkan_signatory_title: null,
    };
  }
  return {
    arkan_signatory_employee_id: employee.id,
    arkan_signatory_name: String(employee.full_name_ar || '').trim() || null,
    arkan_signatory_title: employeeApprovalTitle(employee) || null,
  };
}

export function manualSignatoryPatch(name, title = '') {
  return {
    arkan_signatory_employee_id: null,
    arkan_signatory_name: String(name || '').trim() || null,
    arkan_signatory_title: String(title || '').trim() || null,
  };
}

export function buildQuotationApprovalParties(quotation, tr = (ar) => ar) {
  const q = quotation || {};
  const entityClient = isEntityClient(q);
  const clientFields = [
    { label: tr('الاسم', 'Name'), value: q.client_name || '' },
  ];

  if (entityClient) {
    clientFields.push(
      { label: tr('يمثله', 'Represented by'), value: q.client_representative_name || '' },
      { label: tr('المنصب / الصفة', 'Position / Capacity'), value: q.client_representative_title || '' },
    );
  }

  clientFields.push(
    { label: tr('التوقيع', 'Signature') },
    { label: tr('التاريخ', 'Date') },
  );

  const arkanFields = [
    { label: tr('المفوض بالتوقيع', 'Authorized Signatory'), value: q.arkan_signatory_name || '' },
  ];
  if (String(q.arkan_signatory_title || '').trim()) {
    arkanFields.push({ label: tr('المنصب / الصفة', 'Position / Capacity'), value: q.arkan_signatory_title });
  }
  arkanFields.push(
    { label: tr('التوقيع', 'Signature') },
    { label: tr('التاريخ', 'Date') },
  );

  return [
    {
      role: 'client',
      title: tr('اعتماد العميل', 'Client Approval'),
      fields: clientFields,
      stampLabel: entityClient ? tr('ختم الشركة', 'Company Stamp') : null,
    },
    {
      role: 'arkan',
      title: tr('اعتماد أركان المكان للمقاولات', 'Arkan Al Makan Approval'),
      fields: arkanFields,
      stampLabel: tr('ختم الشركة', 'Company Stamp'),
    },
  ];
}
