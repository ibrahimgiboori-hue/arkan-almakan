import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPrintReportColumns } from '../lib/print-governance.js';

const source = fs.readFileSync(new URL('../app/print/expenses/page.js', import.meta.url), 'utf8');

test('expense report calls the payment party جهة السداد through governed presentation labels', () => {
  const payer = getPrintReportColumns('expense_report').find((column)=>column.field === 'payer');
  assert.equal(payer?.label, 'جهة السداد');
  assert.match(source, /<PrintColumnLabel field="payer" fallback="جهة السداد" \/>/);
  assert.equal(source.includes('>الدافع<'), false);
});

test('expense report keeps the concise على أركان/المقاول/المالك wording', () => {
  assert.match(source, /` \/ على \$\{CHARGE_AR/);
  assert.match(source, /arkan:'أركان'/);
  assert.match(source, /contractor:'المقاول'/);
  assert.match(source, /owner:'المالك'/);
});
