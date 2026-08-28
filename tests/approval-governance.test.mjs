import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_KIND,
  buildQuotationApprovalParties,
  employeeSignatoryPatch,
  isEntityClient,
} from '../lib/approval-governance.js';

test('client kind defaults to entity and individual removes entity-only approval lines', () => {
  assert.equal(isEntityClient({}), true);
  assert.equal(isEntityClient({ client_kind:CLIENT_KIND.INDIVIDUAL }), false);

  const entity = buildQuotationApprovalParties({
    client_name:'شركة المثال',
    client_kind:'entity',
    client_representative_name:'محمد',
    client_representative_title:'مدير المشروع',
  });
  assert.deepEqual(entity[0].fields.map((field)=>field.label), [
    'الاسم','يمثله','المنصب / الصفة','التوقيع','التاريخ',
  ]);
  assert.equal(entity[0].stampLabel, 'ختم الشركة');

  const individual = buildQuotationApprovalParties({
    client_name:'محمد',
    client_kind:'individual',
    client_representative_name:'يجب ألا يظهر',
  });
  assert.deepEqual(individual[0].fields.map((field)=>field.label), [
    'الاسم','التوقيع','التاريخ',
  ]);
  assert.equal(individual[0].stampLabel, null);
});

test('employee selection creates a stable signatory snapshot with provenance', () => {
  const patch = employeeSignatoryPatch({
    id:'employee-1',
    full_name_ar:'إبراهيم مثال',
    person_kind:'employee',
    job_title:'مدير عام',
  });
  assert.deepEqual(patch, {
    arkan_signatory_employee_id:'employee-1',
    arkan_signatory_name:'إبراهيم مثال',
    arkan_signatory_title:'مدير عام',
  });
});

test('arkan approval uses stored snapshot without a second employee lookup', () => {
  const parties = buildQuotationApprovalParties({
    client_name:'عميل',
    arkan_signatory_employee_id:'employee-1',
    arkan_signatory_name:'المفوّض وقت إصدار العرض',
    arkan_signatory_title:'المدير العام',
  });
  assert.equal(parties[1].fields[0].value, 'المفوّض وقت إصدار العرض');
  assert.equal(parties[1].fields[1].value, 'المدير العام');
});
