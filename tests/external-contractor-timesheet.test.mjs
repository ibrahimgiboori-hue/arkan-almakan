import test from 'node:test';
import assert from 'node:assert/strict';
import { getPrintLayoutPolicy, resolvePrintDocument } from '../lib/print-governance.js';

test('external contractor monthly timesheet is governed as landscape', () => {
  const resolved = resolvePrintDocument('/print/contractor-timesheet/123');
  assert.equal(resolved?.key, 'external_contractor_timesheet');
  assert.equal(getPrintLayoutPolicy('external_contractor_timesheet').orientation, 'landscape');
});

test('existing project timesheet remains portrait during the pilot', () => {
  assert.equal(getPrintLayoutPolicy('timesheet_report').orientation, 'portrait');
});
