import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const skin = read('app/ui-signature-project-surface-contrast.css');
const rootLayout = read('app/layout.js');

test('strict project foreground contract loads after operation scenes', () => {
  const sceneIndex = rootLayout.indexOf("./ui-signature-project-scenes.css");
  const contrastIndex = rootLayout.indexOf("./ui-signature-project-surface-contrast.css");
  assert.ok(sceneIndex >= 0 && contrastIndex > sceneIndex);
});

test('expense canvas cannot collapse back to a flat ivory surface', () => {
  assert.match(skin, /data-signature-project-scene='expenses'/);
  assert.match(skin, /--signature-photo-finance/);
  assert.match(skin, /var\(--signature-project-scene-photo\)/);
  assert.match(skin, /workSheetMount/);
  assert.match(skin, /background-attachment: scroll, scroll, scroll/);
});

test('project tables and forms keep a strong readable foreground above photography', () => {
  assert.match(skin, /\[data-work-ledger='true'\]/);
  assert.match(skin, /\[data-ui-role='table'\]/);
  assert.match(skin, /\[data-ui-slot='form'\]/);
  assert.match(skin, /backdrop-filter: blur\(18px\)/);
  assert.match(skin, /table thead th/);
  assert.match(skin, /table tbody td/);
  assert.match(skin, /:is\(input, select, textarea\)/);
});

test('foreground contract is screen-only and cannot alter print', () => {
  assert.match(skin, /@media screen/);
  assert.doesNotMatch(skin, /@media print/);
  assert.doesNotMatch(skin, /ConstitutionPagedFrame|PrintMarks|print-governance/);
});
