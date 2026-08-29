import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('app/dashboard/workspace/workforce/section/payroll/page.js','utf8');
const grid=fs.readFileSync('components/ui/RawGrid.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260829230000_payroll_selected_approval_batches.sql','utf8');

test('monthly payroll remains a ledger while approval submits selected lines only',()=>{
  assert.match(page,/selectedIds/);
  assert.match(page,/fn_submit_payroll_batch/);
  assert.match(page,/رفع المحدد للمالية/);
  assert.doesNotMatch(page,/fn_submit_transaction_source'\s*,\s*\{p_source_table:'payroll_runs'/);
});

test('a payroll line belongs to one approval batch and returned batches are resubmitted in place',()=>{
  assert.match(migration,/unique \(payroll_line_id\)/);
  assert.match(migration,/fn_resubmit_payroll_batch/);
  assert.match(migration,/status not in \('returned','rejected'\)/);
  assert.match(page,/إعادة إرسال نفس المعاملة/);
});

test('locked payroll employees are enforced by the shared ledger rather than a page-only visual trick',()=>{
  assert.match(grid,/rowDisabled/);
  assert.match(grid,/const disabled = busy \|\| Boolean\(rowDisabled\?\.\(row\)\)/);
  assert.match(page,/rowDisabled=\{r=>!editableRun\|\|isLineLocked\(r\)\}/);
});

test('approval batch snapshots carry employee amounts and dual-actor context',()=>{
  assert.match(migration,/line_snapshot jsonb/);
  assert.match(migration,/gross_snapshot/);
  assert.match(migration,/net_snapshot/);
  assert.match(migration,/private\.fn_current_action_context\(\)/);
  assert.match(migration,/real_actor_employee_id/);
  assert.match(migration,/action_context_id/);
});
