import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const governancePath = path.join(root, 'lib', 'ui-governance.js');
const governance = fs.readFileSync(governancePath, 'utf8');
const nativeBlock = governance.match(/const NATIVE_ROUTES = Object\.freeze\(\[([\s\S]*?)\]\);/);
if (!nativeBlock) {
  console.error('Unable to read NATIVE_ROUTES from lib/ui-governance.js');
  process.exit(1);
}

const nativeRoutes = [...nativeBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
const failures = [];
const warnings = [];

function routePage(route) {
  if (route === '/dashboard') return path.join(root, 'app', 'dashboard', 'page.js');
  const relative = route.replace(/^\/dashboard\/?/, '');
  return path.join(root, 'app', 'dashboard', ...relative.split('/'), 'page.js');
}

for (const route of nativeRoutes) {
  const page = routePage(route);
  if (!fs.existsSync(page)) {
    failures.push(`${route}: native route has no page.js at ${path.relative(root, page)}`);
    continue;
  }
  const text = fs.readFileSync(page, 'utf8');
  if (route !== '/dashboard' && !text.includes("@/components/ui/ConstitutionUI")) {
    failures.push(`${route}: declared native but does not consume ConstitutionUI`);
  }
  if (route !== '/dashboard' && !text.includes('ConstitutionPage')) {
    failures.push(`${route}: declared native but does not mount ConstitutionPage`);
  }
  if (/className=["']page-head["']|className=["']section["']/.test(text)) {
    warnings.push(`${route}: still contains legacy structural classes inside a native route`);
  }
}

if (warnings.length) {
  console.warn('\nNative UI audit warnings:\n');
  for (const item of warnings) console.warn(`- ${item}`);
}

if (failures.length) {
  console.error('\nNative UI constitution audit failed:\n');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Native UI constitution audit passed for ${nativeRoutes.length} route(s).`);
