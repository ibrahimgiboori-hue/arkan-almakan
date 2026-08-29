import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration=readFileSync('supabase/migrations/20260829201500_unify_leave_financial_approval_engine.sql','utf8');
const leavesPage=readFileSync('app/dashboard/leaves/page.js','utf8');
const approvalsPage=readFileSync('app/dashboard/approvals/page.js','utf8');

test('leave and financial case use the canonical approval workflow engine',()=>{
  assert.match(migration,/approval_workflow_stage_policies/);
  assert.match(migration,/'leave_request','اعتماد طلب إجازة'/);
  assert.match(migration,/'financial_case','اعتماد معاملة مالية'/);
  assert.match(migration,/trg_financial_case_version_to_approval/);
  assert.match(migration,/fn_my_approval_inbox|approval_workflows/);
});

test('financial source amount cannot enter the public universal adapter without a trusted amount',()=>{
  assert.match(migration,/'financial_case'[\s\S]*?null,'financial_cases'/);
  assert.match(migration,/new\.requested_amount/);
  assert.match(migration,/financial_case_versions/);
});

test('specialized financial state transitions remain delegated to the existing financial case state machine',()=>{
  for(const action of ['finance_approve','final_approve','return_to_source','cancel']){
    assert.ok(migration.includes(`'${action}'`),`missing ${action} delegation`);
  }
  assert.match(migration,/fn_financial_case_action/);
});

test('leave screen submits to the central inbox and no longer records local approval decisions',()=>{
  assert.match(leavesPage,/fn_universal_submit_for_approval/);
  assert.match(leavesPage,/href="\/dashboard\/approvals"/);
  assert.doesNotMatch(leavesPage,/record_leave_manual_decision/);
  assert.doesNotMatch(leavesPage,/ManualDecisionForm/);
});

test('central approvals UI distinguishes an intermediate approval from final approval',()=>{
  assert.match(approvalsPage,/is_final_stage/);
  assert.match(approvalsPage,/decisionStatus==='pending'/);
  assert.match(approvalsPage,/اعتماد المرحلة/);
  assert.match(approvalsPage,/انتقلت المعاملة تلقائيًا إلى المرحلة التالية/);
});
