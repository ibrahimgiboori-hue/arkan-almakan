import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCustodyDraft,
  custodyInflow,
  custodyOutflow,
  storedCustodyTransactionRow,
  validateCustodyDrafts,
} from '../lib/project-custody.mjs';
import {
  createLaborDraft,
  groupLaborDraftsForQuickAdd,
  laborRosterRow,
  projectLaborRate,
} from '../lib/project-labor.mjs';
import { planProjectAttendanceSheet, projectAttendanceCellValue } from '../lib/project-attendance.mjs';

let n = 0;
const id = () => `d${++n}`;

test('custody sheet: saved movements lock, inflow/outflow split, drafts follow the payload rules', () => {
  const saved = storedCustodyTransactionRow({ id: 't1', direction: 'issue', trx_date: '2026-11-08', amount: 2000, notes: null });
  assert.equal(saved.persisted, true);
  assert.equal(custodyInflow(saved), 2000);
  assert.equal(custodyOutflow(saved), null);
  assert.equal(custodyOutflow({ direction: 'return', amount: '150' }), 150);
  const rows = [
    saved,
    createCustodyDraft('2026-11-09', { amount: '300', beneficiary: 'إيجار سقالات' }, id),
    createCustodyDraft('2026-11-09', { amount: '120' }, id),
    createCustodyDraft('2026-11-09', { amount: '80', beneficiary: 'نقل', charge_to: 'contractor' }, id),
    createCustodyDraft('2026-11-09', { direction: 'issue', amount: '1000' }, id),
    createCustodyDraft('2026-11-09', {}, id),
  ];
  assert.equal(rows[1].category, 'مصروف تشغيلي');
  const { ready, errors } = validateCustodyDrafts(rows);
  assert.deepEqual(ready.map((row) => row.amount), ['300', '1000']);
  assert.deepEqual(errors, ['الصف 3: البيان أو المستفيد مطلوب عند الصرف.', 'الصف 4: اختر المقاول المحمل عليه المصروف.']);
});

test('labor sheet: roster rows show the pay that matches the basis; new rows group into quick-add calls', () => {
  assert.equal(projectLaborRate({ pay_basis: 'salary', monthly_salary: 3000, daily_rate: 120 }), 3000);
  assert.equal(projectLaborRate({ pay_basis: 'piecework', piece_rate: 12 }), 12);
  const row = laborRosterRow({ id: 'w1', full_name: 'أحمد', pay_basis: 'daily', daily_rate: 150, current_assignment: { project_id: 'p1' }, assignment_from: '2026-11-01' }, 'p1');
  assert.deepEqual([row.persisted, row.rate, row.placement, row.effective_from], [true, '150', 'project', '2026-11-01']);
  assert.equal(laborRosterRow({ id: 'w2', current_assignment: { project_id: 'p9' } }, 'p1').placement, 'elsewhere');

  const drafts = [
    createLaborDraft({ full_name: 'سالم', rate: '150' }, id),
    createLaborDraft({ full_name: 'ماجد', rate: '150' }, id),
    createLaborDraft({ full_name: 'رضا', labor_class: 'technician', trade: 'بلاط', rate: '220' }, id),
    createLaborDraft({ full_name: 'كريم', pay_basis: 'piecework', rate: '12', piece_unit: 'م2' }, id),
    createLaborDraft({ full_name: 'وليد', labor_class: 'x' }, id),
    createLaborDraft({}, id),
  ];
  const { groups, errors } = groupLaborDraftsForQuickAdd(drafts, '2026-11-09');
  assert.equal(groups.length, 3);
  assert.equal(groups[0].form.names, 'سالم\nماجد');
  assert.equal(groups[0].form.daily_rate, '150');
  assert.equal(groups[0].effectiveFrom, '2026-11-09');
  assert.deepEqual([groups[1].form.labor_class, groups[1].form.trade, groups[1].form.daily_rate], ['technician', 'بلاط', '220']);
  assert.deepEqual([groups[2].form.pay_basis, groups[2].form.piece_rate, groups[2].form.daily_rate], ['piecework', '12', '']);
  assert.deepEqual(errors, ['الصف 5: اختر الصفة.']);
});

test('attendance sheet: only real changes are written; protected and pending marks are never touched', () => {
  const workers = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ id: key, full_name: `عامل ${key}` }));
  const marks = {
    a: { id: 'm-a', status: 'full', work_date: '2026-11-09' },
    b: { id: 'm-b', status: 'half', work_date: '2026-11-09' },
    c: { id: 'm-c', status: 'leave', protected: true },
    d: { status: 'full', pending: true },
  };
  const changes = { a: 'full', b: '', c: 'full', d: 'half', e: 'half', f: '' };
  assert.equal(projectAttendanceCellValue(workers[1], marks, changes), '');
  assert.equal(projectAttendanceCellValue(workers[1], marks, {}), 'half');
  const plan = planProjectAttendanceSheet({ workers, marks, changes, date: '2026-11-09' });
  assert.deepEqual(plan.entries.map((entry) => `${entry.worker.id}:${entry.status}`), ['e:half']);
  assert.deepEqual(plan.removals.map((worker) => worker.id), ['b']);
  assert.deepEqual(plan.blocked, ['عامل c: حالة محفوظة تاريخيًا', 'عامل d: بانتظار المزامنة']);
});
