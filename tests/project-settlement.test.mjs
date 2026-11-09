import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildSettlementStatement,
  defaultSettlementBasis,
  openAdvanceTotal,
  savedSettlementLines,
  settlementDayValue,
  settlementExpenseRows,
  settlementNextStep,
} from '../lib/project-settlement.mjs';

const amount = (statement, key) => statement.lines.find((line) => line.key === key).amount;

test('settlement statement follows the owner formula line by line', () => {
  // 10,000 works + 500 the contractor paid for us − 1,000 we paid for him (custody) = 9,500 before advances.
  const preview = { days_worked: 6, works_amount: 10000, reimbursable_amount: 500, charged_amount: 1000, payments_amount: 2000 };
  const statement = buildSettlementStatement(preview, { penalty: 100, other: 50, openAdvances: 3000, basis: 'daywork' });
  assert.equal(statement.beforeAdvances, 10000 + 500 + 50 - 1000 - 2000 - 100);
  assert.equal(statement.advances, 3000);
  assert.equal(statement.net, 7450 - 3000);
  assert.equal(amount(statement, 'payments'), 2000);
  assert.equal(statement.canSave, true);
  assert.deepEqual(statement.warnings, []);
});

test('advances never recover more than what is due; a negative period is flagged', () => {
  const small = buildSettlementStatement({ works_amount: 800, payments_amount: 0 }, { openAdvances: 5000 });
  assert.deepEqual([small.advances, small.net], [800, 0]);
  const negative = buildSettlementStatement({ works_amount: 300, charged_amount: 500, payments_amount: 0 }, { openAdvances: 1000 });
  assert.deepEqual([negative.advances, negative.net], [0, -200]);
  assert.match(negative.warnings[0], /مدين لأركان/);
});

test('without the payments migration, period payments block saving instead of being paid twice', () => {
  const statement = buildSettlementStatement({ works_amount: 1000 }, { periodPayments: 400 });
  assert.equal(statement.paymentsDeducted, false);
  assert.equal(statement.canSave, false);
  assert.equal(statement.lines.find((line) => line.key === 'payments').notDeducted, true);
  assert.match(statement.warnings[0], /لا تخصمها القاعدة بعد/);
  assert.equal(buildSettlementStatement({ works_amount: 1000 }, { periodPayments: 0 }).canSave, true);
});

test('saved settlements split charged_amount back into expenses and payments', () => {
  const lines = savedSettlementLines({ works_amount: 10000, reimbursable_amount: 500, charged_amount: 3000, payments_amount: 2000, advances_amount: 700, penalty_amount: 0, other_additions: 0 });
  assert.equal(lines.find((line) => line.key === 'charged').amount, 1000);
  assert.equal(lines.find((line) => line.key === 'payments').amount, 2000);
});

test('basis, next step and detail helpers', () => {
  assert.equal(defaultSettlementBasis('daily'), 'daywork');
  assert.equal(defaultSettlementBasis('piecework'), 'piecework');
  assert.equal(defaultSettlementBasis(null), 'item');
  assert.equal(settlementDayValue({ daywork_value: 900, piecework_value: 1200, by_item_value: 1200 }, 'daywork'), 900);
  assert.equal(openAdvanceTotal([{ remaining: 300 }, { remaining: -5 }, { remaining: '200' }]), 500);
  assert.equal(settlementExpenseRows([{ reimbursable: 0, charged: 0 }, { reimbursable: 50 }, { charged: 20 }]).length, 2);
  assert.equal(settlementNextStep({ status: 'draft' }, 'in_review').key, 'finance_approve');
  assert.equal(settlementNextStep({ status: 'accountant_approved' }, 'finance_approved').key, 'final_approve');
  assert.equal(settlementNextStep({ status: 'ceo_approved' }, 'final_approved').key, 'pay');
  assert.equal(settlementNextStep({ status: 'draft' }, 'returned_to_source').key, 'fix');
  assert.equal(settlementNextStep({ status: 'ceo_approved' }, 'paid').key, 'paid');
});

test('the settlement migration deducts on-account payments once, through charged_amount', () => {
  const sql = fs.readFileSync('supabase/migrations/20261109160000_settlement_deducts_direct_payments.sql', 'utf8');
  assert.match(sql, /add column if not exists payments_amount numeric not null default 0/);
  assert.match(sql, /settlement_id is null and kind::text='on_account'/);
  assert.match(sql, /charged_amount=coalesce\(r\.charged_amount,0\)\+coalesce\(r\.payments_amount,0\)/);
  assert.match(sql, /-coalesce\(r\.payments_amount,0\)-coalesce\(p_penalty,0\)/);
  assert.match(sql, /old\.payments_amount is distinct from new\.payments_amount/);
  assert.match(sql, /revoke all on function public\.fn_settlement_preview\(uuid, uuid, date, date, text\) from public, anon/);
});

test('the settlement has one entry: the project menu; approval and payment happen on the same screen', () => {
  const panel = fs.readFileSync('app/dashboard/projects/[id]/operations/settlement-panel.js', 'utf8');
  for (const action of ["'finance_approve'", "'final_approve'", "'return_to_source'", "'cancel'", 'service.pay(']) assert.ok(panel.includes(action), action);
  assert.equal(panel.includes('@/lib/supabase'), false);
  const nav = fs.readFileSync('lib/app-constitution.js', 'utf8');
  assert.equal((nav.match(/\/operations\/settlement/g) || []).length, 1);
});
