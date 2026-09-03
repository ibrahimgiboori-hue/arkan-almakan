import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const constitution = fs.readFileSync('lib/work-surface-constitution.js','utf8');
const runtime = fs.readFileSync('components/ui/WorkSurfaceRuntime.js','utf8');
const ui = fs.readFileSync('components/ui/ConstitutionUI.js','utf8');
const grid = fs.readFileSync('components/ui/RawGrid.js','utf8');
const projects = fs.readFileSync('app/dashboard/projects/page.js','utf8');
const quotes = fs.readFileSync('app/dashboard/quotes/page.js','utf8');

test('work surface is derived from the existing program constitution rather than a parallel portal map', () => {
  assert.match(constitution, /from '\.\/app-constitution'/);
  assert.match(constitution, /AREAS\.flatMap/);
  assert.match(constitution, /PROJECT_NAV_GROUPS\.flatMap/);
  assert.doesNotMatch(constitution, /export\s+const\s+AREAS\s*=/);
});

test('notebook behavior is a runtime invariant across dashboard routes', () => {
  assert.match(constitution, /program-driven-notebook-v2/);
  assert.match(constitution, /continuous-sheet-not-card-dashboard/);
  assert.match(runtime, /resolveWorkSurface/);
  assert.match(runtime, /data-work-surface-policy/);
  assert.doesNotMatch(runtime, /localStorage|sessionStorage/);
});

test('sections, records and actions use a shared interaction grammar', () => {
  assert.match(ui, /boundary = false/);
  assert.match(ui, /data-work-section-style/);
  assert.match(ui, /function ContextActions/);
  assert.match(ui, /secondary-overflow/);
  assert.match(ui, /function RecordRow/);
  assert.match(ui, /function RecordSummary/);
  assert.match(ui, /function ViewOptions/);
});

test('shared ledger owns semantic cells and keyboard movement', () => {
  assert.match(grid, /data-cell-type/);
  assert.match(grid, /data-grid-field/);
  assert.match(grid, /enter-tab-native/);
  assert.match(grid, /case 'money'/);
  assert.match(grid, /case 'multiline'/);
});

test('representative routes consume the canonical UI core instead of rebuilding dashboard UI and access checks', () => {
  assert.match(projects, /RecordList/);
  assert.match(projects, /RecordSummary/);
  assert.doesNotMatch(projects, /projectCard|projectGrid|v_my_capabilities|fn_is_primary_user|is_system_admin/);

  // Guard ownership, not one historical component choice. A legitimate operation may
  // use ActionDock, ContextActions, TableFrame, WorkField, or another primitive from
  // the same ConstitutionUI family according to its capacity and operational need.
  assert.match(quotes, /from '@\/components\/ui\/ConstitutionUI'/);
  assert.match(quotes, /ConstitutionPage/);
  assert.doesNotMatch(quotes, /className=["']page-head["']|v_my_capabilities|fn_is_primary_user|is_system_admin/);
});
