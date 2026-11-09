import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migrationsDir = path.resolve('supabase/migrations');
const ledgerMigrations = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: fs.readFileSync(path.join(migrationsDir, name), 'utf8') }))
  .filter(({ sql }) => /fn_project_daily_ledger/i.test(sql));

const latestLedgerMigration = ledgerMigrations.at(-1);

test('daily movement ledger has a canonical migration source', () => {
  assert.ok(latestLedgerMigration, 'A migration must define fn_project_daily_ledger');
  assert.equal(latestLedgerMigration.name, '20260826111500_harden_project_daily_ledger.sql');
});

test('daily movement ledger keeps historical attendance on its recorded contractor snapshot', () => {
  assert.match(latestLedgerMigration.sql, /a\.contractor_id_snapshot/i);
});

test('daily movement ledger includes legacy day expenses instead of silently losing them', () => {
  assert.match(latestLedgerMigration.sql, /legacy_day_expense_rows/i);
  assert.match(latestLedgerMigration.sql, /from public\.day_expenses/i);
});

test('linked custody is residual only and cannot duplicate semantic financial movements', () => {
  for (const source of ['contractor_expenses', 'day_expenses', 'contractor_advances', 'contractor_payments']) {
    const pattern = new RegExp(`not exists[\\s\\S]{0,220}public\\.${source}[\\s\\S]{0,180}custody_trx_id\\s*=\\s*ct\\.id`, 'i');
    assert.match(latestLedgerMigration.sql, pattern, `custody must exclude linked ${source}`);
  }
});

test('contractor payments have an explicit capability-scoped read policy', () => {
  assert.match(latestLedgerMigration.sql, /p_contractor_payments_select_cap/i);
  assert.match(latestLedgerMigration.sql, /has_project_capability\('finance\.projects\.view'/i);
});

test('period movements come from one read-only database call with the same rules as the daily ledger', () => {
  const sql = fs.readFileSync(path.join(migrationsDir, '20261109120000_project_ledger_range.sql'), 'utf8');
  assert.match(sql, /create or replace function public\.fn_project_ledger_range\(p_project_id uuid, p_from date, p_to date\)/i);
  assert.match(sql, /\bstable\b/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /Period longer than 92 days/);
  assert.match(sql, /a\.contractor_id_snapshot/i);
  assert.match(sql, /legacy_day_expense_rows/i);
  for (const source of ['contractor_expenses', 'day_expenses', 'contractor_advances', 'contractor_payments']) {
    const pattern = new RegExp(`not exists[\\s\\S]{0,220}public\\.${source}[\\s\\S]{0,180}custody_trx_id\\s*=\\s*ct\\.id`, 'i');
    assert.match(sql, pattern, `custody must exclude linked ${source}`);
  }
  assert.match(sql, /revoke all on function public\.fn_project_ledger_range\(uuid, date, date\) from public, anon/i);
  assert.match(sql, /'contractorId', contractor_id/);
});
