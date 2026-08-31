import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const governed = [
  'app/dashboard/approvals/page.js',
  'components/payroll/PayrollOperationalPage.js',
  'app/dashboard/projects/[id]/insights/[section]/page.js',
];
const violations = [];

const payrollRoute = path.join(root, 'app/dashboard/workspace/workforce/section/payroll/page.js');
if (!fs.existsSync(payrollRoute)) {
  violations.push('app/dashboard/workspace/workforce/section/payroll/page.js: governed payroll route is missing');
} else if (!fs.readFileSync(payrollRoute, 'utf8').includes("@/components/payroll/PayrollOperationalPage")) {
  violations.push('app/dashboard/workspace/workforce/section/payroll/page.js: must route through canonical payroll component');
}

for (const rel of governed) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    violations.push(`${rel}: governed formatting consumer is missing`);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  if (!text.includes("@/lib/format")) violations.push(`${rel}: must consume shared lib/format`);
  if (/toLocaleString\(\s*['"]ar-SA['"]/.test(text)) violations.push(`${rel}: local Arabic-number money formatting is forbidden`);
  if (/toLocaleDateString\(\s*['"]ar-SA['"]/.test(text)) violations.push(`${rel}: local Arabic-number date formatting is forbidden`);
  if (/function\s+money\s*\(|const\s+money\s*=/.test(text)) violations.push(`${rel}: local money formatter is forbidden`);
  if (/function\s+(?:fmtDate|date)\s*\(/.test(text)) violations.push(`${rel}: local date formatter is forbidden`);
}

if (violations.length) {
  console.error('Format governance audit failed:\n- ' + violations.join('\n- '));
  process.exit(1);
}

console.log(`Format governance audit passed (${governed.length} critical screens checked).`);
