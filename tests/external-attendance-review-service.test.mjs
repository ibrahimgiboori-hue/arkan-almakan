import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTERNAL_ATTENDANCE_REVIEW_GROUP,
  externalAttendanceReviewCaseState,
  externalAttendanceReviewGroupForStatus,
  isExternalAttendanceJustificationAllowed,
  summarizeExternalAttendanceReview,
} from '../lib/core/external-attendance-review.js';
import { createExternalAttendanceReviewService } from '../lib/application/external-attendance-review-service.js';

function fakeRepository({status='analyzed',days=[]}={}){
  const calls=[];
  let current={id:'batch-1',processing_scope:'external',status,recalculated_at:status==='recalculated'?'2026-09-11T00:00:00Z':null};
  return {
    calls,
    repository:{
      async getImport(){calls.push(['getImport']);return current;},
      async loadProcessingDays(){calls.push(['loadProcessingDays']);return days;},
      async startReview(){calls.push(['startReview']);current={...current,status:'justifications'};return true;},
      async submitJustification(input){calls.push(['submitJustification',input]);return 'j-1';},
      async decideJustification(input){calls.push(['decideJustification',input]);return true;},
      async recalculateImport(){calls.push(['recalculateImport']);current={...current,status:'recalculated',recalculated_at:'2026-09-11T01:00:00Z'};return {};},
    },
  };
}

test('review core separates absence from missing punch justification policy',()=>{
  assert.equal(externalAttendanceReviewGroupForStatus('absent'),EXTERNAL_ATTENDANCE_REVIEW_GROUP.ABSENCE);
  assert.equal(externalAttendanceReviewGroupForStatus('missing_in'),EXTERNAL_ATTENDANCE_REVIEW_GROUP.MISSING_PUNCH);
  assert.equal(externalAttendanceReviewGroupForStatus('missing_out'),EXTERNAL_ATTENDANCE_REVIEW_GROUP.MISSING_PUNCH);
  assert.equal(isExternalAttendanceJustificationAllowed('absence','approved_leave'),true);
  assert.equal(isExternalAttendanceJustificationAllowed('missing_punch','approved_leave'),false);
  assert.equal(isExternalAttendanceJustificationAllowed('missing_punch','forgot_punch'),true);
});

test('review summary closes only when technical, unjustified and client-pending cases are zero',()=>{
  const days=[
    {day_status:'absent',justification_id:'a',justification_decision:'accepted'},
    {day_status:'missing_in',justification_id:'b',justification_decision:'rejected'},
  ];
  const done=summarizeExternalAttendanceReview(days);
  assert.equal(done.accepted,1);
  assert.equal(done.rejected,1);
  assert.equal(done.readyForFinal,true);

  assert.equal(summarizeExternalAttendanceReview([...days,{day_status:'absent'}]).readyForFinal,false);
  assert.equal(summarizeExternalAttendanceReview([...days,{day_status:'missing_out',justification_id:'c',justification_decision:'pending'}]).readyForFinal,false);
  assert.equal(summarizeExternalAttendanceReview([...days,{day_status:'needs_review'}]).readyForFinal,false);
});

test('review case state is deterministic',()=>{
  assert.equal(externalAttendanceReviewCaseState({day_status:'complete'}),'not_reviewable');
  assert.equal(externalAttendanceReviewCaseState({day_status:'absent'}),'unjustified');
  assert.equal(externalAttendanceReviewCaseState({day_status:'absent',justification_id:'1'}),'pending');
  assert.equal(externalAttendanceReviewCaseState({day_status:'absent',justification_id:'1',justification_decision:'accepted'}),'accepted');
  assert.equal(externalAttendanceReviewCaseState({day_status:'absent',justification_id:'1',justification_decision:'rejected'}),'rejected');
});

test('application service starts review once before submitting an analyzed case',async()=>{
  const fake=fakeRepository({status:'analyzed'});
  const service=createExternalAttendanceReviewService(fake.repository);
  const result=await service.submitMany({
    importId:'batch-1',
    cases:[{id:'d1',day_status:'absent',work_date:'2026-08-03'}],
    type:'approved_leave',
  });
  assert.equal(result.applied,1);
  assert.equal(result.failed.length,0);
  assert.deepEqual(fake.calls.map((x)=>x[0]),['getImport','startReview','submitJustification']);
});

test('application service refuses a mismatched bulk justification before persistence',async()=>{
  const fake=fakeRepository({status:'justifications'});
  const service=createExternalAttendanceReviewService(fake.repository);
  const result=await service.submitMany({
    importId:'batch-1',
    cases:[{id:'d1',day_status:'missing_in',work_date:'2026-08-03'}],
    type:'approved_leave',
  });
  assert.equal(result.applied,0);
  assert.equal(result.failed.length,1);
  assert.equal(fake.calls.some((x)=>x[0]==='submitJustification'),false);
});

test('application service approves only a fully closed review and verifies recalculation',async()=>{
  const fake=fakeRepository({
    status:'justifications',
    days:[
      {day_status:'absent',justification_id:'a',justification_decision:'accepted'},
      {day_status:'missing_out',justification_id:'b',justification_decision:'rejected'},
    ],
  });
  const service=createExternalAttendanceReviewService(fake.repository);
  const result=await service.approveResult('batch-1');
  assert.equal(result.status,'recalculated');
  assert.ok(result.recalculated_at);
  assert.equal(fake.calls.some((x)=>x[0]==='recalculateImport'),true);
});

test('application service blocks approval while client decisions remain open',async()=>{
  const fake=fakeRepository({
    status:'justifications',
    days:[{day_status:'absent',justification_id:'a',justification_decision:'pending'}],
  });
  const service=createExternalAttendanceReviewService(fake.repository);
  await assert.rejects(()=>service.approveResult('batch-1'),/إغلاق جميع حالات المراجعة/);
  assert.equal(fake.calls.some((x)=>x[0]==='recalculateImport'),false);
});
