import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260907215000_progress_claim_internal_approval_route.sql', import.meta.url),'utf8');
const claimUi = readFileSync(new URL('../components/ProjClaims.js', import.meta.url),'utf8');

test('project claims use a fixed three-stage internal approval route', () => {
  assert.match(migration,/projects\.claims\.review/);
  assert.match(migration,/مراجعة إدارة المشاريع/);
  assert.match(migration,/finance\.projects\.review/);
  assert.match(migration,/المراجعة المالية/);
  assert.match(migration,/system\.approvals\.final_approve/);
  assert.match(migration,/الاعتماد النهائي/);
  assert.match(migration,/allow_additional=false/);
  assert.match(migration,/origin_counts_as_opinion=false/);
});

test('generic approval engine waits for all planned stages before finalizing', () => {
  assert.match(migration,/v_has_remaining boolean:=false/);
  assert.match(migration,/x\.status='pending'/);
  assert.match(migration,/if v_has_remaining then/);
  assert.match(migration,/perform private\.fn_finalize_approval_source\(w\)/);
  assert.match(migration,/v_is_final:=true/);
  assert.match(migration,/v_is_final,'dynamic'/);
});

test('approval inbox exposes only the current pending step', () => {
  assert.match(migration,/order by cs\.step_order/);
  assert.match(migration,/limit 1/);
});

test('claim journey keeps internal approval separate from client submission', () => {
  assert.match(claimUi,/fn_submit_progress_claim_for_approval/);
  assert.match(claimUi,/fn_approval_decide/);
  assert.match(claimUi,/record_claim_client_submission/);
  assert.match(claimUi,/التقديم للعميل/);
  assert.match(claimUi,/اعتماد العميل/);
});

test('existing untouched pending finance-only claim workflows are upgraded in place', () => {
  assert.match(migration,/step_order=2/);
  assert.match(migration,/s\.acted_at is null/);
  assert.match(migration,/target_group_key='module:projects'/);
  assert.match(migration,/target_group_key='module:system'/);
});
