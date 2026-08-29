import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(`[action-context-governance] ${message}`); };
const requireText = (file, text, message) => {
  const source = read(file);
  if (!source.includes(text)) fail(message || `${file} must include ${text}`);
  return source;
};

const coreMigration = 'supabase/migrations/20260829204500_primary_on_behalf_action_context.sql';
const approvalAlignmentMigration = 'supabase/migrations/20260829223000_align_on_behalf_approval_execution.sql';
const operationalPropagationMigration = 'supabase/migrations/20260829224000_propagate_action_context_to_operational_events.sql';
const invariantMigration = 'supabase/migrations/20260829225000_normalize_primary_action_context_invariants.sql';
const layout = 'app/dashboard/layout.js';
const settingsLayout = 'app/dashboard/settings/layout.js';
const control = 'components/account/PrimaryActionModeSettings.js';
const model = 'lib/action-context.js';

for (const file of [
  coreMigration,
  approvalAlignmentMigration,
  operationalPropagationMigration,
  invariantMigration,
  layout,
  settingsLayout,
  control,
  model,
]) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing required core file: ${file}`);
}

requireText(coreMigration, 'alter table public.system_access_settings', 'special mode must live in the existing primary-user core settings, not a side store');
requireText(coreMigration, 'private.fn_current_action_context()', 'database must expose one canonical action context resolver');
requireText(coreMigration, 'public.fn_set_my_action_context', 'primary account must have one governed state transition RPC');
requireText(coreMigration, 'system_actor_user_id', 'audit trail must preserve the system registrant');
requireText(coreMigration, 'real_actor_employee_id', 'audit trail must preserve the real actor');
requireText(coreMigration, 'action_context_id', 'on-behalf actions must be grouped by an immutable context id');
requireText(coreMigration, 'create or replace function public.fn_audit()', 'generic audit trigger must consume the action context centrally');
requireText(coreMigration, 'public.fn_is_primary_user()', 'authority must remain anchored to the real signed-in primary account');

requireText(approvalAlignmentMigration, 'private.fn_current_actor_can_take_approval_step', 'approval inbox and decisions must share one effective-actor rule');
requireText(approvalAlignmentMigration, 'create or replace function public.fn_my_approval_inbox()', 'My Approvals must follow the current real actor');
requireText(approvalAlignmentMigration, 'create or replace function public.fn_approval_decide', 'approval execution must use the same actor rule as visibility');
requireText(approvalAlignmentMigration, 'origin_real_actor_employee_id', 'workflow origin must preserve the real actor');

for (const table of [
  'financial_case_events',
  'workspace_task_events',
  'procedure_runtime_events',
  'transaction_movements',
  'labor_assignment_audit',
  'financial_reconciliation_audit',
  'budget_reserve_movements',
  'budget_period_cash_events',
  'treasury_movements',
  'project_change_events',
  'transaction_action_envelopes',
  'workspace_tasks',
]) {
  requireText(operationalPropagationMigration, `public.${table}`, `${table} must receive central action-context propagation`);
}
requireText(operationalPropagationMigration, 'private.fn_stamp_generic_action_context', 'operational action records must use one generic context stamper');

requireText(invariantMigration, 'private.fn_guard_primary_action_context_settings', 'database must guard impossible action-context states');
requireText(invariantMigration, "new.primary_action_mode:='self'", 'self-target must normalize to self mode');
requireText(invariantMigration, 'p_real_actor_employee_id is distinct from v_primary_employee_id', 'RPC must never create self-delegation');
requireText(invariantMigration, 'settings.primary_acting_for_employee_id is distinct from me.employee_id', 'canonical resolver must distrust stale self-delegation state');

const controlSource = requireText(control, "supabase.rpc('fn_set_my_action_context'", 'settings control must use the canonical RPC');
if (controlSource.includes('localStorage') || controlSource.includes('sessionStorage')) {
  fail('on-behalf state must never be stored as a browser-only side state');
}
requireText(control, 'representableEmployees', 'UI must distinguish the account owner from representable people');
requireText(control, "employee.id !== primaryEmployeeId", 'the primary account owner must not appear as an on-behalf target');
requireText(control, 'المُسجّل النظامي', 'UI must explain the separation between registrant and real actor');

requireText(settingsLayout, 'PrimaryActionModeSettings', 'primary action mode control must be mounted inside Settings');
requireText(layout, "supabase.rpc('fn_my_action_context'", 'dashboard shell must load the canonical action context');
requireText(layout, 'data-action-context-banner', 'dashboard must visibly announce active on-behalf mode');
requireText(layout, 'data-action-mode', 'dashboard root must expose the active execution mode to all portal surfaces');
requireText(model, "ON_BEHALF_OF: 'on_behalf_of'", 'client code must share one action-mode vocabulary');
requireText(model, 'requestedRealActorEmployeeId !== systemActorEmployeeId', 'client model must normalize impossible self-delegation too');

console.log('Action context governance audit passed: authority, attribution, approvals, operational events and self-mode invariants are centrally aligned.');
