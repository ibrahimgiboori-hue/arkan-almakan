import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['app', 'components', 'lib'];
const sourceExt = new Set(['.js', '.mjs', '.jsx', '.ts', '.tsx', '.css']);
const duplicatePattern = / \(\d+\)\.[^.]+$/;
const violations = [];
const warnings = [];

// ملفات موروثة معروفة نحتفظ بها مؤقتاً إلى أن يثبت أنها غير مستوردة.
// أي نسخة مرقمة جديدة خارج هذه القائمة تعتبر مخالفة فورية.
const legacyDuplicateAllowlist = new Set([
  'PartyCards (1).js',
  'PartyCards (2).js',
  'page (1).js',
  'form-engine (1).js',
  'components/DocumentForm (1).js',
  'components/HelpButton (1).js',
]);

const requiredProjectOperationContextConsumers = [
  'app/dashboard/projects/[id]/operations/attendance-workspace.js',
  'app/dashboard/projects/[id]/operations/labor/page.js',
  'app/dashboard/projects/[id]/operations/tool-shell.js',
  'app/dashboard/projects/[id]/operations/movements/page.js',
  'app/dashboard/projects/[id]/operations/custody/page.js',
];

const requiredApprovalGovernanceConsumers = [
  {
    path:'app/print/quote/[id]/page.js',
    required:['buildQuotationApprovalParties'],
    forbidden:["client_kind||'entity'", "client_kind || 'entity'"],
  },
  {
    path:'components/quotes/QuotePartyGovernancePanel.js',
    required:['isEntityClient', 'employeeSignatoryPatch'],
    forbidden:[],
  },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return sourceExt.has(path.extname(entry.name)) ? [full] : [];
  });
}

function registerDuplicate(rel) {
  if (legacyDuplicateAllowlist.has(rel)) warnings.push(`${rel}: known legacy duplicate pending safe removal`);
  else violations.push(`${rel}: new numbered duplicate source file`);
}

function hasDirectItemExecutionWrite(text) {
  return /\.from\(\s*['"]item_execution['"]\s*\)[\s\S]{0,500}?\.(?:insert|update|upsert|delete)\s*\(/m.test(text);
}

for (const scope of scanRoots) {
  for (const file of walk(path.join(root, scope))) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (duplicatePattern.test(rel)) {
      registerDuplicate(rel);
      continue;
    }
    if (rel === 'lib/system-constitution.js' || rel === 'lib/quote-calc.js') continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/vat_rate\s*\?\?\s*0\.15|vatRate\s*[:=]\s*0\.15/.test(text)) violations.push(`${rel}: hard-coded VAT rate; use SYSTEM.vatRate`);
    if (/monthly_salary\s*\/\s*30|monthlySalary\s*\/\s*30/.test(text)) violations.push(`${rel}: local salary daily-rate calculation; use constitution helper`);
    if (/\bATTEND_CYCLE\s*=/.test(text) && rel !== 'lib/timesheet.js') violations.push(`${rel}: local attendance cycle; use lib/timesheet.js`);
    if (hasDirectItemExecutionWrite(text)) violations.push(`${rel}: direct item_execution write; use constitutional execution RPC gateway`);
  }
}

for (const rel of requiredProjectOperationContextConsumers) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    violations.push(`${rel}: required project operation context consumer is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (!text.includes('useProjectOperationContext')) violations.push(`${rel}: project operation screen bypasses shared useProjectOperationContext`);
}

for (const rule of requiredApprovalGovernanceConsumers) {
  const full = path.join(root, rule.path);
  if (!fs.existsSync(full)) {
    violations.push(`${rule.path}: governed approval consumer is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (!text.includes("@/lib/approval-governance")) violations.push(`${rule.path}: bypasses central approval-governance`);
  for (const symbol of rule.required) if (!text.includes(symbol)) violations.push(`${rule.path}: missing governed approval helper ${symbol}`);
  for (const localRule of rule.forbidden) if (text.includes(localRule)) violations.push(`${rule.path}: recreates client-kind approval rules locally`);
}

{
  const rel = 'app/dashboard/layout.js';
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) violations.push(`${rel}: unified dashboard shell is missing`);
  else {
    const text = fs.readFileSync(full, 'utf8');
    if (!text.includes('data-viewport-policy="fluid-full-width"')) violations.push(`${rel}: dashboard shell must declare fluid-full-width viewport policy`);
    for (const token of ['STANDARD_DASHBOARD_WIDTH','resolveOpeningScale','openingScale','SCALE_STORAGE_PREFIX','zoom:']) {
      if (text.includes(token)) violations.push(`${rel}: fixed/session viewport scaling returned (${token})`);
    }
  }
}

{
  const layoutRel = 'app/dashboard/quotes/[id]/layout.js';
  const pageRel = 'app/dashboard/quotes/[id]/page.js';
  const layoutFull = path.join(root, layoutRel);
  const pageFull = path.join(root, pageRel);
  if (!fs.existsSync(layoutFull)) violations.push(`${layoutRel}: quotation transaction layout is missing`);
  else if (fs.readFileSync(layoutFull, 'utf8').includes('QuotePartyGovernancePanel')) violations.push(`${layoutRel}: quote party editor must not be mounted globally above editor tabs`);

  if (!fs.existsSync(pageFull)) violations.push(`${pageRel}: quotation editor is missing`);
  else {
    const text = fs.readFileSync(pageFull, 'utf8');
    const setupStart = text.indexOf("tab === 'setup'");
    const panelAt = text.indexOf('<QuotePartyGovernancePanel', Math.max(0, setupStart));
    const switchesAt = text.indexOf('/* ============ المفاتيح', Math.max(0, setupStart));
    if (!text.includes("@/components/quotes/QuotePartyGovernancePanel")) violations.push(`${pageRel}: quotation editor must consume shared QuotePartyGovernancePanel`);
    if (setupStart < 0 || panelAt < setupStart || (switchesAt >= 0 && panelAt > switchesAt)) violations.push(`${pageRel}: QuotePartyGovernancePanel must live inside the quote setup/data tab`);
    if (text.includes("@/lib/approval-governance")) violations.push(`${pageRel}: quotation page must not recreate approval rules; keep them in shared panel/governance`);
  }
}

