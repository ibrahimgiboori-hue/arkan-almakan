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
  if (legacyDuplicateAllowlist.has(rel)) {
    warnings.push(`${rel}: known legacy duplicate pending safe removal`);
  } else {
    violations.push(`${rel}: new numbered duplicate source file`);
  }
}

function hasDirectItemExecutionWrite(text) {
  // item_execution is governed by RPC command gateways. Reading is allowed; client-side
  // insert/update/upsert/delete is not. Keep the window bounded so unrelated calls later
  // in a large file do not create false positives.
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
    if (/vat_rate\s*\?\?\s*0\.15|vatRate\s*[:=]\s*0\.15/.test(text)) {
      violations.push(`${rel}: hard-coded VAT rate; use SYSTEM.vatRate`);
    }
    if (/monthly_salary\s*\/\s*30|monthlySalary\s*\/\s*30/.test(text)) {
      violations.push(`${rel}: local salary daily-rate calculation; use constitution helper`);
    }
    if (/\bATTEND_CYCLE\s*=/.test(text) && rel !== 'lib/timesheet.js') {
      violations.push(`${rel}: local attendance cycle; use lib/timesheet.js`);
    }
    if (hasDirectItemExecutionWrite(text)) {
      violations.push(`${rel}: direct item_execution write; use constitutional execution RPC gateway`);
    }
  }
}

// «الوحدة الدستورية بلا مستهلك ليست دستورًا»: كل أدوات التشغيل التي تغيّر أو
// تسجل يومًا/مقاولًا يجب أن تستهلك سياق المشروع نفسه. هذا الفحص يمنع عودة
// مجموعتين من localStorage تمحو إحداهما اختيار الأخرى.
for (const rel of requiredProjectOperationContextConsumers) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    violations.push(`${rel}: required project operation context consumer is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (!text.includes('useProjectOperationContext')) {
    violations.push(`${rel}: project operation screen bypasses shared useProjectOperationContext`);
  }
}

// الأطراف والاعتمادات لها Resolver واحد. شاشة الإدخال والطباعة لا تعيدان
// تعريف معنى فرد/منشأة أو طريقة اختيار ممثل أركان داخل كل صفحة.
for (const rule of requiredApprovalGovernanceConsumers) {
  const full = path.join(root, rule.path);
  if (!fs.existsSync(full)) {
    violations.push(`${rule.path}: governed approval consumer is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (!text.includes("@/lib/approval-governance")) {
    violations.push(`${rule.path}: bypasses central approval-governance`);
  }
  for (const symbol of rule.required) {
    if (!text.includes(symbol)) violations.push(`${rule.path}: missing governed approval helper ${symbol}`);
  }
  for (const localRule of rule.forbidden) {
    if (text.includes(localRule)) violations.push(`${rule.path}: recreates client-kind approval rules locally`);
  }
}

// سطح البرنامج واحد ومرن. ممنوع إعادة حل مشكلة اختلاف الشاشات بتثبيت عرض
// منطقي ثم تصغيره بالـ zoom أو تخزين نسبة افتتاح في sessionStorage.
{
  const rel = 'app/dashboard/layout.js';
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    violations.push(`${rel}: unified dashboard shell is missing`);
  } else {
    const text = fs.readFileSync(full, 'utf8');
    if (!text.includes('data-viewport-policy="fluid-full-width"')) {
      violations.push(`${rel}: dashboard shell must declare fluid-full-width viewport policy`);
    }
    const forbidden = [
      'STANDARD_DASHBOARD_WIDTH',
      'resolveOpeningScale',
      'openingScale',
      'SCALE_STORAGE_PREFIX',
      'zoom:',
    ];
    for (const token of forbidden) {
      if (text.includes(token)) violations.push(`${rel}: fixed/session viewport scaling returned (${token})`);
    }
  }
}

// حقول أطراف واعتماد عرض السعر بيانات للمستند، وليست شريطاً عاماً فوق محرر البنود.
// يبقى المكوّن المركزي واحداً، لكن مكان استهلاكه الوحيد في المحرر هو «بيانات العرض».
{
  const layoutRel = 'app/dashboard/quotes/[id]/layout.js';
  const pageRel = 'app/dashboard/quotes/[id]/page.js';
  const layoutFull = path.join(root, layoutRel);
  const pageFull = path.join(root, pageRel);

  if (!fs.existsSync(layoutFull)) {
    violations.push(`${layoutRel}: quotation transaction layout is missing`);
  } else {
    const text = fs.readFileSync(layoutFull, 'utf8');
    if (text.includes('QuotePartyGovernancePanel')) {
      violations.push(`${layoutRel}: quote party editor must not be mounted globally above editor tabs`);
    }
  }

  if (!fs.existsSync(pageFull)) {
    violations.push(`${pageRel}: quotation editor is missing`);
  } else {
    const text = fs.readFileSync(pageFull, 'utf8');
    const setupStart = text.indexOf("tab === 'setup'");
    const panelAt = text.indexOf('<QuotePartyGovernancePanel', Math.max(0, setupStart));
    const switchesAt = text.indexOf('/* ============ المفاتيح', Math.max(0, setupStart));
    if (!text.includes("@/components/quotes/QuotePartyGovernancePanel")) {
      violations.push(`${pageRel}: quotation editor must consume shared QuotePartyGovernancePanel`);
    }
    if (setupStart < 0 || panelAt < setupStart || (switchesAt >= 0 && panelAt > switchesAt)) {
      violations.push(`${pageRel}: QuotePartyGovernancePanel must live inside the quote setup/data tab`);
    }
    if (text.includes("@/lib/approval-governance")) {
      violations.push(`${pageRel}: quotation page must not recreate approval rules; keep them in shared panel/governance`);
    }
  }
}

// الدستور الأعلى نفسه يجب أن يعلن السياسات التي يحرسها هذا الفحص.
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
  ];
  for (const token of required) {
    if (!text.includes(token)) violations.push(`${rel}: missing master constitution policy ${token}`);
  }
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