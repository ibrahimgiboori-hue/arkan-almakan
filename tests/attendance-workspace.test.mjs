import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
// Screens were split into presentation + lib/application (services) + lib/adapters (Supabase).
// A behaviour is asserted on the layer that now owns it.
const readAll = (...paths) => paths.map(read).join('\n');
const ATTENDANCE_UI = 'app/dashboard/projects/[id]/operations/attendance-workspace.js';
const ATTENDANCE_RULES = 'lib/project-attendance.mjs';
const LABOR_PAGE = 'app/dashboard/projects/[id]/operations/labor/page.js';
const LABOR_UI = 'app/dashboard/projects/[id]/operations/labor/ProjectLaborWorkspaceEngineered.js';
const CUSTODY_PAGE = 'app/dashboard/projects/[id]/operations/custody/page.js';
const CUSTODY_UI = 'app/dashboard/projects/[id]/operations/custody/ProjectCustodyWorkspaceEngineered.js';

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

test('attendance ignores stale responses after the operator changes day', () => {
  const page = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  assert.match(page, /loadSeqRef/);
  assert.match(page, /dateRef/);
  assert.match(page, /requestDate/);
  assert.match(page, /dateRef\.current !== requestDate/);
});

test('legacy stopped and leave states are preserved and protected from quick overwrite', () => {
  const page = readAll(ATTENDANCE_UI, ATTENDANCE_RULES);
  const registered = read('app/dashboard/projects/[id]/operations/RegisteredAttendanceList.js');
  assert.match(page, /stopped/);
  assert.match(page, /leave/);
  assert.match(page, /PROTECTED_STATUSES/);
  assert.match(registered, /متوقف — حالة محفوظة/);
  assert.match(registered, /إجازة — حالة محفوظة/);
});

test('queued attendance moves into registered list without creating duplicate clicks', () => {
  const page = readAll(ATTENDANCE_UI, ATTENDANCE_RULES);
  const registered = read('app/dashboard/projects/[id]/operations/RegisteredAttendanceList.js');
  assert.match(page, /pending:\s*true/);
  assert.match(page, /existing\?\.pending/);
  assert.match(registered, /بانتظار المزامنة/);
});

test('attendance cancellation rejects false-success boolean and stale row identity', () => {
  const page = read(ATTENDANCE_UI);
  const adapter = read('lib/adapters/project-attendance-supabase.js');
  const service = read('lib/application/project-attendance-service.js');
  // The RPC result must be literally true; anything else is a failed removal, never a silent success.
  assert.match(adapter, /return query\.data\s*===\s*true/);
  assert.match(service, /if\s*\(!removed\)\s*throw new Error/);
  assert.match(page, /current\[worker\.id\]\?\.id !== row\.id/);
  assert.match(page, /row\.work_date/);
});

test('load failures remain errors and never masquerade as empty rosters', () => {
  const attendance = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  const labor = readAll(LABOR_PAGE, LABOR_UI);
  assert.match(attendance, /loadError/);
  assert.match(attendance, /لم تُعرض حالة فارغة بديلة/);
  assert.match(labor, /setLoadError\(message\)/);
  assert.match(labor, /\{loadError\s*\?\s*null\s*:\s*<>/);
});

test('contractor with no labor has a corrective route instead of false completion', () => {
  const page = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  assert.match(page, /بلا عمالة/);
  assert.match(page, /operations\/labor/);
  assert.equal(page.includes("'مكتمل'"), false);
});

test('labor management lives inside the project and uses existing guarded RPCs', () => {
  const page = readAll(LABOR_PAGE, LABOR_UI);
  const adapter = read('lib/adapters/project-labor-supabase.js');
  assert.match(adapter, /fn_quick_add_workers/);
  assert.match(adapter, /fn_move_laborer/);
  assert.match(adapter, /fn_update_labor_assignment/);
  assert.match(page, /data-canonical-labor-create-form/);
  assert.equal(page.includes('/dashboard/site-operations'), false);
});

test('labor transfer uses the target contractor rate instead of carrying the old rate', () => {
  const labor = readAll(LABOR_PAGE, LABOR_UI);
  const payload = read('lib/project-labor.mjs');
  assert.match(labor, /rateForTarget/);
  assert.match(labor, /changeMoveContractor/);
  assert.match(labor, /يومية الجديدة/);
  assert.equal(labor.includes('p_daily_rate: moveFor.daily_rate'), false);
  assert.equal(payload.includes('p_daily_rate:moveFor.daily_rate'), false);
  // Only daily-paid workers send a rate; a blank rate lets fn_move_laborer use the target contractor's rate.
  assert.match(payload, /p_daily_rate:\s*worker\.pay_basis\s*===\s*'daily'/);
});

test('legacy contractor labor route cannot create laborers', () => {
  const retired = read('app/dashboard/contractors/[id]/labor/page.js');
  const router = read('app/dashboard/labor/page.js');
  assert.match(retired, /data-retired-labor-entry="contractor-level"/);
  assert.equal(retired.includes(".from('laborers').insert"), false);
  assert.equal(retired.includes('buildLaborerSavePayload'), false);
  assert.equal(retired.includes('إضافة عامل إلى'), false);
  assert.equal(router.includes("searchParams?.add"), false);
  assert.equal(router.includes('?add=1'), false);
});

test('custody follows the same project operation date and uses a constitutional confirmation', () => {
  const custody = readAll(CUSTODY_PAGE, CUSTODY_UI);
  assert.match(custody, /useProjectOperationContext/);
  assert.match(custody, /trx_date:operationDate/);
  assert.match(custody, /opened_at:operationDate/);
  assert.match(custody, /ConstitutionDialog/);
  assert.equal(custody.includes('window.confirm'), false);
});