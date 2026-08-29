import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const constitution = fs.readFileSync('lib/work-surface-constitution.js','utf8');
const runtime = fs.readFileSync('components/ui/WorkSurfaceRuntime.js','utf8');
const action = fs.readFileSync('components/ui/ProgramAction.js','utf8');
const kernel = fs.readFileSync('components/ui/WorkSheetKernel.js','utf8');

test('interface is defined as an operational notebook, not a card dashboard skin', () => {
  assert.match(constitution, /metaphor: 'operational-notebook'/);
  assert.match(constitution, /composition: 'continuous-sheet-not-card-dashboard'/);
  assert.match(constitution, /sectionPresentation: 'flow-unless-real-boundary'/);
  assert.match(constitution, /tablePresentation: 'quiet-semantic-ledger-inline-edit'/);
});

test('permissions, attribution and print are core policies rather than page-local inventions', () => {
  assert.match(constitution, /permissionPolicy: 'core-resolved-never-page-invented'/);
  assert.match(constitution, /actionContextPolicy: 'core-resolved-system-actor-and-real-actor'/);
  assert.match(constitution, /printPolicy: 'same-content-through-print-constitution'/);
  assert.doesNotMatch(action, /supabase|v_my_capabilities|fn_is_primary_user/);
  assert.match(action, /useDashboardSession/);
  assert.match(action, /canUseCapability/);
});

test('global work behavior is owned by runtime and the single constitution', () => {
  assert.match(runtime, /surfaceDataAttributes/);
  assert.match(runtime, /data-work-surface-policy/);
  assert.match(runtime, /event\.key === '\/'/);
  assert.match(runtime, /event\.key === 'Escape'/);
  assert.doesNotMatch(runtime, /interfaceDataAttributes/);
});

test('every page is mounted on the shared work-sheet geometry', () => {
  assert.match(kernel, /data-work-sheet="true"/);
  assert.match(kernel, /data-work-header="true"/);
  assert.match(kernel, /data-work-section="true"/);
  assert.match(kernel, /data-work-ledger="true"/);
  assert.match(kernel, /data-work-dock="true"/);
});

test('governed actions carry semantics instead of being anonymous buttons', () => {
  assert.match(action, /defineWorkAction/);
  assert.match(action, /data-program-action="true"/);
  assert.match(action, /data-action-kind/);
  assert.match(action, /data-action-risk/);
  assert.match(action, /data-action-placement/);
  assert.match(action, /data-action-capability/);
});

test('no parallel interface constitution can return beside the notebook core', () => {
  assert.equal(fs.existsSync('lib/interface-constitution.js'), false);
});
