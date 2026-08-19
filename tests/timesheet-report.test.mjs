import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMESHEET_STATUS,
  assignmentOverlaps,
  buildAttendanceMap,
  chunk,
  dateRange,
  summarizeAttendance,
  workerPeriodDays,
} from '../lib/timesheet-report.mjs';

test('unrecorded is distinct from an explicit absence', () => {
  assert.equal(TIMESHEET_STATUS.unrecorded.short, '—');
  assert.equal(TIMESHEET_STATUS.absent.short, 'غ');
  assert.notEqual(TIMESHEET_STATUS.unrecorded.label, TIMESHEET_STATUS.absent.label);
});

test('full and half attendance produce the expected workdays', () => {
  const rows = [
    { laborer_id:'a', work_date:'2026-08-01', status:'full' },
    { laborer_id:'a', work_date:'2026-08-02', status:'half' },
    { laborer_id:'a', work_date:'2026-08-03', status:'absent' },
  ];
  assert.equal(workerPeriodDays('a', rows), 1.5);
  assert.deepEqual(summarizeAttendance(rows), {
    full:1, half:1, absent:1, stopped:0, leave:0, recorded:3, workdays:1.5,
  });
});

test('attendance map preserves explicit status and leaves missing dates missing', () => {
  const rows = [{ laborer_id:'a', work_date:'2026-08-01', status:'full' }];
  const map = buildAttendanceMap(rows);
  assert.equal(map['a|2026-08-01'].status, 'full');
  assert.equal(map['a|2026-08-02'], undefined);
});

test('assignment is included when any part overlaps the report period', () => {
  assert.equal(assignmentOverlaps({ valid_from:'2026-08-03', valid_to:'2026-08-10' }, '2026-08-01', '2026-08-05'), true);
  assert.equal(assignmentOverlaps({ valid_from:'2026-07-01', valid_to:'2026-07-31' }, '2026-08-01', '2026-08-05'), false);
  assert.equal(assignmentOverlaps({ valid_from:'2026-08-03', valid_to:null }, '2026-08-01', '2026-08-05'), true);
});

test('date ranges and page chunks do not split their atomic inputs', () => {
  const dates = dateRange('2026-08-01', '2026-08-09');
  assert.equal(dates.length, 9);
  assert.deepEqual(chunk(dates, 7).map((page) => page.length), [7, 2]);
  assert.equal(dateRange('2026-08-09', '2026-08-01').length, 0);
});
