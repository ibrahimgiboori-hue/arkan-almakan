import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICE_BLOCK_KIND,
  OFFICE_SPLIT_POLICY,
  defaultOfficeBlockSpan,
  officeComposition,
  resolveOfficeFieldSpan,
  resolveOfficeSplitPolicy,
} from '../lib/print-office-model.js';

test('information blocks can share a row while summaries use full width', () => {
  assert.equal(defaultOfficeBlockSpan({ kind:'cards' }), 6);
  assert.equal(defaultOfficeBlockSpan({ kind:'totals' }), 12);
  assert.equal(defaultOfficeBlockSpan({ kind:'cards', officeSpan:4 }), 4);
});

test('field spans preserve the 48-unit template grid', () => {
  assert.equal(resolveOfficeFieldSpan({ span:12 }, {}), 12);
  assert.equal(resolveOfficeFieldSpan({}, { fieldColumns:4 }), 12);
  assert.equal(resolveOfficeFieldSpan({}, { fieldColumns:3 }), 16);
  assert.equal(resolveOfficeFieldSpan({}, { fieldColumns:2 }), 24);
});

test('split policy follows Word and Excel semantics', () => {
  assert.equal(resolveOfficeSplitPolicy({ kind:'text' }), OFFICE_SPLIT_POLICY.FLOW);
  assert.equal(resolveOfficeSplitPolicy({ kind:'table' }), OFFICE_SPLIT_POLICY.ROWS);
  assert.equal(resolveOfficeSplitPolicy({ kind:'cards' }), OFFICE_SPLIT_POLICY.KEEP);
});

test('composition emits semantic blocks without page geometry', () => {
  const blocks = officeComposition([
    { id:'meta', kind:'cards' },
    { id:'summary', kind:'totals' },
    { id:'body', kind:'text', key:'body' },
    { id:'lines', kind:'table' },
  ]);

  assert.deepEqual(blocks.map((block) => block.kind), [
    OFFICE_BLOCK_KIND.INFO,
    OFFICE_BLOCK_KIND.SUMMARY,
    OFFICE_BLOCK_KIND.PROSE,
    OFFICE_BLOCK_KIND.TABLE,
  ]);
  assert.deepEqual(blocks.map((block) => block.span), [6,12,12,12]);
  assert.deepEqual(blocks.map((block) => block.split), ['keep','keep','flow','rows']);
});
