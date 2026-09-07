import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const reportCenter = readFileSync(new URL('../components/timesheet/TimesheetReportCenter.js', import.meta.url),'utf8');
const internalPrint = readFileSync(new URL('../app/print/timesheet/page.js', import.meta.url),'utf8');
const externalPrint = readFileSync(new URL('../app/print/contractor-timesheet/[id]/page.js', import.meta.url),'utf8');
const legacyHome = readFileSync(new URL('../app/dashboard/timesheet/page.js', import.meta.url),'utf8');

test('official timesheet selection is monthly, not an arbitrary date range', () => {
  assert.match(reportCenter,/type="month"/);
  assert.match(reportCenter,/التايم شيت الشهري/);
  assert.doesNotMatch(reportCenter,/آخر 7 أيام/);
  assert.doesNotMatch(reportCenter,/آخر 30 يومًا/);
});

test('internal and external prints use the same monthly sheet component', () => {
  assert.match(internalPrint,/MonthlyTimesheetSheet/);
  assert.match(externalPrint,/MonthlyTimesheetSheet/);
});

test('internal official print no longer chunks the month into weekly matrices', () => {
  assert.doesNotMatch(internalPrint,/chunk\(dates,\s*7\)/);
  assert.doesNotMatch(internalPrint,/weekTableHead/);
  assert.doesNotMatch(internalPrint,/matrixDateGroups/);
  assert.match(internalPrint,/marks\[String\(day\)\]/);
});

test('legacy weekly UI is deleted and old timesheet home redirects to projects', () => {
  assert.equal(existsSync(new URL('../app/dashboard/timesheet/week/page.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../app/dashboard/timesheet/report/page.js', import.meta.url)), false);
  assert.match(legacyHome,/redirect\('\/dashboard\/projects'\)/);
  assert.doesNotMatch(legacyHome,/أسابيع/);
});
