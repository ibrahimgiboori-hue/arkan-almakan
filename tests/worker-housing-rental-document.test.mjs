import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/20260906204500_worker_housing_rental_agreement.sql', 'utf8');

test('worker housing rental agreement is a reusable governed document template', () => {
  assert.match(migration, /WORKER_HOUSING_RENTAL_AGREEMENT/);
  assert.match(migration, /worker_housing_rental_agreement/);
  assert.match(migration, /correspondence_governance/);
  assert.match(migration, /governance_admin/);
  assert.match(migration, /عقد إيجار سكن عمال/);
});

test('rental template preserves parties, occupants, clauses and signatures as editable document sections', () => {
  assert.match(migration, /"kind":"parties"/);
  assert.match(migration, /"id":"occupants","kind":"table"/);
  assert.match(migration, /"id":"clause_1","kind":"text"/);
  assert.match(migration, /"id":"clause_5","kind":"text"/);
  assert.match(migration, /الطرف الأول — المؤجر/);
  assert.match(migration, /الطرف الثاني — المستأجر/);
});
