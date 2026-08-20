import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSiteCommand } from '../lib/site-operation-command.js';

const contractor = {
  id:'jassas',
  name_ar:'الجساس',
  operation_alias:'الجساس',
  meals_charge_to:'contractor',
  transport_charge_to:'contractor',
  housing_charge_to:'contractor',
  tools_charge_to:'contractor',
};
const context = { contractors:[contractor], workers:[], items:[] };

test('contractor-paid custody remains fully due to the contractor', () => {
  const parsed = parseSiteCommand('الجساس عهدة حشيش 300', context);
  assert.equal(parsed.kind, 'expense');
  assert.equal(parsed.payer, 'contractor');
  assert.equal(parsed.category, 'عهدة');
  assert.equal(parsed.is_recoverable, false);
});

test('only an Arkan-paid refundable amount is marked recoverable for Arkan', () => {
  const parsed = parseSiteCommand('الجساس ضمان مسترد 300 من عهدة أركان', context);
  assert.equal(parsed.kind, 'expense');
  assert.equal(parsed.payer, 'arkan_custody');
  assert.equal(parsed.is_recoverable, true);
});
