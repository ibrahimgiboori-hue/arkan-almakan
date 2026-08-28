import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const violations = [];
const sourceExt = new Set(['.js', '.mjs', '.jsx', '.ts', '.tsx']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return sourceExt.has(path.extname(entry.name)) ? [full] : [];
  });
}

function rel(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

const governedTables = [
  'company_branches',
  'budget_item_definitions',
  'budget_item_schedules',
  'budget_rate_versions',
  'budget_tariff_bands',
  'budget_obligations',
  'budget_obligation_estimate_events',
  'budget_periods',
  'budget_period_reopen_log',
  'budget_period_cash_events',
  'budget_period_lines',
  'budget_line_settlements',
  'budget_reserve_movements',
];
const escapedTables = governedTables.join('|');
const budgetWrite = new RegExp(`\\.from\\(\\s*['\"](?:${escapedTables})['\"]\\s*\\)[\\s\\S]{0,500}?\\.(?:insert|update|upsert|delete)\\s*\\(`, 'm');
const legacyLedger = /company_fixed_expenses/;
const localAnnualDivision = /annual(?:Items|Total|Amount|Cost)?\w*\s*\/\s*12|monthlyEquivalent|annualMonthlyShare|annualMonthlyReserve/i;

for (const scope of ['app', 'components', 'lib']) {
  for (const file of walk(path.join(root, scope))) {
    const fileRel = rel(file);
    const text = fs.readFileSync(file, 'utf8');
    if (budgetWrite.test(text)) violations.push(`${fileRel}: direct operating-budget table write; use public budget_* RPC gateway`);
    if (legacyLedger.test(text)) violations.push(`${fileRel}: legacy company_fixed_expenses ledger returned`);
    if (fileRel === 'app/dashboard/operating-budget/page.js' && localAnnualDivision.test(text)) {
      violations.push(`${fileRel}: local annual/monthly reserve formula returned; budget engine owns reserve math`);
    }
  }
}

{
  const migrationsDir = path.join(root, 'supabase/migrations');
  const files = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort() : [];
  const broad = files.filter((file) => /grant\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+private\s+to\s+authenticated/i.test(fs.readFileSync(path.join(migrationsDir, file), 'utf8')));
  const hardening = '20260829016000_harden_private_budget_execution_grants.sql';
  const hardeningText = files.includes(hardening) ? fs.readFileSync(path.join(migrationsDir, hardening), 'utf8') : '';
  for (const file of broad) {
    if (file >= hardening || !hardeningText.includes("p.proname like 'fn_budget_%'") || !hardeningText.includes('revoke execute on function %s from authenticated')) {
      violations.push(`supabase/migrations/${file}: broad private EXECUTE grant is not neutralized by the required later hardening migration`);
    }
  }

  const atomicCatalog = '20260829019000_operating_budget_catalog_atomicity_and_consumable_detail.sql';
  const atomicText = files.includes(atomicCatalog) ? fs.readFileSync(path.join(migrationsDir, atomicCatalog), 'utf8') : '';
  for (const token of [
    'fn_budget_rpc_save_catalog_item',
    'public.budget_save_catalog_item',
    'fn_budget_guard_item_definition_history',
    'revoke execute on function public.budget_upsert_item',
    'revoke execute on function public.budget_set_item_rate',
    'revoke execute on function public.budget_set_schedule',
    'مياه معبأة 330 مل',
    'نسكافيه 3 في 1',
    'دبابيس دباسة',
  ]) {
    if (!atomicText.includes(token)) violations.push(`supabase/migrations/${atomicCatalog}: missing catalog-governance token ${token}`);
  }
}

{
  const fileRel = 'lib/system-constitution.js';
  const full = path.join(root, fileRel);
  const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const required = [
    "operatingBudget: Object.freeze({",
    "engine: 'company-operating-budget-engine-v1'",
    "writePolicy: 'rpc-gateway-only'",
    "actualPaymentSource: 'treasury_movements'",
    "reservePolicy: 'virtual-earmark-not-bank-transfer'",
    'forbidPageLocalBudgetFormulas: true',
    'forbidParallelExpenseLedger: true',
  ];
  for (const token of required) if (!text.includes(token)) violations.push(`${fileRel}: missing operating-budget constitution token ${token}`);
}

{
  const fileRel = 'lib/app-constitution.js';
  const full = path.join(root, fileRel);
  const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (!text.includes("href: '/dashboard/operating-budget'")) violations.push(`${fileRel}: operating budget is not registered in finance navigation`);
  if (!text.includes("capabilities: ['finance.operating_budget.view']")) violations.push(`${fileRel}: operating budget navigation lacks capability gate`);
}

{
  const fileRel = 'app/dashboard/operating-budget/page.js';
  const full = path.join(root, fileRel);
  if (!fs.existsSync(full)) {
    violations.push(`${fileRel}: governed operating budget page is missing`);
  } else {
    const text = fs.readFileSync(full, 'utf8');
    if (!text.includes("@/lib/operating-budget")) violations.push(`${fileRel}: page bypasses shared operating-budget contract`);
    if (!text.includes('useDashboardSession')) violations.push(`${fileRel}: page does not consume dashboard capability context`);
    if (!text.includes('OPERATING_BUDGET.capability.edit')) violations.push(`${fileRel}: edit actions are not capability-gated`);
    for (const rpc of ['budget_open_period','budget_period_statement','budget_period_summary','budget_forecast','budget_reserve_adjust','budget_pay_from_treasury','budget_save_catalog_item']) {
      if (!text.includes(`'${rpc}'`)) violations.push(`${fileRel}: missing governed RPC ${rpc}`);
    }
    for (const forbiddenRpc of ['budget_upsert_item','budget_set_item_rate','budget_set_schedule']) {
      if (text.includes(`'${forbiddenRpc}'`)) violations.push(`${fileRel}: catalog bypasses atomic gateway via ${forbiddenRpc}`);
    }
  }
}

if (violations.length) {
  console.error('\nOperating budget constitution audit found blocking violations:\n');
  for (const item of violations) console.error(`- ${item}`);
  console.error(`\nBlocking total: ${violations.length}`);
  process.exit(1);
}

console.log('Operating budget constitution audit passed.');
