// مدخل واحد لكل وظيفة في البرنامج كله.
// - كل وجهة ظاهرة في القوائم تنتمي لبوابة واحدة فقط، ولا تتكرر داخل قائمة المشروع.
// - لا تشير القوائم إلى مسار متقاعد (تحويل فقط).
// - لا قسم يعيد بيانات قسم آخر تحت اسم ثانٍ.
// - المسارات المتقاعدة تبقى تحويلًا إلى مدخلها الوحيد، ولا تعرض واجهة موازية.
import fs from 'node:fs';
import path from 'node:path';
import { AREAS, PROJECT_NAV_GROUPS, projectNavigationHref } from '../lib/app-constitution.js';
import { PORTAL_SECTION_ITEMS } from '../lib/portal-section-constitution.js';

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);
const read = (relative) => (fs.existsSync(path.join(root, relative)) ? fs.readFileSync(path.join(root, relative), 'utf8') : '');

// Route file for a dashboard href (dynamic segments are matched loosely).
function routeFile(href) {
  const clean = href.split('?')[0].replace(/^\//, '');
  const direct = path.join('app', clean.replace(/^dashboard/, 'dashboard'), 'page.js');
  if (fs.existsSync(path.join(root, direct))) return direct;
  const section = clean.match(/^dashboard\/workspace\/([^/]+)\/section\/([^/]+)$/);
  if (section) return 'app/dashboard/workspace/[portal]/section/[section]/page.js';
  return null;
}
const isRedirectOnly = (source) => /redirect\(/.test(source) && !/'use client'|"use client"/.test(source) && !/return\s*</.test(source);

// 1) Every visible destination belongs to exactly one portal.
const owner = new Map();
for (const area of AREAS) {
  const visible = [...(area.items || []), ...(PORTAL_SECTION_ITEMS[area.key] || [])]
    .filter((item) => item?.href && !item.hidden && !item.legacy && !/\/(?:new|create)\/?$/.test(item.href));
  for (const href of new Set(visible.map((item) => item.href))) {
    if (owner.has(href) && owner.get(href) !== area.key) fail(`الوجهة ${href} لها مدخلان: بوابة ${owner.get(href)} وبوابة ${area.key}.`);
    owner.set(href, area.key);
    const file = routeFile(href);
    if (file && isRedirectOnly(read(file))) fail(`القائمة تشير إلى مسار متقاعد (تحويل فقط): ${href} — اربطها بالوجهة النهائية مباشرة.`);
  }
}

// 2) Inside a project: one item per destination, and nothing that already has a portal entry.
const projectItems = PROJECT_NAV_GROUPS.flatMap((group) => group.items);
const projectHrefs = projectItems.map((item) => projectNavigationHref(':id', item).split('?')[0] + (item.view ? `?view=${item.view}` : ''));
if (new Set(projectHrefs).size !== projectHrefs.length) fail('قائمة المشروع فيها وجهة مكررة.');
for (const item of projectItems) {
  if (item.suffix === '/quotes') fail('عروض الأسعار لها سجل واحد (سجل عروض الأسعار مفلترًا بالمشروع) — لا تبويب ثانٍ داخل المشروع.');
}

// 3) No section re-serves another section's data under a second name.
const sectionData = read('lib/portal-section-data.js');
for (const match of sectionData.matchAll(/async function (\w+)\(\)\s*\{\s*return\s+(\w+)\(\);\s*\}/g)) {
  fail(`القسم ${match[1]} يعيد بيانات ${match[2]} نفسها — هذه وظيفة واحدة بمدخلين.`);
}

// 4) Project sheets open from the project menu only.
const operationsLayout = read('app/dashboard/projects/[id]/operations/layout.js');
if (/SheetTabs|<nav/.test(operationsLayout)) fail('أوراق المشروع: عاد صف تبويبات ثانٍ يكرر قائمة المشروع.');

// 5) The portal hall and my-work do not repeat what the rail already opens.
const hall = read('app/dashboard/page.js');
for (const duplicate of ['href="/dashboard/my-work"', 'my-work/approvals']) if (hall.includes(duplicate)) fail(`صالة البوابات تكرر وجهة الشريط: ${duplicate}`);
if (/<Link|<nav/.test(read('app/dashboard/my-work/layout.js'))) fail('أعمالي: عاد شريط تبويبات يكرر «اعتماداتي».');
if (/<Link|<nav/.test(read('app/dashboard/contractors/layout.js'))) fail('المقاولون: عاد شريط تبويبات يكرر قائمة البوابة.');

// 6) Retired routes stay redirects to their single entry.
const RETIRED = {
  'app/dashboard/projects/[id]/quotes/page.js': '/dashboard/quotes?project=',
  'app/dashboard/workspace/[portal]/approvals/page.js': '/dashboard/approvals',
  'app/dashboard/my-work/approvals/page.js': '/dashboard/approvals',
  'app/dashboard/site-operations/reports/page.js': '/dashboard/projects',
  'app/dashboard/expenses/page.js': '/dashboard/projects',
  'app/dashboard/timesheet/layout.js': '/dashboard/projects',
  'app/dashboard/labor/page.js': '/dashboard/contractors',
  'app/dashboard/contractors/[id]/labor/page.js': '/dashboard/contractors/',
};
for (const [file, target] of Object.entries(RETIRED)) {
  const source = read(file);
  if (!source) { fail(`المسار المتقاعد مفقود (يجب أن يبقى تحويلًا للروابط القديمة): ${file}`); continue; }
  if (!isRedirectOnly(source) || !source.includes(target)) fail(`المسار المتقاعد ${file} يجب أن يكون تحويلًا فقط إلى ${target}.`);
}
for (const dead of ['app/dashboard/timesheet/[id]/page.js', 'app/dashboard/timesheet/day/page.js', 'app/dashboard/timesheet/settlement/page.js', 'app/dashboard/timesheet/worker/page.js', 'app/dashboard/projects/[id]/operations/sheet-tabs.js']) {
  if (fs.existsSync(path.join(root, dead))) fail(`عادت واجهة موازية متقاعدة: ${dead}`);
}

// 7) No visible link or button still sends people to a retired route.
const RETIRED_TARGET = /(href=\{?|push\(|href:)\s*['"`]\/dashboard\/(labor|timesheet|expenses|my-work\/approvals|site-operations)(['"`/?$])/;
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const relative = path.join(dir, entry.name);
  if (entry.isDirectory()) return /node_modules|\.next|zz-/.test(relative) ? [] : walk(relative);
  return /\.(js|jsx|mjs)$/.test(entry.name) ? [relative] : [];
});
for (const file of [...walk('app'), ...walk('components')]) {
  const posix = file.replaceAll(path.sep, '/');
  // Retired routes themselves and the hidden legacy operations area (reachable only by old URLs) are exempt.
  if (Object.keys(RETIRED).includes(posix) || posix.startsWith('app/dashboard/site-operations/')) continue;
  read(file).split('\n').forEach((line, index) => {
    if (RETIRED_TARGET.test(line) && !/hidden:\s*true/.test(line)) fail(`${file}:${index + 1} يرسل المستخدم إلى مسار متقاعد — اربطه بمدخل الوظيفة الوحيد.`);
  });
}

if (failures.length) {
  console.error('\nSingle-entry audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Single-entry audit passed: ${owner.size} menu destinations, each with one entry; ${projectItems.length} project destinations; retired routes only redirect.`);
