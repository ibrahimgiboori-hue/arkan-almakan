import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const assets = {
  projects: read('public/skin/signature/projects.svg'),
  finance: read('public/skin/signature/finance.svg'),
  workforce: read('public/skin/signature/workforce.svg'),
  documents: read('public/skin/signature/documents.svg'),
  admin: read('public/skin/signature/admin.svg'),
  login: read('public/skin/signature/login-architecture.svg'),
};

const skin = read('app/ui-signature-skin.css');

test('Signature contextual art is dimensional rather than retired line-only decoration', () => {
  for (const [name, asset] of Object.entries(assets)) {
    assert.match(asset, /linearGradient|radialGradient/, `${name} needs tonal depth`);
    assert.match(asset, /feDropShadow|filter id=/, `${name} needs dimensional separation`);
    assert.match(asset, /fill=/, `${name} needs filled visual masses`);
  }
});

test('finance art keeps the agreed Riyal, Dollar and Euro language', () => {
  assert.match(assets.finance, /ر\.س/);
  assert.match(assets.finance, />\$</);
  assert.match(assets.finance, />€</);
});

test('workforce and project art remain operationally contextual', () => {
  assert.match(assets.workforce, /helmet|vest/);
  assert.match(assets.projects, /windows|tower|crane|stone|glass/);
});

test('the approved contextual assets remain wired to the Signature skin only', () => {
  assert.match(skin, /url\('\/skin\/signature\/projects\.svg'\)/);
  assert.match(skin, /url\('\/skin\/signature\/finance\.svg'\)/);
  assert.match(skin, /url\('\/skin\/signature\/workforce\.svg'\)/);
  assert.match(skin, /url\('\/skin\/signature\/documents\.svg'\)/);
  assert.match(skin, /url\('\/skin\/signature\/admin\.svg'\)/);
  assert.match(skin, /url\('\/skin\/signature\/login-architecture\.svg'\)/);
});
