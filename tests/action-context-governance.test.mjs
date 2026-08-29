import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260829204500_primary_on_behalf_action_context.sql','utf8');
const layout = fs.readFileSync('app/dashboard/layout.js','utf8');
const control = fs.readFileSync('components/account/PrimaryActionModeSettings.js','utf8');
const model = fs.readFileSync('lib/action-context.js','utf8');

test('on-behalf mode is persisted in the existing primary-user core settings', () => {
  assert.match(migration, /alter table public\.system_access_settings/);
  assert.match(migration, /primary_action_mode/);
  assert.match(migration, /primary_acting_for_employee_id/);
  assert.doesNotMatch(control, /localStorage|sessionStorage/);
});

test('authorization stays with the signed-in primary user while attribution is separate', () => {
  assert.match(migration, /public\.fn_is_primary_user\(\)/);
  assert.match(migration, /system_actor_user_id/);
  assert.match(migration, /real_actor_employee_id/);
  assert.match(migration, /action_context_id/);
  assert.match(migration, /alter table public\.approval_workflow_steps/);
  assert.match(migration, /alter table public\.approval_workflow_events/);
  assert.match(migration, /alter table public\.approvals/);
});

test('special mode is visible across the whole dashboard and controlled from settings', () => {
  assert.match(layout, /data-action-context-banner/);
  assert.match(layout, /data-action-mode/);
  assert.match(control, /تفعيل تنفيذ نيابة عن/);
  assert.match(model, /ON_BEHALF_OF: 'on_behalf_of'/);
});

test('primary account identity is explicit and the primary employee remains selectable as a real actor', () => {
  assert.match(control, /data-primary-account-identity/);
  assert.match(control, /مستخدم الحساب الرئيسي/);
  assert.match(control, /employee\.id === primaryEmployeeId/);
  assert.match(control, /disabled=\{busy\}/);
  assert.doesNotMatch(control, /employees\.filter\([^\n]*primaryEmployeeId/);
});

test('on-behalf mode is explicit and applies to creation, updates and approval stages', () => {
  assert.match(control, /كل إجراء تقوم به في البرنامج — إنشاءً أو تعديلًا أو اعتمادًا أو إتمام أي مرحلة/);
  assert.match(migration, /create or replace function public\.fn_audit\(\)/);
  assert.match(migration, /before insert or update on public\.approval_workflow_steps/);
  assert.match(migration, /before insert on public\.approval_workflow_events/);
  assert.match(migration, /before insert on public\.approvals/);
  assert.match(model, /context\?\.actingMode === ACTION_MODE\.ON_BEHALF_OF/);
});
