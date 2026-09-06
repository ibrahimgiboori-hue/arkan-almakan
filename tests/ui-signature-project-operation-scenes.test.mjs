import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const runtime = read('components/ui/SignatureProjectSceneRuntime.js');
const skin = read('app/ui-signature-project-scenes.css');
const rootLayout = read('app/layout.js');

const projectScenes = [
  'overview',
  'attendance',
  'labor',
  'daily-output',
  'progress',
  'movements',
  'timesheet-reports',
  'planning',
  'scope',
  'quotes',
  'changes',
  'settings',
  'expenses',
  'custody',
  'payments',
  'claims',
  'guarantees',
  'cost-control',
  'documents',
  'correspondence',
  'materials',
];

test('every project work surface has an explicit Signature photo scene', () => {
  for (const scene of projectScenes) {
    assert.match(runtime, new RegExp(`['\"]${scene}['\"]`), `${scene} must be mapped by route/view`);
    assert.match(skin, new RegExp(`data-signature-project-scene=['\"]${scene}['\"]`), `${scene} must own a CSS scene`);
  }
});

test('project operation scene layer is loaded after the generic Signature photo layer', () => {
  const genericIndex = rootLayout.indexOf("./ui-signature-photo-skin.css");
  const projectIndex = rootLayout.indexOf("./ui-signature-project-scenes.css");
  assert.ok(genericIndex >= 0 && projectIndex > genericIndex);
  assert.match(rootLayout, /SignatureProjectSceneRuntime/);
});

test('project scenes remain screen-only and keep the operational foreground readable', () => {
  assert.match(skin, /@media screen/);
  assert.doesNotMatch(skin, /@media print/);
  assert.match(skin, /appBodyStage/);
  assert.match(skin, /workSheetMount::before/);
  assert.match(skin, /linear-gradient/);
  assert.match(skin, /images\.unsplash\.com/);
});

test('runtime covers query views and project operation routes without touching business data', () => {
  for (const view of ['overview','scope','progress','claims','guarantees','docs','settings']) {
    assert.match(runtime, new RegExp(`${view}:`));
  }
  for (const route of [
    '/operations/labor', '/operations/output', '/operations/movements', '/operations/reports',
    '/operations/expenses', '/operations/custody', '/operations/finance', '/insights/planning',
    '/insights/changes', '/insights/cost-control', '/insights/correspondence', '/quotes', '/operations',
  ]) {
    assert.ok(runtime.includes(route), `${route} must resolve to a scene`);
  }
  assert.doesNotMatch(runtime, /supabase|fetch\(|insert\(|update\(|delete\(/i);
});
