import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const DASHBOARD = path.join(root, 'app', 'dashboard');
const LAYOUT = path.join(DASHBOARD, 'layout.js');
const CANONICAL_GEOMETRY = './arkan-dashboard-geometry-v2.css';
const CANONICAL_OWNER = 'arkan-dashboard-v2';

const RETIRED_GEOMETRY_NAMES = [
  'raw-phase.css',
  'transaction-underwear.css',
  'app-shell-v2.css',
  'app-body-v3.css',
  'living-navigation.css',
  'body-resuscitation.css',
  'arkan-field-geometry-v1.css',
  'navigation-comfort-v1.css',
  'legacy-structure-bridge-v1.css',
  'approach.module.css',
];

function walk(relative, files = []) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return files;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child, files);
    else files.push(child);
  }
  return files;
}

if (!fs.existsSync(LAYOUT)) {
  failures.push('app/dashboard/layout.js مفقود؛ لا يمكن إثبات مالك الهندسة.');
} else {
  const layout = fs.readFileSync(LAYOUT, 'utf8');
  const geometryImports = [...layout.matchAll(/import\s+['"]([^'"]*geometry[^'"]*\.css)['"]/gi)].map((m) => m[1]);
  if (geometryImports.length !== 1 || geometryImports[0] !== CANONICAL_GEOMETRY) {
    failures.push(`layout.js يجب أن يحمّل قبطان هندسة واحداً فقط: ${CANONICAL_GEOMETRY}. الموجود: ${geometryImports.join(', ') || 'لا شيء'}`);
  }

  const ownerMatches = [...layout.matchAll(/data-geometry-owner=["']([^"']+)["']/g)].map((m) => m[1]);
  if (ownerMatches.length !== 1 || ownerMatches[0] !== CANONICAL_OWNER) {
    failures.push(`layout.js يجب أن يعلن مالكاً هندسياً واحداً فقط: ${CANONICAL_OWNER}. الموجود: ${ownerMatches.join(', ') || 'لا شيء'}`);
  }
}

const files = walk('app/dashboard');
for (const file of files) {
  const base = path.basename(file);
  if (RETIRED_GEOMETRY_NAMES.includes(base)) {
    failures.push(`${file}: ملف هندسة متقاعد عاد إلى المستودع.`);
  }

  if (!/\.(?:js|jsx|mjs|css)$/.test(file)) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');

  if (file !== 'app/dashboard/layout.js' && /data-geometry-owner\s*=/.test(text)) {
    failures.push(`${file}: يحاول إعلان مالك هندسة محلي. المالك الوحيد هو ${CANONICAL_OWNER} في layout.js.`);
  }

  for (const retired of RETIRED_GEOMETRY_NAMES) {
    if (text.includes(retired)) failures.push(`${file}: ما زال يشير إلى الهندسة المتقاعدة ${retired}.`);
  }
}

const canonicalPath = path.join(DASHBOARD, 'arkan-dashboard-geometry-v2.css');
if (!fs.existsSync(canonicalPath)) {
  failures.push('القبطان الهندسي الموحد app/dashboard/arkan-dashboard-geometry-v2.css مفقود.');
} else {
  const geometry = fs.readFileSync(canonicalPath, 'utf8');
  if (!/القبطان الوحيد لهندسة شاشة لوحة التحكم/.test(geometry)) {
    failures.push('القبطان الهندسي لا يحمل إعلان الملكية الموحدة المتوقع.');
  }
}

if (failures.length) {
  console.error('Geometry ownership audit failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log(`Geometry ownership audit passed: مالك واحد (${CANONICAL_OWNER})، قبطان واحد، ولا عودة للهندسة المتقاعدة.`);
