import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPrintLayoutPolicy, resolvePrintDocument } from '../lib/print-governance.js';
import { monthlyTimesheetColumnPlan } from '../lib/monthly-timesheet-layout.mjs';

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

test('day area is divided mathematically and equally for 28, 29, 30 and 31-day months', () => {
  for (const count of [28,29,30,31]) {
    const plan = monthlyTimesheetColumnPlan(count);
    assert.equal(plan.dayCount,count);
    assert.equal(plan.fixed,29.2);
    assert.equal(plan.dayArea,70.8);
    assert.ok(Math.abs((plan.day * count) + plan.fixed - 100) < 1e-10);
    assert.ok(Math.abs(plan.day - (70.8 / count)) < 1e-12);
  }
  assert.ok(monthlyTimesheetColumnPlan(28).day > monthlyTimesheetColumnPlan(31).day);
  assert.match(shared,/monthlyTimesheetColumnPlan\(dayCount\)/);
  assert.match(shared,/style=\{\{width:pct\(columns\.day\)\}\}/);
});

test('rotated weekday labels do not participate in table intrinsic width', () => {
  assert.match(css,/\.weekdayCell span\{[^}]*position:absolute/s);
  assert.match(css,/translate\(-50%,-50%\) rotate\(-90deg\)/);
  assert.match(css,/\.dayCol\{width:var\(--timesheet-day-width\);min-width:0\}/);
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
