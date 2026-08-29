import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const constitution = fs.readFileSync('lib/interface-constitution.js','utf8');
const runtime = fs.readFileSync('components/ui/WorkSurfaceRuntime.js','utf8');
const action = fs.readFileSync('components/ui/ProgramAction.js','utf8');
const kernel = fs.readFileSync('components/ui/WorkSheetKernel.js','utf8');

test('interface is defined as an operational notebook, not a card dashboard skin', () => {
  assert.match(constitution, /metaphor: 'operational-notebook'/);
  assert.match(constitution, /page: 'continuous-work-sheet'/);
  assert.match(constitution, /section: 'flow-first-boundary-only-when-needed'/);
  assert.match(constitution, /table: 'semantic-ledger-inline-edit'/);
});

test('permissions, audit and print are core policies rather than page-local inventions', () => {
  assert.match(constitution, /permissions: 'session-and-core-resolved'/);
  assert.match(constitution, /audit: 'system-actor-plus-real-actor'/);
  assert.match(constitution, /print: 'same-content-through-print-constitution'/);
  assert.doesNotMatch(action, /supabase|v_my_capabilities|fn_is_primary_user/);
  assert.match(action, /useDashboardSession/);
});

test('global work behavior is owned by runtime', () => {
  assert.match(runtime, /interfaceDataAttributes/);
  assert.match(runtime, /event\.key === '\/'/);
  assert.match(runtime, /event\.key === 'Escape'/);
  assert.match(runtime, /data-page-command-trigger/);
});

test('every page is mounted on the shared work-sheet geometry', () => {
  assert.match(kernel, /data-work-sheet="true"/);
  assert.match(kernel, /data-work-header="true"/);
  assert.match(kernel, /data-work-section="true"/);
  assert.match(kernel, /data-work-ledger="true"/);
  assert.match(kernel, /data-work-dock="true"/);
});

test('governed actions carry semantics instead of being anonymous buttons', () => {
  assert.match(action, /defineInterfaceAction/);
  assert.match(action, /data-program-action="true"/);
  assert.match(action, /data-action-kind/);
  assert.match(action, /data-action-risk/);
  assert.match(action, /data-action-placement/);
  assert.match(action, /data-action-capability/);
});
