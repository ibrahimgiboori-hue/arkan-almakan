import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync('supabase/migrations/20260829204500_primary_on_behalf_action_context.sql','utf8');
const approvalAlignment = fs.readFileSync('supabase/migrations/20260829223000_align_on_behalf_approval_execution.sql','utf8');
const operationalPropagation = fs.readFileSync('supabase/migrations/20260829224000_propagate_action_context_to_operational_events.sql','utf8');
const invariants = fs.readFileSync('supabase/migrations/20260829225000_normalize_primary_action_context_invariants.sql','utf8');
const layout = fs.readFileSync('app/dashboard/layout.js','utf8');
const control = fs.readFileSync('components/account/PrimaryActionModeSettings.js','utf8');
const model = fs.readFileSync('lib/action-context.js','utf8');

test('on-behalf mode is persisted centrally and never in browser side state', () => {
  assert.match(core, /alter table public\.system_access_settings/);
  assert.match(core, /primary_action_mode/);
  assert.match(core, /primary_acting_for_employee_id/);
  assert.doesNotMatch(control, /localStorage|sessionStorage/);
});

test('authority stays with signed-in primary while attribution is dual actor', () => {
  assert.match(core, /public\.fn_is_primary_user\(\)/);
  assert.match(core, /system_actor_user_id/);
  assert.match(core, /real_actor_employee_id/);
  assert.match(core, /action_context_id/);
  assert.match(core, /create or replace function public\.fn_audit\(\)/);
});

test('approval visibility and execution use the same effective actor rule', () => {
  assert.match(approvalAlignment, /private\.fn_current_actor_can_take_approval_step/);
  assert.match(approvalAlignment, /create or replace function public\.fn_my_approval_inbox\(\)/);
  assert.match(approvalAlignment, /create or replace function public\.fn_approval_decide/);
  assert.match(approvalAlignment, /origin_real_actor_employee_id/);
});

test('operational event ledgers receive the same action context', () => {
  assert.match(operationalPropagation, /private\.fn_stamp_generic_action_context/);
  for (const table of [
    'financial_case_events','workspace_task_events','procedure_runtime_events',
    'transaction_movements','labor_assignment_audit','treasury_movements',
    'project_change_events','transaction_action_envelopes','workspace_tasks',
  ]) assert.match(operationalPropagation, new RegExp(`public\\.${table}`));
});

test('self delegation is normalized to ordinary self mode at every layer', () => {
  assert.match(invariants, /private\.fn_guard_primary_action_context_settings/);
  assert.match(invariants, /p_real_actor_employee_id is distinct from v_primary_employee_id/);
  assert.match(invariants, /settings\.primary_acting_for_employee_id is distinct from me\.employee_id/);
  assert.match(control, /representableEmployees/);
  assert.match(control, /employee\.id !== primaryEmployeeId/);
  assert.match(model, /requestedRealActorEmployeeId !== systemActorEmployeeId/);
  assert.doesNotMatch(control, /إبراهيم الجبوري يظهر ضمن القائمة مثل أي شخص آخر/);
});

test('special mode remains visible across dashboard and controlled only from settings', () => {
  assert.match(layout, /data-action-context-banner/);
  assert.match(layout, /data-action-mode/);
  assert.match(control, /تفعيل تنفيذ نيابة عن/);
  assert.match(model, /ON_BEHALF_OF: 'on_behalf_of'/);
  assert.match(control, /هذا الشخص لا يظهر كخيار «نيابة عن»/);
});
