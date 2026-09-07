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

test('all monthly day columns consume the remaining width equally', () => {
  assert.match(shared,/--timesheet-day-count/);
  assert.match(shared,/className=\{styles\.dayCol\}/);
  assert.match(css,/--timesheet-fixed-columns:72mm/);
  assert.match(css,/\.dayCol\{width:calc\(\(100% - var\(--timesheet-fixed-columns\)\)\/var\(--timesheet-day-count\)\)\}/);
  assert.match(css,/\.weekdayCell span\{[^}]*rotate\(-90deg\)/s);
});

test('monthly attendance cells use the agreed visual hierarchy without inventing missing external days', () => {
  assert.match(shared,/statusFull/);
  assert.match(shared,/statusHalf/);
  assert.match(shared,/statusAbsent/);
  assert.match(shared,/if \(!hasAttendance\) return \{ className:'', text:'', label:'' \}/);
  assert.match(css,/\.statusFull\{background:#e7f4e9!important/);
  assert.match(css,/\.statusHalf\{background:#fff0b3!important/);
  assert.match(css,/\.statusAbsent\{background:#c92a2a!important/);
  assert.match(css,/print-color-adjust:exact/);
});

test('internal and external official timesheets are both landscape', () => {
  assert.equal(getPrintLayoutPolicy('timesheet_report').orientation, 'landscape');
  assert.equal(getPrintLayoutPolicy('external_contractor_timesheet').orientation, 'landscape');
});
