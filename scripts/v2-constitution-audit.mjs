import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['app', 'components', 'lib'];
const sourceExt = new Set(['.js', '.mjs', '.jsx', '.ts', '.tsx', '.css']);
const duplicatePattern = / \(\d+\)\.[^.]+$/;
const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return sourceExt.has(path.extname(entry.name)) ? [full] : [];
  });
}

for (const scope of scanRoots) {
  for (const file of walk(path.join(root, scope))) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (duplicatePattern.test(rel)) {
      violations.push(`${rel}: numbered duplicate source file`);
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
  }
}

const rootLegacy = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && duplicatePattern.test(entry.name))
  .map((entry) => entry.name);
for (const name of rootLegacy) violations.push(`${name}: numbered duplicate root file`);

if (violations.length) {
  console.error('\nV2 constitution audit found violations:\n');
  for (const item of violations) console.error(`- ${item}`);
  console.error(`\nTotal: ${violations.length}`);
  process.exit(1);
}

console.log('V2 constitution audit passed.');
