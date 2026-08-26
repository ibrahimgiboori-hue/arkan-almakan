import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentCoversDate,
  assignmentsOverlappingPeriod,
  resolveRosterAssignment,
  rosterContractorIdsForPeriod,
  selectRosterAssignmentsForDate,
  selectRosterAssignmentsForPeriod,
} from '../lib/site-operation-roster.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps an open assignment eligible on and after its start date', () => {
  const row = { id: 'open', valid_from: '2026-07-15', valid_to: null };
  assert.equal(assignmentCoversDate(row, '2026-08-20'), true);
});

test('returns the active historical assignment for the selected paper date', () => {
  const rows = [
    { id: 'old', valid_from: '2026-07-11', valid_to: '2026-07-29' },
    { id: 'new', valid_from: '2026-08-01', valid_to: '2026-08-10' },
  ];
  assert.deepEqual(resolveRosterAssignment(rows, '2026-07-20'), { assignment: rows[0], eligible: true });
});

test('keeps the nearest previous assignment visible outside its period', () => {
  const rows = [
    { id: 'first', valid_from: '2026-07-01', valid_to: '2026-07-10' },
    { id: 'latest', valid_from: '2026-07-11', valid_to: '2026-07-29' },
  ];
  assert.deepEqual(resolveRosterAssignment(rows, '2026-08-20'), { assignment: rows[1], eligible: false });
});

test('keeps an upcoming worker visible before the assignment begins', () => {
  const rows = [
    { id: 'later', valid_from: '2026-08-10', valid_to: null },
    { id: 'sooner', valid_from: '2026-08-01', valid_to: '2026-08-05' },
  ];
  assert.deepEqual(resolveRosterAssignment(rows, '2026-07-20'), { assignment: rows[1], eligible: false });
});

test('daily roster deterministically chooses the latest overlapping assignment per worker', () => {
  const rows = [
    { id:'a1', laborer_id:'L1', contractor_id:'C1', valid_from:'2026-08-01', valid_to:null },
    { id:'a2', laborer_id:'L1', contractor_id:'C2', valid_from:'2026-08-10', valid_to:null },
    { id:'b1', laborer_id:'L2', contractor_id:'C1', valid_from:'2026-08-01', valid_to:null },
  ];
  const selected = selectRosterAssignmentsForDate(rows, '2026-08-20');
  assert.equal(selected.length, 2);
  assert.equal(selected.find((row)=>row.laborer_id==='L1')?.id, 'a2');
});

test('period roster applies the same overlap rule and keeps contractor history scoped correctly', () => {
  const rows = [
    { id:'old', laborer_id:'L1', contractor_id:'C1', valid_from:'2026-08-01', valid_to:'2026-08-10' },
    { id:'new', laborer_id:'L1', contractor_id:'C2', valid_from:'2026-08-11', valid_to:null },
  ];
  assert.equal(assignmentsOverlappingPeriod(rows,'2026-08-01','2026-08-31').length,2);
  assert.equal(selectRosterAssignmentsForPeriod(rows,'2026-08-01','2026-08-31',{contractorId:'C1'})[0]?.id,'old');
  assert.equal(selectRosterAssignmentsForPeriod(rows,'2026-08-01','2026-08-31',{contractorId:'C2'})[0]?.id,'new');
  assert.deepEqual(new Set(rosterContractorIdsForPeriod(rows,'2026-08-01','2026-08-31')),new Set(['C1','C2']));
});

test('attendance entry and timesheet reports consume the shared roster constitution', () => {
  const attendance = read('app/dashboard/projects/[id]/operations/page.js');
  const reports = read('components/timesheet/TimesheetReportCenter.js');
  assert.match(attendance, /selectRosterAssignmentsForDate/);
  assert.match(reports, /selectRosterAssignmentsForPeriod/);
  assert.match(reports, /rosterContractorIdsForPeriod/);
  assert.equal(reports.includes('assignmentOverlaps('), false);
});
