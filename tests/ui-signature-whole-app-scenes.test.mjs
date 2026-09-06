import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runtime = read('components/ui/SignatureAppSceneRuntime.js');
const skin = read('app/ui-signature-app-scenes.css');
const layout = read('app/layout.js');

const visibleRoutes = [
  '/dashboard', '/dashboard/my-work', '/dashboard/approvals',
  '/dashboard/projects', '/dashboard/quotes', '/dashboard/contractors', '/dashboard/entities',
  '/dashboard/employees', '/dashboard/attendance', '/dashboard/recruitment',
  '/dashboard/recruitment/offers', '/dashboard/recruitment/contracts', '/dashboard/recruitment/onboarding',
  '/dashboard/leaves', '/dashboard/leave-history-import',
  '/dashboard/advances', '/dashboard/operating-budget',
  '/dashboard/documents', '/dashboard/archive', '/dashboard/register', '/dashboard/formbuilder',
  '/dashboard/board', '/dashboard/settings', '/dashboard/system-user', '/dashboard/org-structure', '/dashboard/backup',
];

test('every visible non-project portal route has a contextual Signature scene', () => {
  for (const route of visibleRoutes) {
    assert.ok(runtime.includes(route), `${route} must map to a scene`);
  }
});

test('whole-app scene runtime yields to project-detail scene runtime', () => {
  assert.match(runtime, /dashboard\\\/projects\\\/\[\^\/\]\+/);
  assert.match(runtime, /return null/);
  assert.doesNotMatch(runtime, /supabase|insert\(|update\(|delete\(|fetch\(/i);
});

test('whole-app photography is screen-only and foreground surfaces stay readable', () => {
  assert.match(skin, /@media screen/);
  assert.doesNotMatch(skin, /@media print/);
  assert.match(skin, /images\.unsplash\.com/);
  assert.match(skin, /workSheetMount/);
  assert.match(skin, /table thead th/);
  assert.match(skin, /table tbody td/);
  assert.match(skin, /input, select, textarea/);
  assert.match(skin, /backdrop-filter/);
  assert.match(skin, /signature-app-scene-fallback/);
});

test('whole-app scene layer loads before project-specific overrides', () => {
  const appIndex = layout.indexOf("./ui-signature-app-scenes.css");
  const projectIndex = layout.indexOf("./ui-signature-project-scenes.css");
  const contrastIndex = layout.indexOf("./ui-signature-project-surface-contrast.css");
  assert.ok(appIndex >= 0 && projectIndex > appIndex && contrastIndex > projectIndex);
  assert.match(layout, /SignatureAppSceneRuntime/);
  assert.match(layout, /SignatureProjectSceneRuntime/);
});
