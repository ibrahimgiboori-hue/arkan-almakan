import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPrintLayoutPolicy, resolvePrintDocument } from '../lib/print-governance.js';

const page = readFileSync(new URL('../app/print/contractor-timesheet/[id]/page.js', import.meta.url),'utf8');
const css = readFileSync(new URL('../app/print/contractor-timesheet/[id]/timesheet-print.module.css', import.meta.url),'utf8');

test('external contractor monthly timesheet is governed as landscape', () => {
  const resolved = resolvePrintDocument('/print/contractor-timesheet/123');
  assert.equal(resolved?.key, 'external_contractor_timesheet');
  assert.equal(getPrintLayoutPolicy('external_contractor_timesheet').orientation, 'landscape');
});

test('monthly print uses full vertical weekday names over zero-padded dates', () => {
  for (const weekday of ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']) {
    assert.match(page,new RegExp(weekday));
  }
  assert.match(page,/padStart\(2,'0'\)/);
  assert.match(page,/rowSpan=\{2\}/);
  assert.match(page,/weekdayRow/);
  assert.match(page,/dateRow/);
});

test('all day columns share one physical width', () => {
  assert.match(page,/className=\{styles\.dayCol\}/);
  assert.match(css,/\.dayCol\{width:5\.15mm\}/);
  assert.match(css,/\.weekdayCell span\{[^}]*rotate\(-90deg\)/s);
});

test('existing project timesheet stays unchanged until monthly engine consolidation', () => {
  assert.equal(getPrintLayoutPolicy('timesheet_report').orientation, 'portrait');
});
