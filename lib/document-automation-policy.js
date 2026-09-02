const SAR = new Intl.NumberFormat('ar-SA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const DATE_AR = new Intl.DateTimeFormat('ar-SA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const DOCUMENT_AUTOMATION_POLICY_VERSION = '1.0';

export const DOCUMENT_AUTOMATION_POLICY = Object.freeze({
  evidenceFirst: true,
  neverInventMissingFacts: true,
  preserveManualEdits: true,
  noUnrecordedCommitments: true,
  scopeGeneratedStatementsToRecordedData: true,
  doNotWaiveStatutoryObligations: true,
});

const n = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const text = (value) => String(value || '').trim();

function dateLabel(value) {
  if (!value) return '';
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : DATE_AR.format(d);
}

function recipientLabel(value) {
  const raw = text(value) || 'من يهمه الأمر';
  return raw.replace(/^إلى\s*\/?\s*/u, '').trim() || 'من يهمه الأمر';
}

export function salaryFacts(employee) {
  const basic = n(employee?.basic_salary);
  const housing = n(employee?.housing_allowance);
  const transport = n(employee?.transport_allowance);
  const other = n(employee?.other_allowance);
  const allowances = housing + transport + other;
  const gross = basic + allowances;
  return {
    basic,
    housing,
    transport,
    other,
    allowances,
    gross,
    hasAllowances: allowances > 0,
  };
}

export function salaryCertificateValidation(employee) {
  if (!employee) return 'اختر موظفًا أولًا.';
  if (employee.status && employee.status !== 'active') {
    return 'لا يمكن إنشاء تعريف راتب آلي لموظف غير مسجل كموظف نشط.';
  }
  const facts = salaryFacts(employee);
  if (facts.gross <= 0) {
    return 'لا يوجد راتب شهري موجب مسجل لهذا الشخص في ملف الموظف؛ يجب تصحيح بيانات الراتب أولًا قبل إصدار تعريف راتب.';
  }
  return '';
}

export function composeSalaryCertificate(employee, companyName, recipient = 'إلى من يهمه الأمر') {
  const validationError = salaryCertificateValidation(employee);
  const facts = salaryFacts(employee);
  if (validationError) return { error: validationError, facts, payload: null, body: '' };

  const company = text(companyName) || 'المنشأة';
  const employeeName = text(employee.full_name_ar);
  const employeeNo = text(employee.employee_no);
  const jobTitle = text(employee.job_title);
  const idNumber = text(employee.id_number);
  const hireDate = dateLabel(employee.hire_date);
  const destination = recipientLabel(recipient);

  const identityBits = [];
  if (jobTitle) identityBits.push(`بوظيفة ${jobTitle}`);
  if (hireDate) identityBits.push(`منذ تاريخ ${hireDate}`);

  const identitySentence = [
    `تشهد ${company} بأن ${employeeName} من منسوبي المنشأة`,
    identityBits.length ? identityBits.join(' ') : '',
  ].filter(Boolean).join(' ') + '.';

  const idSentence = idNumber
    ? `رقم الهوية/الإقامة المسجل لدى المنشأة: ${idNumber}.`
    : '';

  const salarySentence = `ووفق البيانات الوظيفية والمالية المعتمدة لدى المنشأة في تاريخ إصدار هذا التعريف، يبلغ إجمالي الراتب الشهري المسجل ${SAR.format(facts.gross)} ريال سعودي.`;

  const detailParts = [];
  if (facts.hasAllowances) {
    detailParts.push(`راتب أساسي ${SAR.format(facts.basic)} ريال`);
    if (facts.housing > 0) detailParts.push(`بدل سكن ${SAR.format(facts.housing)} ريال`);
    if (facts.transport > 0) detailParts.push(`بدل نقل ${SAR.format(facts.transport)} ريال`);
    if (facts.other > 0) detailParts.push(`بدلات أخرى ${SAR.format(facts.other)} ريال`);
  }
  const detailSentence = detailParts.length
    ? `ويتكون الراتب المسجل من: ${detailParts.join('، ')}.`
    : '';

  const scopeSentence = `وقد صدر هذا التعريف بناءً على طلب الموظف لتقديمه إلى ${destination} لإثبات البيانات الوظيفية والمالية المبينة فيه فقط. ولا يتضمن هذا التعريف ضمانًا أو كفالة أو تعهدًا ماليًا من المنشأة، ولا ينشئ بذاته أي التزام إضافي عليها خارج ما تقرره الأنظمة والعقد والسجلات المعتمدة، ولا يُستخدم لغير الغرض الذي صدر من أجله.`;

  const body = [identitySentence, idSentence, salarySentence, detailSentence, scopeSentence]
    .filter(Boolean)
    .join('\n\n');

  const payload = {
    employee_name: employeeName,
    employee_no: employeeNo,
    job_title: jobTitle,
    id_number: idNumber,
    hire_date: employee.hire_date || '',
    recipient: text(recipient) || 'إلى من يهمه الأمر',
    basic_salary: facts.hasAllowances ? facts.basic : '',
    housing: facts.housing > 0 ? facts.housing : '',
    transport: facts.transport > 0 ? facts.transport : '',
    other_allowance: facts.other > 0 ? facts.other : '',
    gross: facts.gross,
    certificate_text: body,
    _salary_basis: {
      basic: facts.basic,
      housing: facts.housing,
      transport: facts.transport,
      other: facts.other,
      allowances: facts.allowances,
      gross: facts.gross,
      source: 'employees',
      policy_version: DOCUMENT_AUTOMATION_POLICY_VERSION,
    },
  };

  return { error: '', facts, payload, body };
}
