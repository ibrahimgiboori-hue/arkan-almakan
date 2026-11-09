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
import * as attendance from '../lib/project-attendance.mjs';

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

test('attendance ledger: one project sheet; filters narrow it, saves group by day, history stays protected', () => {
  const assignmentRows = [
    { id: 'as1', laborer_id: 'a', contractor_id: 'c1', daily_rate: 150, valid_from: '2026-11-01', valid_to: '2026-11-05' },
    { id: 'as2', laborer_id: 'a', contractor_id: 'c2', daily_rate: 170, valid_from: '2026-11-06', valid_to: null },
    { id: 'as3', laborer_id: 'b', contractor_id: 'c1', daily_rate: 120, valid_from: '2026-11-01', valid_to: null },
    { id: 'as4', laborer_id: 'c', contractor_id: 'c2', daily_rate: 130, valid_from: '2026-11-01', valid_to: null },
  ];
  const laborers = [{ id: 'a', full_name: 'أحمد', trade: 'نجار' }, { id: 'b', full_name: 'بكر' }, { id: 'c', full_name: 'جمال' }];
  const ledger = attendance.buildProjectAttendanceLedger({
    days: [{ id: 'd4', work_date: '2026-11-04' }, { id: 'd8', work_date: '2026-11-08' }],
    assignmentRows,
    contractors: [{ id: 'c1', name_ar: 'مقاول أ' }, { id: 'c2', name_ar: 'مقاول ب' }],
    laborers,
    attendanceRows: [
      { id: 'm1', day_id: 'd4', laborer_id: 'a', status: 'full' },
      { id: 'm2', day_id: 'd8', laborer_id: 'a', status: 'half' },
      { id: 'm3', day_id: 'd8', laborer_id: 'b', status: 'leave' },
      { id: 'm4', day_id: 'd8', laborer_id: 'c', status: 'full' },
    ],
  });
  // The contractor of a record is the one whose assignment covered that day (أحمد moved from c1 to c2).
  assert.equal(ledger.marks['2026-11-04|a'].contractor_id, 'c1');
  assert.equal(ledger.marks['2026-11-08|a'].contractor_id, 'c2');
  assert.equal(ledger.marks['2026-11-08|b'].protected, true);

  const all = attendance.projectAttendanceLedgerRows({ marks: ledger.marks, laborers: ledger.laborers, contractors: ledger.contractors, from: '2026-11-01', to: '2026-11-09' });
  assert.deepEqual(all.map((row) => row._id), ['2026-11-04|a', '2026-11-08|b', '2026-11-08|a', '2026-11-08|c']);
  const c2 = attendance.projectAttendanceLedgerRows({ marks: ledger.marks, laborers: ledger.laborers, contractors: ledger.contractors, from: '2026-11-01', to: '2026-11-09', contractorId: 'c2' });
  assert.deepEqual(c2.map((row) => row.worker_name), ['أحمد', 'جمال']);
  assert.equal(attendance.projectAttendanceLedgerRows({ marks: ledger.marks, laborers: ledger.laborers, contractors: ledger.contractors, from: '2026-11-05', to: '2026-11-09', search: 'نجار' }).length, 1);
  assert.deepEqual(attendance.summarizeProjectAttendanceLedger(all, (row) => row.mark.status), { records: 4, full: 2, half: 1, protected: 1, workedDays: 2.5 });

  const rosterFor = (date) => attendance.projectAttendanceRosterForDate({ date, assignmentRows, laborers });
  assert.equal(rosterFor('2026-11-09').find((worker) => worker.id === 'a').daily_rate, 170);
  const draft = (patch) => attendance.createProjectAttendanceDraft(patch, id);
  const plan = attendance.planProjectAttendanceLedger({
    marks: ledger.marks,
    changes: { '2026-11-04|a': 'half', '2026-11-08|c': '', '2026-11-08|b': 'full', '2026-11-08|a': 'half' },
    drafts: [
      draft({ date: '2026-11-09', laborer_id: 'a', status: 'full' }),
      draft({ date: '2026-11-09', laborer_id: 'b', status: 'half' }),
      draft({ date: '2026-11-09', laborer_id: 'c' }),
      draft({ date: '2026-11-09' }),
      draft({ date: '2026-11-09', laborer_id: 'a', status: 'half' }),
      draft({ date: '2026-10-30', laborer_id: 'b', status: 'full' }),
      draft({ date: '2026-11-09', laborer_id: 'zz', status: 'full' }),
    ],
    rosterFor,
    from: '2026-11-01',
    to: '2026-11-09',
  });
  assert.deepEqual(plan.days.map((day) => day.date), ['2026-11-04', '2026-11-08', '2026-11-09']);
  assert.deepEqual(plan.days[0].entries.map((entry) => `${entry.worker.id}:${entry.status}:${entry.worker.daily_rate}`), ['a:half:150']);
  assert.deepEqual(plan.days[1].removals.map((removal) => removal.key), ['2026-11-08|c']);
  assert.deepEqual(plan.days[2].entries.map((entry) => `${entry.worker.id}:${entry.status}:${entry.worker.daily_rate}`), ['a:full:170', 'b:half:120']);
  assert.equal(plan.days[2].entries[0].draftId.startsWith('d'), true);
  assert.deepEqual(plan.settledChanges, ['2026-11-08|a']);
  assert.equal(plan.settledDrafts.length, 2);
  assert.deepEqual(plan.blocked, ['بكر (2026-11-08): حالة محفوظة تاريخيًا']);
  assert.deepEqual(plan.errors, [
    'الصف الجديد 5: أحمد مكرر في 2026-11-09.',
    'الصف الجديد 6: التاريخ 2026-10-30 خارج فترة العرض — وسّع الفلترة لتشمله.',
    'الصف الجديد 7: العامل غير مسند للمشروع في 2026-11-09.',
  ]);
});

