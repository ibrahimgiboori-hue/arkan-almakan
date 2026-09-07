import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const externalPrint = readFileSync(new URL('../app/print/contractor-timesheet/[id]/page.js', import.meta.url),'utf8');
const externalEditor = readFileSync(new URL('../app/dashboard/contractors/timesheets/[id]/page.js', import.meta.url),'utf8');
const internalPrint = readFileSync(new URL('../app/print/claims/[id]/page.js', import.meta.url),'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260907145500_claim_vat_internal_external.sql', import.meta.url),'utf8');

test('external contractor claims default to Saudi standard VAT and show full breakdown', () => {
  assert.match(migration,/add column if not exists vat_rate numeric\(6,5\) not null default 0\.15/);
  assert.match(externalPrint,/DEFAULT_VAT_RATE = 0\.15/);
  assert.match(externalPrint,/الإجمالي قبل الضريبة/);
  assert.match(externalPrint,/ضريبة القيمة المضافة/);
  assert.match(externalPrint,/الإجمالي شامل الضريبة/);
  assert.match(externalPrint,/لا يُعد فاتورة ضريبية/);
});

test('external claim editor exposes tax rate and persists it', () => {
  assert.match(externalEditor,/vat_rate:/);
  assert.match(externalEditor,/ضريبة القيمة المضافة/);
  assert.match(externalEditor,/15% — خاضع للضريبة/);
  assert.match(externalEditor,/0% — بدون ضريبة/);
  assert.match(externalEditor,/شامل الضريبة/);
});

test('internal project claims keep VAT and explicitly show gross including VAT', () => {
  assert.match(internalPrint,/claim\.vat_rate/);
  assert.match(internalPrint,/claim\.vat_amount/);
  assert.match(internalPrint,/ضريبة القيمة المضافة/);
  assert.match(internalPrint,/الإجمالي شامل الضريبة/);
  assert.match(internalPrint,/values\.gross/);
});

test('migration only backfills missing internal claim tax values', () => {
  assert.match(migration,/pc\.vat_rate is null/);
  assert.match(migration,/pc\.taxable_base is null/);
  assert.match(migration,/pc\.net_payable is null/);
});
