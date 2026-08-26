import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('attendance entry offers only full and half day', () => {
  const bulk = read('app/dashboard/projects/[id]/operations/BulkAttendanceList.js');
  assert.match(bulk, /onMarkWorker\(worker, 'full'\)/);
  assert.match(bulk, /onMarkWorker\(worker, 'half'\)/);
  assert.equal(bulk.includes("onMarkWorker(worker, 'absent')"), false);
  assert.equal(bulk.includes("applySelected('absent')"), false);
});

test('unrecorded workers are explicitly explained as automatic absence', () => {
  const page = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  const bulk = read('app/dashboard/projects/[id]/operations/BulkAttendanceList.js');
  assert.match(page, /غياب تلقائي/);
  assert.match(page, /من يبقى هنا يُعامل كغياب تلقائيًا/);
  assert.match(bulk, /يُعامل كغياب تلقائيًا/);
});

test('registered attendance can change full-half or be cancelled in place', () => {
  const page = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  const registered = read('app/dashboard/projects/[id]/operations/RegisteredAttendanceList.js');
  assert.match(page, /RegisteredAttendanceList/);
  assert.match(registered, /onMarkWorker\(worker, 'full'\)/);
  assert.match(registered, /onMarkWorker\(worker, 'half'\)/);
  assert.match(registered, /onRemove\(worker\)/);
  assert.equal(page.includes('window.confirm'), false);
  assert.equal(registered.includes('window.confirm'), false);
});

test('registered and unregistered attendance panes are structurally symmetric', () => {
  const page = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  const layout = read('app/dashboard/projects/[id]/operations/attendance-layout.module.css');
  const pending = read('app/dashboard/projects/[id]/operations/BulkAttendanceList.js');
  const registered = read('app/dashboard/projects/[id]/operations/RegisteredAttendanceList.js');
  assert.match(layout, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal((page.match(/className=\{layoutStyles\.pane\}/g) || []).length, 2);
  for (const source of [pending, registered]) {
    assert.match(source, /className=\{styles\.table\}/);
    assert.match(source, />#</);
    assert.match(source, />العامل</);
    assert.match(source, />الصفة</);
    assert.match(source, /styles\.statusButtons/);
  }
});

test('contractor with no labor has a corrective route instead of false completion', () => {
  const page = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  assert.match(page, /بلا عمالة/);
  assert.match(page, /operations\/labor/);
  assert.equal(page.includes("'مكتمل'"), false);
});

test('labor management lives inside the project and uses existing guarded RPCs', () => {
  const page = read('app/dashboard/projects/[id]/operations/labor/page.js');
  assert.match(page, /fn_quick_add_workers/);
  assert.match(page, /fn_move_laborer/);
  assert.match(page, /fn_update_labor_assignment/);
  assert.equal(page.includes('/dashboard/site-operations'), false);
});
