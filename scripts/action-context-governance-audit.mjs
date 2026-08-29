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

const migration = 'supabase/migrations/20260829204500_primary_on_behalf_action_context.sql';
const layout = 'app/dashboard/layout.js';
const settingsLayout = 'app/dashboard/settings/layout.js';
const control = 'components/account/PrimaryActionModeSettings.js';
const model = 'lib/action-context.js';

for (const file of [migration, layout, settingsLayout, control, model]) {
  if (!fs.existsSync(path.join(root, file))) fail(`missing required core file: ${file}`);
}

requireText(migration, 'alter table public.system_access_settings', 'special mode must live in the existing primary-user core settings, not a side store');
requireText(migration, 'primary_action_mode', 'primary action mode must be persisted centrally');
requireText(migration, 'private.fn_current_action_context()', 'database must expose one canonical action context resolver');
requireText(migration, 'public.fn_set_my_action_context', 'primary account must have one governed state transition RPC');
requireText(migration, 'system_actor_user_id', 'audit trail must preserve the system registrant');
requireText(migration, 'real_actor_employee_id', 'audit trail must preserve the real actor');
requireText(migration, 'action_context_id', 'on-behalf actions must be grouped by an immutable context id');
requireText(migration, 'alter table public.approval_workflow_steps', 'canonical approvals must carry real-actor context');
requireText(migration, 'alter table public.approval_workflow_events', 'approval events must carry real-actor context');
requireText(migration, 'alter table public.approvals', 'approval ledger must carry real-actor context');
requireText(migration, 'create or replace function public.fn_audit()', 'generic audit trigger must consume the action context centrally');
requireText(migration, 'public.fn_is_primary_user()', 'authority must remain anchored to the real signed-in primary account');
requireText(migration, 'create or replace function public.fn_my_approval_inbox()', 'primary user inbox must expose user-targeted approvals too');

const controlSource = requireText(control, "supabase.rpc('fn_set_my_action_context'", 'settings control must use the canonical RPC');
if (controlSource.includes('localStorage') || controlSource.includes('sessionStorage')) {
  fail('on-behalf state must never be stored as a browser-only side state');
}
requireText(control, 'تفعيل تنفيذ نيابة عن', 'primary settings must expose an explicit activation control');
requireText(control, 'المُسجّل النظامي', 'UI must explain the separation between registrant and real actor');

requireText(settingsLayout, 'PrimaryActionModeSettings', 'primary action mode control must be mounted inside Settings');
requireText(layout, "supabase.rpc('fn_my_action_context'", 'dashboard shell must load the canonical action context');
requireText(layout, 'data-action-context-banner', 'dashboard must visibly announce active on-behalf mode');
requireText(layout, 'data-action-mode', 'dashboard root must expose the active execution mode to all portal surfaces');
requireText(model, "ON_BEHALF_OF: 'on_behalf_of'", 'client code must share one action-mode vocabulary');

console.log('Action context governance audit passed: primary on-behalf mode is central, visible, and dual-actor audited.');