test('claims sheet: measurement rows edit in place and new rows follow the single-measurement rule', async () => {
  const claims = await import('../lib/project-claims.mjs');
  const m = { measurement_id: 'm1', project_item_id: 'i1', description_ar: 'لياسة', measurement_no: 3, period_from: '2026-10-01', period_to: '2026-10-31', qty_measured: 120, unit_price: 32, amount: 3840, ready_for_claim: true };
  const row = claims.measurementSheetRow(m);
  assert.deepEqual([row._id, row.qty, row.price, row.ready], ['m1', '120', '32', true]);
  assert.equal(claims.measurementLineValue(row), 3840);
  assert.equal(claims.measurementSheetChange(row), 'none');
  assert.equal(claims.measurementSheetChange({ ...row, qty: '130' }), 'edit');
  const historical = claims.measurementSheetRow({ ...m, period_from: null });
  assert.equal(claims.measurementSheetChange({ ...historical, from: '2026-10-05' }), 'start');
  let n = 0;
  const id = () => `d${++n}`;
  const drafts = [row, claims.createMeasurementDraft({ item: 'i2', from: '2026-11-01', to: '2026-11-08', qty: '80', price: '55' }, id), claims.createMeasurementDraft({ item: 'i2', from: '2026-11-09', to: '2026-11-01', qty: '5' }, id), claims.createMeasurementDraft({}, id)];
  assert.equal(claims.measurementLineValue(drafts[1]), 4400);
  const { ready, errors } = claims.validateMeasurementDrafts(drafts);
  assert.deepEqual(ready.map((r) => r._id), ['d1']);
  assert.deepEqual(errors, ['الصف 3: بداية فترة القياس يجب ألا تتجاوز نهايتها.']);
});

test('movements: one call for the period — rows carry date and contractor, filters narrow, totals follow what shows', async () => {
  const ledger = await import('../lib/project-daily-ledger.mjs');
  const { rows } = ledger.normalizeProjectDailyLedger({ rows: [
    { id: 'a-2', type: 'attendance', date: '2026-11-07', title: 'جمال', detail: 'نصف يوم · مقاولات النخبة', statusCode: 'half', contractorId: 'c2' },
    { id: 'c-1', type: 'custody', date: '2026-11-07', title: 'صرف من العهدة', detail: 'سقالات · على أركان', amount: 300, statusCode: 'spend', contractorId: null },
    { id: 'a-1', type: 'attendance', date: '2026-11-08', title: 'أحمد', detail: 'كامل · مؤسسة الإتقان · نجار', statusCode: 'full', contractorId: 'c1' },
    { id: 'e-1', type: 'expense', date: '2026-11-08', title: 'وجبات', detail: 'مقاولات النخبة · دفعه المقاول · غداء', amount: 120, contractorId: 'c2' },
  ] });
  assert.equal(rows[3].value, '120.00 ر.س');
  assert.deepEqual(ledger.filterProjectMovementRows(rows, { contractorId: 'c2' }).map((row) => row.title), ['جمال', 'وجبات']);
  assert.deepEqual(ledger.filterProjectMovementRows(rows, { type: 'attendance', search: 'نجار' }).map((row) => row.title), ['أحمد']);
  const totals = ledger.summarizeProjectMovementRows(rows);
  assert.deepEqual([totals.attendance, totals.full, totals.half, totals.expenses, totals.custody, totals.movements], [2, 1, 1, 120, 300, 4]);
  assert.equal(ledger.PROJECT_MOVEMENTS_MAX_DAYS, 92);
});
