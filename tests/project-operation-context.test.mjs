import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveOperationalDate,
  normalizeProjectOperationContext,
  projectOperationContextKey,
  readProjectOperationContext,
  writeProjectOperationContext,
} from '../lib/project-operation-context.mjs';

function storage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test('operation context is project-scoped', () => {
  assert.equal(projectOperationContextKey('P1'), 'arkan.project.ops.context.P1');
  assert.notEqual(projectOperationContextKey('P1'), projectOperationContextKey('P2'));
});

test('operation context migrates old per-project keys while keeping them mirrored during transition', () => {
  const s = storage({
    'arkan.project.ops.date.P1': '2026-08-10',
    'arkan.project.ops.contractor.P1': 'C7',
  });
  assert.deepEqual(readProjectOperationContext('P1', s), { date: '2026-08-10', contractorId: 'C7', from: '2026-08-01', to: '2026-08-10', search: '' });
  writeProjectOperationContext('P1', { date: '2026-08-11', to: '2026-08-11' }, s);
  const saved = JSON.parse(s.getItem('arkan.project.ops.context.P1'));
  assert.deepEqual(saved, { date: '2026-08-11', contractorId: 'C7', from: '2026-08-01', to: '2026-08-11', search: '' });
  assert.equal(s.getItem('arkan.project.ops.date.P1'), '2026-08-11');
  assert.equal(s.getItem('arkan.project.ops.contractor.P1'), 'C7');
});

test('clearing contractor mirrors the empty state instead of leaving a stale legacy choice', () => {
  const s = storage({
    'arkan.project.ops.context.P1': JSON.stringify({ date: '2026-08-12', contractorId: 'C7' }),
    'arkan.project.ops.contractor.P1': 'C7',
  });
  writeProjectOperationContext('P1', { contractorId: '' }, s);
  assert.equal(s.getItem('arkan.project.ops.contractor.P1'), null);
  assert.deepEqual(JSON.parse(s.getItem('arkan.project.ops.context.P1')), { date: '2026-08-12', contractorId: '', from: '2026-08-01', to: '2026-08-12', search: '' });
});

test('normalization rejects malformed dates without losing contractor', () => {
  const value = normalizeProjectOperationContext({ date: 'not-a-date', contractorId: 'C1' }, '2026-08-26');
  assert.deepEqual(value, { date: '2026-08-26', contractorId: 'C1', from: '2026-08-01', to: '2026-08-26', search: '' });
});

test('one filter for every project sheet: a period, a contractor (or all) and a search', async () => {
  const { projectOperationPeriod, projectOperationDays } = await import('../lib/project-operation-context.mjs');
  const value = normalizeProjectOperationContext({ date: '2026-11-09', from: '2026-11-20', to: '2026-11-05', search: 'أحمد' });
  assert.deepEqual([value.from, value.to, value.contractorId, value.search], ['2026-11-05', '2026-11-05', '', 'أحمد']);
  assert.deepEqual(projectOperationPeriod('month', '2026-11-09'), { from: '2026-11-01', to: '2026-11-09' });
  assert.deepEqual(projectOperationPeriod('last-month', '2026-03-09'), { from: '2026-02-01', to: '2026-02-28' });
  // Arkan's week: Saturday → Thursday. 2026-11-03 is a Tuesday; 2026-10-31 is the Saturday before it.
  assert.deepEqual(projectOperationPeriod('week', '2026-11-03'), { from: '2026-10-31', to: '2026-11-03' });
  assert.deepEqual(projectOperationPeriod('last-week', '2026-11-03'), { from: '2026-10-24', to: '2026-10-29' });
  assert.deepEqual(projectOperationPeriod('week', '2026-10-31'), { from: '2026-10-31', to: '2026-10-31' });
  assert.deepEqual(projectOperationPeriod('week', '2026-11-06'), { from: '2026-10-31', to: '2026-11-06' });
  assert.deepEqual(projectOperationDays('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});

test('operational date movement preserves local calendar semantics', () => {
  assert.equal(moveOperationalDate('2026-08-31', 1), '2026-09-01');
  assert.equal(moveOperationalDate('2026-09-01', -1), '2026-08-31');
});
