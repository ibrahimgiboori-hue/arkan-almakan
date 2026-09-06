import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const editor = fs.readFileSync(new URL('../app/dashboard/quotes/[id]/terms/page.js', import.meta.url), 'utf8');
const print = fs.readFileSync(new URL('../app/print/quote/[id]/page.js', import.meta.url), 'utf8');

test('blank general-term draft rows are not persisted as printable terms', () => {
  assert.match(editor, /function hasTermContent\(item\)/);
  assert.match(editor, /const persistedItems = nextItems\.filter\(hasTermContent\)/);
  assert.match(editor, /show_terms: persistedItems\.length > 0/);
});

test('quotation print defensively removes empty general terms', () => {
  assert.match(print, /function hasTermContent\(term\)/);
  assert.match(print, /terms_structured\)\?q\.terms_structured:\[\]\)\.filter\(hasTermContent\)/);
  assert.match(print, /q\.show_terms&&termItems\.length/);
});
