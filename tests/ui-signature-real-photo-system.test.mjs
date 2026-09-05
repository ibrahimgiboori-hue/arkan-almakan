import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const layout = read('app/layout.js');
const photos = read('app/ui-signature-photo-skin.css');

test('real-photo Signature layer loads after the approved tuxedo tailoring', () => {
  const tailoring = layout.indexOf("import './ui-signature-tailoring.css';");
  const photoLayer = layout.indexOf("import './ui-signature-photo-skin.css';");
  assert.ok(tailoring >= 0);
  assert.ok(photoLayer > tailoring);
});

test('all five work portals have real photographic context sources', () => {
  for (const key of ['projects', 'workforce', 'finance', 'documents', 'admin']) {
    assert.match(photos, new RegExp(`--signature-photo-${key}:\\s*url\\('https://`));
    assert.match(photos, new RegExp(`data-portal-key='${key}'`));
  }
});

test('the whole application background follows active portal context', () => {
  assert.match(photos, /--signature-context-photo:/);
  assert.match(photos, /\.appBodyStage/);
  assert.match(photos, /var\(--signature-context-photo\)/);
  assert.match(photos, /aria-label='المشاريع'/);
  assert.match(photos, /aria-label='المالية'/);
  assert.match(photos, /aria-label='الموارد البشرية'/);
  assert.match(photos, /aria-label='المستندات'/);
  assert.match(photos, /aria-label='الإدارة'/);
});

test('home and login use a real Riyadh photograph instead of generated skyline art', () => {
  assert.match(photos, /--signature-photo-home:\s*url\('https:\/\/images\.unsplash\.com\/photo-1674822858255-fcc093a1ef43/);
  assert.match(photos, /data-ui-part='auth-hero'/);
  assert.doesNotMatch(photos, /login-architecture\.svg/);
});

test('photo surfaces remain screen-only and print stays outside this layer', () => {
  assert.match(photos, /@media screen/);
  assert.doesNotMatch(photos, /@media print/);
  assert.doesNotMatch(photos, /ConstitutionPagedFrame|PRINT_WORD_STANDARD|print-governance/);
});
