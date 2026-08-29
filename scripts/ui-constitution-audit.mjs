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

// يوجد دستور واجهة واحد فقط: work-surface-constitution.js.
// ممنوع إعادة إنشاء interface-constitution.js كحقيقة موازية.
const workSurfaceConstitution = path.join(root, 'lib', 'work-surface-constitution.js');
const parallelInterfaceConstitution = path.join(root, 'lib', 'interface-constitution.js');
const workSurfaceRuntime = path.join(root, 'components', 'ui', 'WorkSurfaceRuntime.js');
const programAction = path.join(root, 'components', 'ui', 'ProgramAction.js');
const workKernel = path.join(root, 'components', 'ui', 'WorkSheetKernel.js');

for (const file of [workSurfaceConstitution, workSurfaceRuntime, programAction, workKernel]) {
  if (!fs.existsSync(file)) failures.push(`missing interface core: ${path.relative(root,file)}`);
}
if (fs.existsSync(parallelInterfaceConstitution)) {
  failures.push('parallel interface constitution is forbidden: lib/interface-constitution.js');
}

if (fs.existsSync(workSurfaceConstitution)) {
  const source = fs.readFileSync(workSurfaceConstitution,'utf8');
  for (const token of [
    "metaphor: 'operational-notebook'",
    "composition: 'continuous-sheet-not-card-dashboard'",
    "permissionPolicy: 'core-resolved-never-page-invented'",
    "actionContextPolicy: 'core-resolved-system-actor-and-real-actor'",
    "printPolicy: 'same-content-through-print-constitution'",
    'WORK_INTERFACE_ROLE',
    'WORK_ACTION_KIND',
    'defineWorkAction',
    'surfaceDataAttributes',
  ]) {
    if (!source.includes(token)) failures.push(`work surface constitution lost invariant: ${token}`);
  }
}

if (fs.existsSync(workSurfaceRuntime)) {
  const source = fs.readFileSync(workSurfaceRuntime,'utf8');
  if (!source.includes('surfaceDataAttributes')) failures.push('work surface runtime must mount the central work-surface constitution on the shell');
  if (!source.includes("event.key === '/'")) failures.push('work surface runtime must own the global page-command keyboard behavior');
  if (!source.includes("event.key === 'Escape'")) failures.push('work surface runtime must own contextual close behavior');
}

if (fs.existsSync(programAction)) {
  const source = fs.readFileSync(programAction,'utf8');
  if (!source.includes('useDashboardSession')) failures.push('ProgramAction must consume the central dashboard session projection');
  if (!source.includes('defineWorkAction')) failures.push('ProgramAction must derive behavior from the central work action constitution');
  if (!source.includes('canUseCapability')) failures.push('ProgramAction must resolve UI visibility from the central access projection');
  if (!source.includes('data-action-risk')) failures.push('ProgramAction must expose consequence/risk semantics');
  if (/supabase|v_my_capabilities|fn_is_primary_user/.test(source)) failures.push('ProgramAction must not create its own authorization data source');
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

console.log(`UI constitution audit passed for ${nativeRoutes.length} core route(s) and the single program-driven notebook kernel.`);
