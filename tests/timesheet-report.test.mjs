import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMESHEET_STATUS,
  assignmentOverlaps,
  buildAttendanceMap,
  chunk,
  dateRange,
  summarizeAttendance,
  summarizeWorkdaysByLaborClass,
  workerPeriodDays,
} from '../lib/timesheet-report.mjs';
import { laborClassLabel, laborClassSummaryLabel, summarizeLaborClasses } from '../lib/labor-class-summary.mjs';

test('missing attendance is treated as absence for daily labor', () => {
  assert.equal(TIMESHEET_STATUS.unrecorded.short, 'غ');
  assert.equal(TIMESHEET_STATUS.absent.short, 'غ');
  assert.equal(TIMESHEET_STATUS.unrecorded.label, TIMESHEET_STATUS.absent.label);
  assert.equal(TIMESHEET_STATUS.unrecorded.factor, 0);
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

test('workdays are split by labor class and still reconcile to the grand total', () => {
  const rows = [
    { laborer_id:'t1', labor_class:'technician', work_date:'2026-08-01', status:'full' },
    { laborer_id:'t1', labor_class:'technician', work_date:'2026-08-02', status:'half' },
    { laborer_id:'w1', labor_class:'worker', work_date:'2026-08-01', status:'full' },
    { laborer_id:'w1', labor_class:'worker', work_date:'2026-08-02', status:'absent' },
    { laborer_id:'f1', labor_class:'foreman', work_date:'2026-08-01', status:'half' },
  ];
  assert.deepEqual(summarizeWorkdaysByLaborClass(rows), {
    technician:1.5,
    worker:1,
    foreman:0.5,
    other:0,
    total:3,
  });
});

test('labor class split can fall back to the worker master classification', () => {
  const rows = [
    { laborer_id:'t1', work_date:'2026-08-01', status:'full' },
    { laborer_id:'w1', work_date:'2026-08-01', status:'half' },
  ];
  assert.deepEqual(summarizeWorkdaysByLaborClass(rows, { t1:'technician', w1:'worker' }), {
    technician:1,
    worker:0.5,
    foreman:0,
    other:0,
    total:1.5,
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

test('labor roster keeps technicians distinct from workers', () => {
  const roster = [
    ...Array.from({ length:10 }, () => ({ laborClass:'technician' })),
    { laborClass:'worker' },
  ];
  const summary = summarizeLaborClasses(roster);
  assert.deepEqual(summary, { total:11, technician:10, worker:1, foreman:0, other:0 });
  assert.equal(laborClassSummaryLabel(summary), '10 صنايعية · 1 عامل');
  assert.equal(laborClassLabel('technician'), 'صنايعي');
});
