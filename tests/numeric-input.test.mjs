import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeStoredNumber,
  numericDraftNeedsWrite,
  parseNumericDraft,
} from '../lib/numeric-input.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('a decimal being typed is never silently truncated', () => {
  // هذا هو الخلل الأصلي حرفيًا: Number('12.') === 12 فتُبتلع النقطة أثناء الكتابة.
  assert.equal(Number('12.'), 12);
  assert.deepEqual(parseNumericDraft('12.5'), { valid:true, value:12.5 });
  assert.deepEqual(parseNumericDraft('0.001'), { valid:true, value:0.001 });
  assert.deepEqual(parseNumericDraft('.5'), { valid:true, value:0.5 });
});

test('a trailing decimal point at commit time means the whole number', () => {
  assert.deepEqual(parseNumericDraft('12.'), { valid:true, value:12 });
});

test('empty is a valid intentional null, not zero', () => {
  assert.deepEqual(parseNumericDraft(''), { valid:true, value:null });
  assert.deepEqual(parseNumericDraft('   '), { valid:true, value:null });
  assert.deepEqual(parseNumericDraft('', { allowEmpty:false }), { valid:false, value:null });
});

test('nonsense never becomes a silent zero', () => {
  // القديم كان Number(x || 0) فيحوّل كل خطأ إلى صفر يُكتب في قاعدة البيانات.
  for (const bad of ['abc', '1.2.3', '--5', '1e5', '٥', '+', '-']) {
    assert.deepEqual(parseNumericDraft(bad), { valid:false, value:null }, bad);
  }
});

test('stored values are normalized without interpreting user text', () => {
  assert.equal(normalizeStoredNumber(null), null);
  assert.equal(normalizeStoredNumber(''), null);
  assert.equal(normalizeStoredNumber(undefined), null);
  assert.equal(normalizeStoredNumber('12.5'), 12.5);
  assert.equal(normalizeStoredNumber(0), 0);
});

test('an unchanged value never triggers a database write', () => {
  assert.deepEqual(numericDraftNeedsWrite('12.5', 12.5), { write:false, valid:true, value:12.5 });
  assert.deepEqual(numericDraftNeedsWrite('12.50', 12.5), { write:false, valid:true, value:12.5 });
  assert.deepEqual(numericDraftNeedsWrite('', null), { write:false, valid:true, value:null });
  assert.deepEqual(numericDraftNeedsWrite('12.5', 12), { write:true, valid:true, value:12.5 });
  assert.deepEqual(numericDraftNeedsWrite('abc', 12), { write:false, valid:false, value:null });
});

test('zero is a real value and is distinguished from empty', () => {
  assert.deepEqual(parseNumericDraft('0'), { valid:true, value:0 });
  assert.deepEqual(numericDraftNeedsWrite('0', null), { write:true, valid:true, value:0 });
  assert.deepEqual(numericDraftNeedsWrite('', 0), { write:true, valid:true, value:null });
});

test('the scope table cannot reintroduce per-keystroke numeric writes', () => {
  const scope = read('components/ProjScope.js');
  for (const field of ['contract_qty', 'sell_price', 'budget_cost']) {
    assert.equal(
      new RegExp(`onChange=\\{\\(e\\)=>upd\\(l\\.id,\\{${field}:`).test(scope),
      false,
      `${field} must commit through NumericField, not on every keystroke`,
    );
  }
  assert.equal(scope.includes("import NumericField from '@/components/NumericField'"), true);
});
