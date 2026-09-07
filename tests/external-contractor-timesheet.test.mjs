import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPrintLayoutPolicy, resolvePrintDocument } from '../lib/print-governance.js';

const page = readFileSync(new URL('../app/print/contractor-timesheet/[id]/page.js', import.meta.url),'utf8');
const shared = readFileSync(new URL('../components/timesheet/MonthlyTimesheetSheet.js', import.meta.url),'utf8');
const css = readFileSync(new URL('../components/timesheet/monthly-timesheet-sheet.module.css', import.meta.url),'utf8');

test('external contractor monthly timesheet is governed as landscape', () => {
  const resolved = resolvePrintDocument('/print/contractor-timesheet/123');
  assert.equal(resolved?.key, 'external_contractor_timesheet');
  assert.equal(getPrintLayoutPolicy('external_contractor_timesheet').orientation, 'landscape');
});

test('external contractor print uses the shared monthly sheet', () => {
  assert.match(page,/MonthlyTimesheetSheet/);
  assert.match(page,/monthlyTimesheetMonthLabel/);
});

test('shared monthly print uses full vertical weekday names over zero-padded dates', () => {
  for (const weekday of ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']) {
    assert.match(shared,new RegExp(weekday));
  }
  assert.match(shared,/padStart\(2, '0'\)/);
  assert.match(shared,/rowSpan=\{2\}/);
  assert.match(shared,/weekdayRow/);
  assert.match(shared,/dateRow/);
});

test('all monthly day columns share one physical width', () => {
  assert.match(shared,/className=\{styles\.dayCol\}/);
  assert.match(css,/\.dayCol\{width:5\.15mm\}/);
  assert.match(css,/\.weekdayCell span\{[^}]*rotate\(-90deg\)/s);
});

test('internal and external official timesheets are both landscape', () => {
  assert.equal(getPrintLayoutPolicy('timesheet_report').orientation, 'landscape');
  assert.equal(getPrintLayoutPolicy('external_contractor_timesheet').orientation, 'landscape');
});
