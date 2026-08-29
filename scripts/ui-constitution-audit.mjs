import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const nativeRoutes = [
  '/dashboard',
  '/dashboard/employees',
  '/dashboard/leaves',
  '/dashboard/advances',
  '/dashboard/projects',
  '/dashboard/quotes',
  '/dashboard/entities',
  '/dashboard/approvals',
  '/dashboard/operating-budget',
];
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
    failures.push(`${route}: governed route has no page.js at ${path.relative(root, page)}`);
    continue;
  }
  const text = fs.readFileSync(page, 'utf8');
  if (route !== '/dashboard' && !text.includes("@/components/ui/ConstitutionUI")) {
    failures.push(`${route}: governed route does not consume ConstitutionUI`);
  }
  if (route !== '/dashboard' && !text.includes('ConstitutionPage')) {
    failures.push(`${route}: governed route does not mount ConstitutionPage`);
  }
  if (/className=["']page-head["']|className=["']section["']/.test(text)) {
    warnings.push(`${route}: legacy structural classes remain inside a governed route`);
  }
}

for (const route of ['/dashboard/projects','/dashboard/quotes']) {
  const text = fs.readFileSync(routePage(route), 'utf8');
  if (/v_my_capabilities|fn_is_primary_user|is_system_admin/.test(text)) {
    failures.push(`${route}: governed page must consume the dashboard session projection instead of rebuilding UI authorization state`);
  }
}

if (warnings.length) {
  console.warn('\nGoverned UI audit warnings:\n');
  for (const item of warnings) console.warn(`- ${item}`);
}

if (failures.length) {
  console.error('\nUI constitution audit failed:\n');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`UI constitution audit passed for ${nativeRoutes.length} core route(s).`);
