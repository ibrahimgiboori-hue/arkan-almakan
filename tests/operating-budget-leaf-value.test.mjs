import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const constitution = fs.readFileSync('lib/system-constitution.js', 'utf8');
const contract = fs.readFileSync('lib/operating-budget.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260829020000_operating_budget_leaf_value_constitution.sql', 'utf8');

test('operating budget value originates only from calculation leaves', () => {
  assert.match(constitution, /valueOriginPolicy: 'leaf-calculation-nodes-only'/);
  assert.match(constitution, /aggregationPolicy: 'groups-recursively-sum-descendant-leaf-values'/);
  assert.match(constitution, /forbidGroupStoredAmount: true/);
  assert.match(constitution, /forbidParallelSummaryCalculation: true/);
});

test('group nodes classify and aggregate while item nodes are financial leaves', () => {
  assert.match(contract, /group: Object\.freeze\(\{/);
  assert.match(contract, /carriesOwnValue: false/);
  assert.match(contract, /valueSource: 'recursive-descendant-leaf-sum'/);
  assert.match(contract, /item: Object\.freeze\(\{/);
  assert.match(contract, /valueSource: 'calculation-engine'/);
  assert.match(contract, /mayHaveChildren: false/);
});

test('database rejects financial values on groups and children under financial leaves', () => {
  assert.match(migration, /fn_budget_guard_value_tree_definition/);
  assert.match(migration, /الأب يجب أن يكون تصنيفًا تجميعيًا/);
  assert.match(migration, /العنصر الحسابي ورقة نهائية ولا يجوز أن يحمل أبناء/);
  assert.match(migration, /fn_budget_require_financial_leaf_reference/);
  assert.match(migration, /القيمة المالية والتعرفة والجدولة والاستحقاق لا ترتبط إلا بعنصر حسابي نهائي/);
});

test('collapsed and expanded reports share the same calculation tree', () => {
  assert.match(constitution, /reportingPolicy: 'collapsed-and-expanded-views-share-one-calculation-tree'/);
  assert.match(contract, /calculationSource: 'single-leaf-calculation-tree'/);
  assert.match(contract, /collapsedView: 'derived-group-total'/);
  assert.match(contract, /expandedView: 'same-total-with-descendant-detail'/);
});
