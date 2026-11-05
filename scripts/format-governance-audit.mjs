import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const governed = [
  { surface:'app/dashboard/approvals/page.js' },
  { surface:'app/dashboard/workspace/workforce/section/payroll/page.js' },
  { surface:'app/dashboard/projects/[id]/insights/[section]/page.js', formatOwner:'lib/project-insights.mjs' },
];
const violations = [];

for (const entry of governed) {
  const rel=entry.surface;
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    violations.push(`${rel}: governed formatting consumer is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  const ownerRel=entry.formatOwner || rel;
  const ownerFull=path.join(root,ownerRel);
  if (!fs.existsSync(ownerFull)) {
    violations.push(`${rel}: formatting owner ${ownerRel} is missing`);
    continue;
  }
  const ownerText=fs.readFileSync(ownerFull,'utf8');
  const consumesSharedFormat=ownerText.includes("@/lib/format") || ownerText.includes("./format.js") || ownerText.includes("../format.js");
  if (!consumesSharedFormat) violations.push(`${rel}: formatting owner ${ownerRel} must consume shared lib/format`);

  for (const [sourceName,source] of [[rel,text],[ownerRel,ownerText]]) {
    if (/toLocaleString\(\s*['"]ar-SA['"]/.test(source)) violations.push(`${sourceName}: local Arabic-number money formatting is forbidden`);
    if (/toLocaleDateString\(\s*['"]ar-SA['"]/.test(source)) violations.push(`${sourceName}: local Arabic-number date formatting is forbidden`);
    if (/function\s+money\s*\(|const\s+money\s*=/.test(source)) violations.push(`${sourceName}: local money formatter is forbidden`);
    if (/function\s+(?:fmtDate|date)\s*\(/.test(source)) violations.push(`${sourceName}: local date formatter is forbidden`);
  }
}

// Repo-wide Latin digits: an Arabic locale tag used anywhere in the app must force Latin
// digits and the Gregorian calendar. Plain 'ar-SA' renders ١٢٣ and Hijri (Umm al-Qura) dates.
const LOCALE_SCAN_ROOTS = ['app', 'components', 'lib'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);
let localeFilesScanned = 0;
function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}
for (const scanRoot of LOCALE_SCAN_ROOTS) {
  const dir = path.join(root, scanRoot);
  if (!fs.existsSync(dir)) continue;
  for (const full of sourceFiles(dir)) {
    localeFilesScanned += 1;
    const rel = path.relative(root, full);
    const source = fs.readFileSync(full, 'utf8');
    for (const match of source.matchAll(/(['"`])(ar-[A-Za-z]{2}(?:-u-[A-Za-z0-9-]+)?)\1/g)) {
      const tag = match[2];
      if (!/-nu-latn\b/.test(tag) || !/-ca-gregory\b/.test(tag)) violations.push(`${rel}: locale '${tag}' must be 'ar-SA-u-ca-gregory-nu-latn' (Latin digits, Gregorian calendar)`);
    }
    if (/(?:toLocale(?:Date|Time)?String|Intl\.(?:NumberFormat|DateTimeFormat))\(\s*['"`]ar['"`]/.test(source)) {
      violations.push(`${rel}: bare 'ar' number/date formatting renders Arabic-Indic digits`);
    }
  }
}

// The date-field overlay that replaces Chrome's reversed Arabic placeholder must stay wired.
const runtimeSource = fs.readFileSync(path.join(root, 'components/LatinDigitsRuntime.js'), 'utf8');
const globalCss = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
for (const needle of ["from '@/lib/date-field-display.mjs'", 'syncDateField(element)', "'data-date-overlay'", 'validity?.badInput', 'DATE_FIELD_LANG']) {
  if (!runtimeSource.includes(needle)) violations.push(`components/LatinDigitsRuntime.js: date field overlay wiring missing ${needle}`);
}
for (const needle of ['input[data-date-overlay="value"]::-webkit-datetime-edit{opacity:0}', 'content:attr(data-date-display)']) {
  if (!globalCss.includes(needle)) violations.push(`app/globals.css: date field overlay rule missing ${needle}`);
}

if (violations.length) {
  console.error('Format governance audit failed:\n- ' + violations.join('\n- '));
  process.exit(1);
}

console.log(`Format governance audit passed (${governed.length} critical screens checked; ${localeFilesScanned} source files enforce Latin digits + Gregorian calendar; date-field overlay wired).`);
