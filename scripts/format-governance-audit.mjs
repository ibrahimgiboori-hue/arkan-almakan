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

if (violations.length) {
  console.error('Format governance audit failed:\n- ' + violations.join('\n- '));
  process.exit(1);
}

console.log(`Format governance audit passed (${governed.length} critical screens checked; shared formatting may be owned by a governed projection layer).`);
