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
