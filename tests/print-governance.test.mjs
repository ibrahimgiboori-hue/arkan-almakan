import test from 'node:test';
import assert from 'node:assert/strict';
import { PRINT_DOCUMENTS, paginateRows } from '../lib/print-governance.js';

test('uniform governed row pagination uses the declared regular cap', () => {
  const items = Array.from({ length:20 }, (_, i) => i);
  assert.deepEqual(paginateRows(items, { regular:7 }).map((page) => page.length), [7,7,6]);
});

test('first-only cap reserves room for a full identity header', () => {
  const items = Array.from({ length:20 }, (_, i) => i);
  const pages = paginateRows(items, { first:13, regular:16 });
  assert.deepEqual(pages.map((page) => page.length), [13,7]);
  assert.deepEqual(pages.flat(), items);
  assert.deepEqual(paginateRows(items.slice(0,10), { first:13, regular:16 }).map((page) => page.length), [10]);
  const bigItems = Array.from({ length:45 }, (_, i) => i);
  assert.deepEqual(paginateRows(bigItems, { first:13, regular:16 }).map((page) => page.length), [13,16,16]);
});

test('final-only cap reserves room for trailing totals and legends', () => {
  const items = Array.from({ length:20 }, (_, i) => i);
  const pages = paginateRows(items, { regular:22, final:13 });
  assert.deepEqual(pages.map((page) => page.length), [7,13]);
  assert.deepEqual(pages.flat(), items);
  const bigItems = Array.from({ length:50 }, (_, i) => i);
  assert.deepEqual(paginateRows(bigItems, { regular:22, final:13 }).map((page) => page.length), [22,15,13]);
});

test('first and final caps both apply, including the one-page edge case', () => {
  const items = Array.from({ length:35 }, (_, i) => i);
  assert.deepEqual(paginateRows(items, { first:13, regular:16, final:13 }).map((page) => page.length), [13,9,13]);

  // If one physical page would violate the tighter final reserve, the engine must split it.
  const tight = Array.from({ length:10 }, (_, i) => i);
  assert.deepEqual(paginateRows(tight, { first:13, regular:16, final:8 }).map((page) => page.length), [9,1]);
  assert.deepEqual(paginateRows(tight.slice(0,8), { first:13, regular:16, final:8 }).map((page) => page.length), [8]);
});

test('empty input remains a printable empty page', () => {
  assert.deepEqual(paginateRows([], { first:13, regular:16, final:13 }), [[]]);
});

test('invalid pagination policy fails loudly instead of silently inventing a row cap', () => {
  assert.throws(() => paginateRows([1], {}), /pagination\.regular/);
  assert.throws(() => paginateRows([1], { regular:0 }), /pagination\.regular/);
  assert.throws(() => paginateRows([1,2], { regular:10, first:'bad' }), /pagination\.first/);
});

test('timesheet and expense reports declare row capacities once in print governance', () => {
  const timesheet = PRINT_DOCUMENTS.timesheet_report.layout.pagination;
  const expense = PRINT_DOCUMENTS.expense_report.layout.pagination;

  assert.deepEqual(timesheet.matrix, { first:13, regular:16 });
  assert.deepEqual(timesheet.detail, { regular:22 });
  assert.deepEqual(timesheet.paper, { regular:18 });
  assert.deepEqual(timesheet.summary, { regular:22, final:13 });
  assert.deepEqual(expense, { first:13, regular:18 });

  const rows = Array.from({ length:45 }, (_, i) => i);
  assert.deepEqual(paginateRows(rows, expense).map((page) => page.length), [13,18,14]);
});
