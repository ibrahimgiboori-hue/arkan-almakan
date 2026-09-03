import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const printRoot = path.join(root, 'app', 'print');
const printComponentsRoot = path.join(root, 'components', 'print');
const centralFiles = new Set([
  path.normalize('app/print/print-system.css'),
  path.normalize('app/print/print-constitution.css'),
  path.normalize('app/print/print-office-model.css'),
]);

const inlineMarkOwnerFiles = new Set([
  path.normalize('app/print/[id]/page.js'),
]);

const geometryRules = [
  { re:/@page\b/i, label:'تعريف @page محلي' },
  { re:/\bsize\s*:\s*A4\b/i, label:'تعريف حجم A4 محلي' },
  { re:/(^|[\s,{])html\s*,\s*body\s*\{/i, label:'تعريف html/body للطباعة محليًا' },
  { re:/\.print-page\s*\{/i, label:'إعادة تعريف هندسة .print-page' },
  { re:/\.constitution-paged-sheet\s*\{/i, label:'إعادة تعريف هندسة الصفحة متعددة الصفحات' },
];

const markRules = [
  { re:/\bstamp_image_path\b/i, label:'قراءة ملف الختم خارج طبقة الطباعة المركزية' },
  { re:/\bsignature_image_path\b/i, label:'قراءة ملف التوقيع خارج طبقة الطباعة المركزية' },
  { re:/\.print-master-stamp\s*\{/i, label:'تعريف هندسة الختم محليًا خارج دستور الطباعة' },
  { re:/\.print-master-signature\s*\{/i, label:'تعريف هندسة التوقيع محليًا خارج دستور الطباعة' },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes:true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function requireText(relative, tokens, violations) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    violations.push(`${relative}: الملف مفقود`);
    return '';
  }
  const text = fs.readFileSync(full, 'utf8');
  for (const token of tokens) if (!text.includes(token)) violations.push(`${relative}: missing governed print contract ${token}`);
  return text;
}

const candidates = walk(printRoot).filter((file) => /\.(?:js|jsx|ts|tsx|css)$/.test(file));
const captainSources = [...candidates, ...walk(printComponentsRoot).filter((file)=>/\.(?:js|jsx|ts|tsx)$/.test(file))];
const violations = [];

for (const file of candidates) {
  const rel = path.normalize(path.relative(root, file));
  if (centralFiles.has(rel)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of geometryRules) if (rule.re.test(content)) violations.push(`${rel}: ${rule.label}`);
  if (!inlineMarkOwnerFiles.has(rel)) {
    for (const rule of markRules) if (rule.re.test(content)) violations.push(`${rel}: ${rule.label}`);
  }
}

// إحلال وإلغاء: لا تعود واجهات أو محركات الطباعة التي حل محلها القبطان الواحد.
for (const file of captainSources) {
  const rel = path.normalize(path.relative(root,file));
  const text = fs.readFileSync(file,'utf8');
  if (/\bshowLetterhead\b/.test(text)) violations.push(`${rel}: واجهة showLetterhead القديمة لم تُلغ بعد الإحلال بـ letterheadSource`);
  if (/\bautoPaginate\b/.test(text)) violations.push(`${rel}: محرك autoPaginate القديم لم يُلغ بعد الإحلال بحدود التدفق المقاسة`);
}
for (const retired of [
  'components/print/PrintFrame.js',
  'lib/quote-pagination.mjs',
  'tests/quote-pagination.test.mjs',
]) {
  if (fs.existsSync(path.join(root,retired))) violations.push(`${retired}: ملف طباعة متقاعد عاد بعد الإحلال`);
}

const layoutPath = path.join(printRoot, 'layout.js');
if (fs.existsSync(layoutPath)) {
  const layout = fs.readFileSync(layoutPath, 'utf8');
  if (!layout.includes("import './print-constitution.css'")) violations.push('app/print/layout.js: نقطة الدخول ليست print-constitution.css');
  if (!layout.includes("import './print-office-model.css'")) violations.push('app/print/layout.js: نموذج Word + Excel غير مطبق على كل المطبوعات');
  for (const legacy of ['procedure-system.css','print-constitution-hardening.css']) {
    if (layout.includes(legacy)) violations.push(`app/print/layout.js: استيراد طبقة طباعة قديمة ${legacy}`);
  }
}

const officeModelPath = path.join(printRoot, 'print-office-model.css');
if (!fs.existsSync(officeModelPath)) {
  violations.push('app/print/print-office-model.css: نموذج Word + Excel المركزي مفقود');
} else {
  const officeModel = fs.readFileSync(officeModelPath, 'utf8');
  for (const token of [
    '--office-prose-leading',
    '--office-prose-gap',
    '--office-table-leading',
    '.print-prose',
    '.print-data-table',
    'table thead{display:table-header-group}',
    'page-break-inside:avoid!important',
    '[data-print-type="money"]',
  ]) if (!officeModel.includes(token)) violations.push(`print-office-model.css: missing governed Office Model contract ${token}`);
}

const governance = requireText('lib/print-governance.js', [
  "PRINT_GOVERNANCE_VERSION = '3.1'",
  'PRINT_WORD_STANDARD',
  "bodyMarginMm:25.4",
  "headerFromEdgeMm:12.7",
  "footerFromEdgeMm:12.7",
  'ARKAN_LETTERHEAD_PROFILE',
  "portraitTopArtworkMm:34.23",
  "portraitBottomArtworkMm:19.13",
  'PRINT_LINE_FLOW_POLICY',
  "owner:'ConstitutionPagedFrame'",
  "measurementUnit:'visual-line-box'",
  'PRINT_LETTERHEAD_SOURCE',
  "DIGITAL: 'digital'",
  "PREPRINTED: 'preprinted'",
  "NONE: 'none'",
  'PRINT_PAPER_ROTATION',
  'PRINT_FLOW_BOUNDARY',
  'PRINT_FLOW_KIND',
  "REPEATABLE_TABLE: 'repeatable-table'",
  'PRINT_REPORT_COLUMNS',
  'operating_budget_report',
  "field:'monthly_cost'",
  'getPrintReportColumns',
  'defaultPrintColumnLabels',
], violations);
if (!governance.includes("letterheadSource:PRINT_LETTERHEAD_SOURCE.DIGITAL")) {
  violations.push('lib/print-governance.js: مصدر الليترهيد الافتراضي لتقرير ميزانية التشغيل غير مثبت مركزيًا');
}
if (/\bsideMm\s*:/.test(governance)) {
  violations.push('lib/print-governance.js: sideMm القديمة عادت كبديل لهامش Word القياسي');
}

const frame = requireText('components/print/ConstitutionPrintFrame.js', [
  'ConstitutionPagedFrame',
  'Children.toArray(children)',
  'cloneElement(childArray[0]',
  'className:mergeClassName(childArray[0].props.className, className)',
  '{flowChildren}',
  'contentTopMm={contentTopMm}',
  'contentBottomMm={contentBottomMm}',
  'contentSideMm={contentSideMm}',
], violations);
if (frame.includes('getPrintLayoutPolicy')) {
  violations.push('ConstitutionPrintFrame.js: الغلاف لا يجوز أن يملك هندسة موازية للقبطان');
}
if (frame.includes('<div className={className}>{children}</div>')) {
  violations.push('ConstitutionPrintFrame.js: الغلاف الزائد يعيد المستند كله ككتلة واحدة ويمنح المتصفح حق كسر الصفحة');
}

const paged = requireText('components/print/ConstitutionPagedFrame.js', [
  'CAPTAIN_GEOMETRY_SCHEMA = 6',
  'PRINT_LETTERHEAD_SOURCE',
  'PRINT_PAPER_ROTATION',
  'PRINT_FLOW_BOUNDARY',
  'PRINT_FLOW_KIND',
  'print_presentation_overrides',
  'data-print-letterhead-source',
  'data-print-paper-rotation',
  'data-print-physical-letterhead-reservation',
  'data-print-geometry-schema',
  'data-print-line-seams="visual-line-box"',
  "table.props?.['data-print-flow'] !== PRINT_FLOW_KIND.REPEATABLE_TABLE",
  "querySelectorAll(':scope > tbody > tr')",
  'tableFragment(',
  'measuredLineBands(',
  'visualLineSeams(',
  'chooseVisualLineBreak(',
  'measuredRowSlice(',
  "gridSchemaVersion:CAPTAIN_GEOMETRY_SCHEMA",
  'geometryCurrent = Number(merged.gridSchemaVersion || 0) >= CAPTAIN_GEOMETRY_SCHEMA',
  'letterheadTop + headerClearanceMm',
  'letterheadBottom + footerClearanceMm',
  'physicalLeft',
  'physicalRight',
  'sideReservedLetterhead',
  'rotatedDigitalMaster',
  'printGovernanceClassName(documentKey,\'\',orientation)',
  'حفظ عناوين هذا التقرير',
  'Word 25.4 مم',
  'إعادة Word القياسي',
  'ورق مطبوع مسبقًا',
], violations);
for (const retired of [
  'cfg?.letterhead_top_mm',
  'cfg?.letterhead_bottom_mm',
  'safeBottomMm',
  'NORMAL_TOP_MM',
  'NORMAL_BOTTOM_MM',
]) {
  if (paged.includes(retired)) violations.push(`ConstitutionPagedFrame.js: بقايا هندسة قديمة بعد إحلال Word baseline (${retired})`);
}
if (/setFlowPagination|samePagination/.test(paged)) {
  violations.push('ConstitutionPagedFrame.js: بقايا محرك تقسيم الكتل القديم ما زالت موجودة');
}

const presentation = requireText('components/print/PrintPresentationContext.js', [
  'PrintPresentationProvider',
  'PrintColumnLabel',
  'labels',
], violations);
if (!presentation.includes('field')) violations.push('PrintPresentationContext.js: عنوان العمود يجب أن يعتمد على مفتاح حقل ثابت');

const presentationMigration = requireText('supabase/migrations/20260903192000_print_presentation_overrides.sql', [
  'public.print_presentation_overrides',
  'document_key text not null unique',
  "settings jsonb not null default '{}'::jsonb",
  'enable row level security',
  'p_print_presentation_read',
  'p_print_presentation_write',
], violations);
if (!presentationMigration.includes('revoke all on public.print_presentation_overrides from anon')) {
  violations.push('print_presentation_overrides: الوصول المجهول لم يُلغ صراحة');
}

const operatingBudget = requireText('app/print/operating-budget/page.js', [
  'PrintColumnLabel',
  'PRINT_FLOW_KIND',
  'data-print-flow={PRINT_FLOW_KIND.REPEATABLE_TABLE}',
  'field="monthly_cost"',
  'field="payment_status"',
  'data-print-keep-with-next="true"',
], violations);
for (const retired of [
  '<th>البند</th>',
  '<th>تكلفة الشهر</th>',
  '<th>استحقاق هذا الشهر</th>',
  '.ob-table tr{break-inside:avoid',
]) {
  if (operatingBudget.includes(retired)) violations.push(`app/print/operating-budget/page.js: بقايا عرض/تقسيم محلي بعد الإحلال (${retired})`);
}

// رحلة تقرير المشروع أصبحت مكوّناً مركزياً: السطر الرقمي ثم قائمة أسطر حرة
// (عنوان + نص) لا أسماء تشغيلية مفروضة. والملخصات ناتج محسوب وليست حقول إدخال.
const genericPrintPath = path.join(printRoot, '[id]', 'page.js');
const journeyPrintPath = path.join(root, 'components', 'print', 'ProjectReportJourneyPrint.js');
const journeyEditorPath = path.join(root, 'components', 'documents', 'ProjectReportJourneyEditor.js');
const reportFormPath = path.join(root, 'components', 'documents', 'ProjectReportDocumentForm.js');
const formRouterPath = path.join(root, 'components', 'documents', 'DocumentFormRouter.js');

if (!fs.existsSync(genericPrintPath)) {
  violations.push('app/print/[id]/page.js: محرك طباعة المستندات العام مفقود');
} else {
  const genericPrint = fs.readFileSync(genericPrintPath, 'utf8');
  for (const token of ["PROJECT_REPORT_PROFILE = 'project_work_claims_report'",'ProjectReportJourneyPrint','blankStatusRows']) {
    if (!genericPrint.includes(token)) violations.push(`app/print/[id]/page.js: missing central project-report journey bridge ${token}`);
  }
  if (genericPrint.includes('PROJECT_REPORT_OPERATIONAL_FIELDS')) violations.push('app/print/[id]/page.js: عناوين رحلة البند لا يجوز أن تعود ثابتة داخل صفحة الطباعة');
}

if (!fs.existsSync(journeyPrintPath)) {
  violations.push('components/print/ProjectReportJourneyPrint.js: مكوّن طباعة رحلة البند مفقود');
} else {
  const journeyPrint = fs.readFileSync(journeyPrintPath, 'utf8');
  for (const token of ['operational_lines','report-item-block','report-operational-row','report-operational-label','المتبقي / قيد التحويل','generatedSummary','generatedConclusion','_report_sections']) {
    if (!journeyPrint.includes(token)) violations.push(`ProjectReportJourneyPrint.js: missing flexible item-journey contract ${token}`);
  }
}

if (!fs.existsSync(journeyEditorPath)) {
  violations.push('components/documents/ProjectReportJourneyEditor.js: محرر رحلة البند المرن مفقود');
} else {
  const journeyEditor = fs.readFileSync(journeyEditorPath, 'utf8');
  for (const token of ['operational_lines','اكتب عنوان السطر','إضافة سطر','عنوان القسم','إضافة قسم']) {
    if (!journeyEditor.includes(token)) violations.push(`ProjectReportJourneyEditor.js: missing flexible journey editor contract ${token}`);
  }
}

if (!fs.existsSync(reportFormPath)) {
  violations.push('components/documents/ProjectReportDocumentForm.js: سطح إدخال التقرير القائم على بيانات المصدر مفقود');
} else {
  const reportForm = fs.readFileSync(reportFormPath, 'utf8');
  for (const token of ['GENERATED_KEYS','_report_sections','ProjectReportJourneyEditor']) {
    if (!reportForm.includes(token)) violations.push(`ProjectReportDocumentForm.js: missing generated-summary/source-only contract ${token}`);
  }
}

if (!fs.existsSync(formRouterPath) || !fs.readFileSync(formRouterPath, 'utf8').includes('ProjectReportDocumentForm')) {
  violations.push('DocumentFormRouter.js: ملف التقرير لا يمر عبر سطح المستندات الموحد');
}

const textGovernancePath = path.join(root, 'lib', 'print-text-governance.js');
const textEditorPath = path.join(root, 'components', 'print', 'PrintTextAlignmentEditor.js');
const boundaryPath = path.join(root, 'components', 'print', 'PrintGovernanceBoundary.js');
if (!fs.existsSync(textGovernancePath)) {
  violations.push('lib/print-text-governance.js: دستور المحاذاة اليدوية مفقود');
} else {
  const textGovernance = fs.readFileSync(textGovernancePath, 'utf8');
  for (const token of ["owner:'user'","manualOverridePriority:'absolute'","automaticAlignment:'fallback-only'","RIGHT: 'right'","CENTER: 'center'","LEFT: 'left'","JUSTIFY: 'justify'"]) {
    if (!textGovernance.includes(token)) violations.push(`print-text-governance.js: missing manual text contract ${token}`);
  }
}
if (!fs.existsSync(textEditorPath)) {
  violations.push('components/print/PrintTextAlignmentEditor.js: أداة المحاذاة المركزية مفقودة');
} else {
  const textEditor = fs.readFileSync(textEditorPath, 'utf8');
  for (const token of ['PRINT_TEXT_ALIGNMENT_OPTIONS','textAlignments','data-print-text-align','text-align:justify!important','text-align-last:justify!important']) {
    if (!textEditor.includes(token)) violations.push(`PrintTextAlignmentEditor.js: missing governed manual-alignment behavior ${token}`);
  }
}
if (!fs.existsSync(boundaryPath) || !fs.readFileSync(boundaryPath, 'utf8').includes('PrintTextAlignmentEditor')) {
  violations.push('PrintGovernanceBoundary.js: أداة تنسيق النص ليست مركبة في القبطان العام لكل المطبوعات');
}

if (violations.length) {
  console.error('\nPRINT CONSTITUTION AUDIT FAILED');
  console.error('القانون الحالي: قبطان واحد، هندسة Word A4 بالمليمتر، ليترهيد مقاس مستقل عن الهيدر والفوتر، واتجاه الورقة مستقل عن مصدر الهوية، وصفوف الجداول تنقسم فقط على line seams مرئية للقبطان وغير مرئية للقارئ. أي API أو رقم هندسي متقاعد بعد الإحلال يعد بقايا يجب حذفها.\n');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Print constitution audit passed (${candidates.length} print source files checked; one captain owns Word-standard physical geometry, measured Arkan letterhead reservation, visual-line seams, editable report presentation, Word + Excel model and manual text alignment).`);
