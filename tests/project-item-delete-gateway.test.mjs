import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scope = read('components/ProjScope.js');
const migration = read('supabase/migrations/20260826190000_explicit_item_execution_cancellation.sql');
const priorMigration = read('supabase/migrations/20260826183000_safe_project_item_delete_gateway.sql');

test('the scope screen never deletes a project item directly', () => {
  assert.equal(/from\(['"]project_items['"]\)\.delete\(/.test(scope), false);
  assert.equal(scope.includes('fn_delete_project_item_safely'), true);
});

test('the delete gateway still refuses to erase operational history', () => {
  for (const marker of [
    'item_execution', 'day_items', 'item_measurements', 'claim_lines',
    'project_cost_allocations', 'contractor_expenses', 'custody_transactions',
    'progress_entries', 'project_change_events',
  ]) {
    assert.equal(migration.includes(marker), true, `gateway must still govern ${marker}`);
  }
  assert.match(migration, /تاريخ تنفيذ بدأ فعليًا/);
});

test('planned assignments are cancelled explicitly, never left to ON DELETE CASCADE', () => {
  // النسخة السابقة كانت تعدّ المخطط وتُبلغ عن إلغائه بلا أي إلغاء فعلي.
  assert.equal(/v_planned_exec\s+integer/.test(priorMigration), true, 'baseline had the phantom counter');
  assert.equal(/delete from public\.item_execution/.test(priorMigration), false, 'baseline never cancelled anything');

  // النسخة الجديدة تلغي فعلًا، وعبر البوابة نفسها لا بمنطق ثانٍ.
  assert.match(migration, /perform public\.fn_cancel_item_execution_assignment\(v_planned_id\)/);
  assert.match(migration, /v_cancelled := v_cancelled \+ 1/);
  assert.match(migration, /'cancelled_planned_assignments', v_cancelled/);
  assert.equal(/'cancelled_planned_assignments', v_planned_exec/.test(migration), false);
});

test('cancellation has exactly one implementation and one canonical name', () => {
  const canonical = migration.indexOf('create or replace function public.fn_cancel_item_execution_assignment');
  const legacy = migration.indexOf('create or replace function public.fn_delete_item_execution_assignment');
  assert.ok(canonical > -1, 'the canonical cancel gateway must exist');
  assert.ok(legacy > canonical, 'the legacy name must be defined after, as a wrapper');

  // الغلاف القديم لا يحمل منطقًا خاصًا به.
  const wrapper = migration.slice(legacy);
  assert.match(wrapper, /return public\.fn_cancel_item_execution_assignment\(p_execution_id\);/);
  assert.equal(/raise exception/.test(wrapper.split('$$;')[0]), false, 'the legacy wrapper must hold no rules of its own');
});

test('the cancel gateway keeps started, ended and worked assignments as history', () => {
  const body = migration.slice(
    migration.indexOf('create or replace function public.fn_cancel_item_execution_assignment'),
    migration.indexOf('create or replace function public.fn_delete_item_execution_assignment'),
  );
  assert.match(body, /v_exec\.start_date is not null/);
  assert.match(body, /v_exec\.end_date is not null/);
  assert.match(body, /from public\.day_items di/);
  assert.match(body, /has_project_capability\('projects\.execution\.edit'/);
});

test('the screen reports the cancellation count it actually received', () => {
  assert.match(scope, /cancelled_planned_assignments/);
  assert.match(scope, /أُلغي معه/);
});

test('the self-applying CI mechanism is gone', () => {
  const workflows = fs.readdirSync(new URL('../.github/workflows', import.meta.url));
  assert.deepEqual(workflows, ['v2-constitution.yml']);
  assert.equal(fs.existsSync(new URL('../.github/patches', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../.github/scope-patch-trigger', import.meta.url)), false);

  const gate = read('.github/workflows/v2-constitution.yml');
  assert.equal(/git push/.test(gate), false, 'CI must verify, never write to the branch');
  assert.equal(/contents:\s*write/.test(gate), false);
});