// ميزانية التشغيل: شجرة حساب واحدة، بوابة كتالوج واحدة، ومدخلات ومكونات صريحة من المحرك المركزي.
{
  const pageRel = 'app/dashboard/operating-budget/page.js';
  const libRel = 'lib/operating-budget.js';
  const pageFull = path.join(root, pageRel);
  const libFull = path.join(root, libRel);
  if (!fs.existsSync(pageFull)) violations.push(`${pageRel}: operating budget screen is missing`);
  if (!fs.existsSync(libFull)) violations.push(`${libRel}: operating budget descriptor engine is missing`);

  if (fs.existsSync(pageFull)) {
    const text = fs.readFileSync(pageFull, 'utf8');
    for (const token of ['budgetInputFields','budgetRateFields','budgetDefaultComponent','budgetValidateComponentInputs','budget_save_catalog_node']) {
      if (!text.includes(token)) violations.push(`${pageRel}: missing central operating-budget contract ${token}`);
    }
    for (const forbidden of [
      "budget_save_catalog_item",
      "budget_upsert_item",
      "budget_set_item_rate",
      "budget_set_schedule",
      "company_fixed_expenses",
      "function componentForType",
      "+ عنصر مستقل",
    ]) {
      if (text.includes(forbidden)) violations.push(`${pageRel}: legacy/parallel operating-budget path returned (${forbidden})`);
    }
    if (/annual\w*\s*\/\s*12|\/\s*12\s*\/\//.test(text)) violations.push(`${pageRel}: local annual/12 reserve calculation is forbidden`);
    if (!text.includes('أساس الاحتساب')) violations.push(`${pageRel}: calculation base must be explicit in the user interface`);
  }

  if (fs.existsSync(libFull)) {
    const text = fs.readFileSync(libFull, 'utf8');
    for (const type of ['quantity_x_unit_price','tiered','employee_based_contribution','subscription_plus_usage','composite_formula']) {
      if (!text.includes(type)) violations.push(`${libRel}: missing calculation family ${type}`);
    }
    for (const token of ['requiresGroupParent: true','budgetValidateComponentInputs','budgetComponentInputOptions','أساس الاحتساب']) {
      if (!text.includes(token)) violations.push(`${libRel}: missing governed calculation-input contract ${token}`);
    }
  }

  const migrationDir = path.join(root, 'supabase/migrations');
  if (fs.existsSync(migrationDir)) {
    const currentBudgetMigrations = fs.readdirSync(migrationDir)
      .filter((name) => name.includes('operating_budget') || name.includes('company_operating_budget'))
      .map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8'))
      .join('\n');
    const latestEngine = fs.existsSync(path.join(migrationDir, '20260829021000_unified_budget_calculation_families.sql'))
      ? fs.readFileSync(path.join(migrationDir, '20260829021000_unified_budget_calculation_families.sql'), 'utf8') : '';
    if (!latestEngine.includes("'engine_version','2.0.0'")) violations.push('operating-budget migrations: unified calculation engine v2 snapshot is missing');
    if (/محجوز معماريًا ولم يُفعّل|محجوز ولم يُفعّل/.test(latestEngine)) violations.push('operating-budget migrations: declared calculation family remains unimplemented');
    if (!currentBudgetMigrations.includes('العنصر الحسابي يجب أن ينتمي إلى تصنيف تجميعي')) violations.push('operating-budget migrations: orphan financial leaf guard is missing');
  }
}

{
  const rel = 'lib/system-constitution.js';
  const full = path.join(root, rel);
  const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const required = [
    "viewportPolicy: 'fluid-full-width'",
    'useAvailableViewportWidth: true',
    'forbidFixedViewportScaling: true',
    'forbidSessionStoredViewportZoom: true',
    "editorPlacement: 'document-data-section'",
    'forbidGlobalEditorMount: true',
    "catalogGateway: 'budget_save_catalog_node'",
    "inputPolicy: 'runtime-inputs-are-explicit-named-schema-entries'",
    "componentBasePolicy: 'input-dependent-components-reference-explicit-approved-input-key'",
    "calculationPolicy: 'safe-declarative-components-no-eval'",
    "principle: 'the-user-must-never-search-for-work-they-just-opened'",
    "smallWorkPlacement: 'inline-near-origin'",
    "originPolicy: 'stable-origin-id-primary-scroll-position-secondary'",
    'forbidImplicitComponentInput: true',
    'forbidInputGuessFromLabels: true',
    'forbidOrphanFinancialLeaf: true',
    'forbidDeclaredButUnimplementedCalculationType: true',
  ];
  for (const token of required) if (!text.includes(token)) violations.push(`${rel}: missing master constitution policy ${token}`);
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && duplicatePattern.test(entry.name)) registerDuplicate(entry.name);
}

if (warnings.length) {
  console.warn('\nV2 constitution audit legacy warnings:\n');
  for (const item of warnings) console.warn(`- ${item}`);
}

if (violations.length) {
  console.error('\nV2 constitution audit found blocking violations:\n');
  for (const item of violations) console.error(`- ${item}`);
  console.error(`\nBlocking total: ${violations.length}`);
  process.exit(1);
}

console.log(`V2 constitution audit passed${warnings.length ? ` with ${warnings.length} legacy warning(s)` : ''}.`);
