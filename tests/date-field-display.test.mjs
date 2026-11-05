import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_FIELD_HINTS, dateFieldDisplay, formatDateFieldValue, isOverlaidDateType } from '../lib/date-field-display.mjs';

const strip = (text) => text.replace(/[\u2066-\u2069]/g, '');

test('only date and datetime-local fields are overlaid', () => {
  assert.equal(isOverlaidDateType('date'), true);
  assert.equal(isOverlaidDateType('DATETIME-LOCAL'), true);
  for (const type of ['time', 'month', 'week', 'text', 'number', '', undefined]) assert.equal(isOverlaidDateType(type), false);
  assert.deepEqual(dateFieldDisplay({ type: 'time', value: '' }), { mode: 'off', display: '' });
});

test('an empty date field shows a correctly written Arabic hint, or its own placeholder', () => {
  assert.deepEqual(dateFieldDisplay({ type: 'date' }), { mode: 'hint', display: 'يوم/شهر/سنة' });
  assert.deepEqual(dateFieldDisplay({ type: 'date', placeholder: '  تاريخ الإصدار ' }), { mode: 'hint', display: 'تاريخ الإصدار' });
  assert.equal(dateFieldDisplay({ type: 'datetime-local' }).display, DATE_FIELD_HINTS['datetime-local']);
});

test('a filled date shows the system format dd/mm/yyyy with Latin digits, isolated left-to-right', () => {
  const shown = dateFieldDisplay({ type: 'date', value: '2026-11-05' });
  assert.equal(shown.mode, 'value');
  assert.equal(strip(shown.display), '05/11/2026');
  assert.match(shown.display, /^\u2066.*\u2069$/);
  assert.equal(strip(dateFieldDisplay({ type: 'datetime-local', value: '2026-01-31T07:05' }).display), '31/01/2026 07:05');
});

test('while the user is typing, the browser keeps drawing the field', () => {
  assert.deepEqual(dateFieldDisplay({ type: 'date', value: '', editing: true }), { mode: 'off', display: '' });
  assert.deepEqual(dateFieldDisplay({ type: 'date', value: '2026-11-05', editing: true }), { mode: 'off', display: '' });
});

test('unexpected value shapes fall back to the native drawing instead of guessing', () => {
  assert.equal(formatDateFieldValue('date', '05/11/2026'), '');
  assert.equal(formatDateFieldValue('datetime-local', '2026-11-05'), '');
  assert.deepEqual(dateFieldDisplay({ type: 'date', value: 'garbage' }), { mode: 'off', display: '' });
});
