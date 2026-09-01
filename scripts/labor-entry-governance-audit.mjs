import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const canonical = 'app/dashboard/projects/[id]/operations/labor/page.js';
const retiredContractorRoute = 'app/dashboard/contractors/[id]/labor/page.js';
const legacyRouter = 'app/dashboard/labor/page.js';
const retiredSiteOperationsRoute = 'app/dashboard/site-operations/page.js';
const sourceRoots = ['app', 'components', 'lib'];
const extensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

function fail(message) {
  throw new Error(`[labor-entry-governance] ${message}`);
}

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { withFileTypes:true }).flatMap((entry) => {
    const relative = path.join(relativeDir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) return walk(relative);
    return extensions.has(path.extname(entry.name)) ? [relative] : [];
  });
}

const files = sourceRoots.flatMap(walk);
const sources = new Map(files.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const canonicalSource = sources.get(canonical);
if (!canonicalSource) fail(`missing canonical labor screen: ${canonical}`);

if (!canonicalSource.includes("supabase.rpc('fn_quick_add_workers'")) {
  fail('the project labor screen must own the canonical quick-add RPC');
}
if (!canonicalSource.includes('data-canonical-labor-create-form="true"')) {
  fail('the project labor screen must visibly declare the single labor-create form');
}

for (const [file, source] of sources) {
  const quickAddCalls = source.match(/fn_quick_add_workers/g) || [];
  if (file !== canonical && quickAddCalls.length) {
    fail(`alternate quick-add call found outside project labor screen: ${file}`);
  }

  const directLaborInsert = /\.from\(\s*['"]laborers['"]\s*\)[\s\S]{0,800}?\.insert\s*\(/m.test(source);
  if (directLaborInsert) {
    fail(`direct client insert into laborers is forbidden; use the canonical project labor engine: ${file}`);
  }
}

const retiredSource = sources.get(retiredContractorRoute) || '';
if (!retiredSource.includes('data-retired-labor-entry="contractor-level"')) {
  fail('contractor labor route must remain a non-creating project selector');
}
for (const forbidden of ['buildLaborerSavePayload', 'startNew(', ".insert(", "sp.get('add')", 'إضافة عامل إلى']) {
  if (retiredSource.includes(forbidden)) fail(`retired contractor labor route reintroduced creation logic: ${forbidden}`);
}

const routerSource = sources.get(legacyRouter) || '';
if (routerSource.includes("searchParams?.add") || routerSource.includes('?add=1')) {
  fail('legacy /dashboard/labor router must never reopen an alternate add mode');
}

const retiredSiteOperationsSource = sources.get(retiredSiteOperationsRoute) || '';
if (!retiredSiteOperationsSource.includes("redirect('/dashboard/projects')")) {
  fail('legacy site-operations parent route must remain a compatibility redirect to the projects portal');
}
for (const forbidden of ['fn_quick_add_workers', 'parseSiteCommand', 'openWorkers(', "'use client'"]) {
  if (retiredSiteOperationsSource.includes(forbidden)) {
    fail(`retired site-operations workspace reintroduced operational UI logic: ${forbidden}`);
  }
}

const retiredArtifacts = [
  'app/dashboard/site-operations/page.module.css',
  'lib/labor-profile-write.mjs',
  'tests/labor-profile-write.test.mjs',
  'lib/site-operation-command.js',
  'tests/site-operation-command.test.mjs',
];
for (const file of retiredArtifacts) {
  if (exists(file)) fail(`retired duplicate labor/site-operations artifact must stay deleted: ${file}`);
}

console.log('Labor entry governance audit passed: project labor is the only user-facing creation surface, direct client inserts are blocked, and retired duplicate workspaces cannot return.');
