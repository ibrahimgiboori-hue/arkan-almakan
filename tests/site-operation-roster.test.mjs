import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentCoversDate, resolveRosterAssignment } from '../lib/site-operation-roster.mjs';

test('keeps an open assignment eligible on and after its start date', () => {
  const row = { id: 'open', valid_from: '2026-07-15', valid_to: null };
  assert.equal(assignmentCoversDate(row, '2026-08-20'), true);
});

test('returns the active historical assignment for the selected paper date', () => {
  const rows = [
    { id: 'old', valid_from: '2026-07-11', valid_to: '2026-07-29' },
    { id: 'new', valid_from: '2026-08-01', valid_to: '2026-08-10' },
  ];
  assert.deepEqual(resolveRosterAssignment(rows, '2026-07-20'), { assignment: rows[0], eligible: true });
});

test('keeps the nearest previous assignment visible outside its period', () => {
  const rows = [
    { id: 'first', valid_from: '2026-07-01', valid_to: '2026-07-10' },
    { id: 'latest', valid_from: '2026-07-11', valid_to: '2026-07-29' },
  ];
  assert.deepEqual(resolveRosterAssignment(rows, '2026-08-20'), { assignment: rows[1], eligible: false });
});

test('keeps an upcoming worker visible before the assignment begins', () => {
  const rows = [
    { id: 'later', valid_from: '2026-08-10', valid_to: null },
    { id: 'sooner', valid_from: '2026-08-01', valid_to: '2026-08-05' },
  ];
  assert.deepEqual(resolveRosterAssignment(rows, '2026-07-20'), { assignment: rows[1], eligible: false });
});
