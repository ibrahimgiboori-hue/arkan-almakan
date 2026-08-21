import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateQuoteBlocks } from '../lib/quote-pagination.mjs';

const row = (id, height, kind = 'item') => ({
  block: { id, kind: 'row', line: { id, kind } },
  height,
});

const paginate = (entries, options = {}) => {
  const blocks = entries.map(({ block }) => block);
  const heights = Object.fromEntries(entries.map(({ block, height }) => [block.id, height]));
  return paginateQuoteBlocks({
    blocks,
    heights,
    availableHeight: options.availableHeight ?? 100,
    tableHeaderHeight: options.tableHeaderHeight ?? 10,
  });
};

test('keeps each quotation row atomic and preserves its order', () => {
  const result = paginate([
    row('row-1', 35),
    row('row-2', 70),
    row('row-3', 25),
  ]);

  assert.deepEqual(
    result.pages.map((page) => page.map(({ id }) => id)),
    [['row-1'], ['row-2'], ['row-3']],
  );
  assert.deepEqual(result.pages.flat().map(({ id }) => id), ['row-1', 'row-2', 'row-3']);
});

test('charges a repeated item-table header exactly once after a page break', () => {
  const result = paginate([
    row('row-1', 40),
    row('row-2', 40),
    row('row-3', 40),
    row('row-4', 40),
  ], { availableHeight: 95, tableHeaderHeight: 15 });

  assert.deepEqual(
    result.pages.map((page) => page.map(({ id }) => id)),
    [['row-1', 'row-2'], ['row-3', 'row-4']],
  );
});

test('moves a title row with its first child instead of orphaning the title', () => {
  const result = paginate([
    row('row-before', 65),
    row('row-title', 10, 'title'),
    row('row-child', 20),
  ]);

  assert.deepEqual(
    result.pages.map((page) => page.map(({ id }) => id)),
    [['row-before'], ['row-title', 'row-child']],
  );
});

test('reports an impossible oversize row but still never fragments it', () => {
  const result = paginate([row('row-long', 95)], {
    availableHeight: 100,
    tableHeaderHeight: 10,
  });

  assert.deepEqual(result.pages.map((page) => page.map(({ id }) => id)), [['row-long']]);
  assert.deepEqual(result.oversizeBlockIds, ['row-long']);
});

test('keeps non-table blocks atomic and does not create empty pages', () => {
  const entries = [
    { block: { id: 'intro', kind: 'intro' }, height: 60 },
    { block: { id: 'terms', kind: 'terms' }, height: 55 },
  ];
  const result = paginate(entries);

  assert.deepEqual(
    result.pages.map((page) => page.map(({ id }) => id)),
    [['intro'], ['terms']],
  );
  assert.ok(result.pages.every((page) => page.length > 0));
});
