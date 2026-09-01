import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const printRoot = path.join(root, 'app', 'print');
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

const candidates = walk(printRoot).filter((file) => /\.(?:js|jsx|ts|tsx|css)$/.test(file));
const violations = [];

for (const file of candidates) {
  const rel = path.normalize(path.relative(root, file));
  if (centralFiles.has(rel)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of geometryRules) {
    if (rule.re.test(content)) violations.push(`${rel}: ${rule.label}`);
  }
  if (!inlineMarkOwnerFiles.has(rel)) {
    for (const rule of markRules) {
      if (rule.re.test(content)) violations.push(`${rel}: ${rule.label}`);
    }
  }
}

const layoutPath = path.join(printRoot, 'layout.js');
if (fs.existsSync(layoutPath)) {
  const layout = fs.readFileSync(layoutPath, 'utf8');
  if (!layout.includes("import './print-constitution.css'")) {
    violations.push('app/print/layout.js: نقطة الدخول ليست print-constitution.css');
  }
  if (!layout.includes("import './print-office-model.css'")) {
    violations.push('app/print/layout.js: نموذج Word + Excel غير مطبق على كل المطبوعات');
  }
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
  ]) {
    if (!officeModel.includes(token)) violations.push(`print-office-model.css: missing governed Office Model contract ${token}`);
  }
}

const framePath = path.join(root, 'components', 'print', 'ConstitutionPrintFrame.js');
if (!fs.existsSync(framePath)) {
  violations.push('components/print/ConstitutionPrintFrame.js: محول القبطان العام مفقود');
} else {
  const frame = fs.readFileSync(framePath, 'utf8');
  for (const token of [
    'cfg?.letterhead_top_mm',
    'cfg?.letterhead_bottom_mm',
    'Math.max(finiteMm(requestedTop), letterheadTop)',
    'Math.max(finiteMm(requestedBottom), letterheadBottom)',
    'Children.toArray(children)',
    'cloneElement(childArray[0]',
    'className:mergeClassName(childArray[0].props.className, className)',
    '{flowChildren}',
  ]) {
    if (!frame.includes(token)) violations.push(`ConstitutionPrintFrame.js: missing physical-page ownership contract ${token}`);
  }
  if (frame.includes('<div className={className}>{children}</div>')) {
    violations.push('ConstitutionPrintFrame.js: الغلاف الزائد يعيد المستند كله ككتلة واحدة ويمنح المتصفح حق كسر الصفحة');
  }
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
  for (const token of [
    "PROJECT_REPORT_PROFILE = 'project_work_claims_report'",
    'ProjectReportJourneyPrint',
    'blankStatusRows',
  ]) {
    if (!genericPrint.includes(token)) violations.push(`app/print/[id]/page.js: missing central project-report journey bridge ${token}`);
  }
  if (genericPrint.includes('PROJECT_REPORT_OPERATIONAL_FIELDS')) {
    violations.push('app/print/[id]/page.js: عناوين رحلة البند لا يجوز أن تعود ثابتة داخل صفحة الطباعة');
  }
}

if (!fs.existsSync(journeyPrintPath)) {
  violations.push('components/print/ProjectReportJourneyPrint.js: مكوّن طباعة رحلة البند مفقود');
} else {
  const journeyPrint = fs.readFileSync(journeyPrintPath, 'utf8');
  for (const token of [
    'operational_lines',
    'report-item-block',
    'report-operational-row',
    'report-operational-label',
    'المتبقي / قيد التحويل',
    'generatedSummary',
    'generatedConclusion',
    '_report_sections',
  ]) {
    if (!journeyPrint.includes(token)) violations.push(`ProjectReportJourneyPrint.js: missing flexible item-journey contract ${token}`);
  }
}

if (!fs.existsSync(journeyEditorPath)) {
  violations.push('components/documents/ProjectReportJourneyEditor.js: محرر رحلة البند المرن مفقود');
} else {
  const journeyEditor = fs.readFileSync(journeyEditorPath, 'utf8');
  for (const token of [
    'operational_lines',
    'اكتب عنوان السطر',
    'إضافة سطر',
    'عنوان القسم',
    'إضافة قسم',
  ]) {
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
  for (const token of [
    "owner:'user'",
    "manualOverridePriority:'absolute'",
    "automaticAlignment:'fallback-only'",
    "RIGHT: 'right'",
    "CENTER: 'center'",
    "LEFT: 'left'",
    "JUSTIFY: 'justify'",
  ]) {
    if (!textGovernance.includes(token)) violations.push(`print-text-governance.js: missing manual text contract ${token}`);
  }
}
if (!fs.existsSync(textEditorPath)) {
  violations.push('components/print/PrintTextAlignmentEditor.js: أداة المحاذاة المركزية مفقودة');
} else {
  const textEditor = fs.readFileSync(textEditorPath, 'utf8');
  for (const token of [
    'PRINT_TEXT_ALIGNMENT_OPTIONS',
    'textAlignments',
    'data-print-text-align',
    'text-align:justify!important',
    'text-align-last:justify!important',
  ]) {
    if (!textEditor.includes(token)) violations.push(`PrintTextAlignmentEditor.js: missing governed manual-alignment behavior ${token}`);
  }
}
if (!fs.existsSync(boundaryPath) || !fs.readFileSync(boundaryPath, 'utf8').includes('PrintTextAlignmentEditor')) {
  violations.push('PrintGovernanceBoundary.js: أداة تنسيق النص ليست مركبة في القبطان العام لكل المطبوعات');
}

if (violations.length) {
  console.error('\nPRINT CONSTITUTION AUDIT FAILED');
  console.error('صفحات المحتوى لا تملك هندسة الورق أو أصول الهوية، ونموذج Word + Excel والتحكم اليدوي في النص يجب أن تبقى مركزية ومطبقة على جميع المطبوعات.\n');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Print constitution audit passed (${candidates.length} print source files checked; Word + Excel model, physical page ownership, letterhead safety, flexible item journeys and manual text alignment active).`);
