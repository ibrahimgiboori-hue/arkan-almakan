import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPeriodWorkers,
  PORTAL_ATTENDANCE_STATUSES,
  shiftIsoDate,
  sortPortalRoster,
} from '../lib/contractor-portal.mjs';

test('portal offers only absence, half day, and full day',()=>{
  assert.deepEqual(PORTAL_ATTENDANCE_STATUSES.map(([value])=>value),['absent','half','full']);
});

test('day arrows move across month boundaries in the requested direction',()=>{
  assert.equal(shiftIsoDate('2026-08-01',-1),'2026-07-31');
  assert.equal(shiftIsoDate('2026-08-31',1),'2026-09-01');
});

test('worker numbering uses natural numeric order instead of text order',()=>{
  const workers=sortPortalRoster([
    {full_name:'صنايعي 10'},
    {full_name:'صنايعي 2'},
    {full_name:'صنايعي 1'},
  ]);

  assert.deepEqual(workers.map(row=>row.full_name),['صنايعي 1','صنايعي 2','صنايعي 10']);
});

test('period rows group by worker and treat a missing status as absence',()=>{
  const workers=buildPeriodWorkers([
    {laborer_id:'one',full_name:'صنايعي 1',labor_class:'technician',work_date:'2026-08-01',attendance_status:'full'},
    {laborer_id:'one',full_name:'صنايعي 1',labor_class:'technician',work_date:'2026-08-02',attendance_status:null},
    {laborer_id:'two',full_name:'عامل 1',labor_class:'worker',work_date:'2026-08-01',attendance_status:'half'},
  ],value=>value==='technician'?'صنايعي':'عامل');

  assert.equal(workers.length,2);
  assert.deepEqual(workers[0].days,{'2026-08-01':'full','2026-08-02':'absent'});
  assert.equal(workers[1].days['2026-08-01'],'half');
});
