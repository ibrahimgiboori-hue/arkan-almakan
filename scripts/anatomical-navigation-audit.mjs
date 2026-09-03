import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const requireFile = (rel) => {
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) {
    failures.push(`${rel}: الملف مفقود.`);
    return '';
  }
  return read(rel);
};

const anatomy = requireFile('lib/anatomical-navigation.js');
for (const required of [
  'place-first-navigation-v2',
  'implicit-consciousness-not-navigation-root',
  'real-portal-hall-not-menu-root',
  'move-between-places-siblings-or-deeper-context',
  'return-to-portal-hall-when-leaving-current-place',
  'anatomical-zoom-out-not-browser-history',
  'show-real-parent-label-never-generic-back-or-all',
  'child-must-add-meaning-and-must-not-repeat-parent-label',
  'do-not-invent-a-navigation-level-for-a-single-child',
  "label:'بوابات العمل'",
  "visibility:'body-place'",
  'portalHallMustBeBodySurface',
  'portalHallMustNotRequireNavigationMenu',
  "label:'البوابات'",
  "'/dashboard/projects': 'سجل المشاريع'",
  "'/dashboard/employees': 'سجل الموظفين'",
  'isMeaningfulBranch',
  'perspectiveQuickLinks',
]) {
  if (!anatomy.includes(required)) failures.push(`التشريح: مفقود ${required}`);
}

if (!/export\s+function\s+perspectiveQuickLinks\([^)]*\)\s*\{\s*return\s*\[\]\s*;?\s*\}/s.test(anatomy)) {
  failures.push('العدسات الشخصية لا يجوز أن تعود كروابط متكررة داخل القائمة المساعدة.');
}

const nav = requireFile('components/ui/ContextualDashboardNavigation.js');
for (const required of [
  "from '@/lib/anatomical-navigation'",
  'data-navigation-consciousness="implicit"',
  'USER_PERSPECTIVE.label',
  'anatomyAreaLabel',
  'anatomyToolLabel',
  'isMeaningfulBranch',
  'perspectiveQuickLinks',
]) {
  if (!nav.includes(required)) failures.push(`الملاحة التشريحية: مفقود ${required}`);
}

if (/>\s*أركان المكان\s*</.test(nav)) {
  failures.push('الوعي المستتر: اسم أركان المكان عاد كعنصر مرئي داخل الملاحة اليومية.');
}
if (/>\s*الكل\s*</.test(nav)) {
  failures.push('الرجوع التشريحي: عاد لفظ «الكل» بدل اسم الأب أو منظور المستخدم.');
}
if (!nav.includes('const directItem = !isMeaningfulBranch(group) ? group.items[0] : null')) {
  failures.push('التشريح: المجموعة ذات الابن الواحد يجب أن تُسطّح بدل اختراع مستوى ملاحة وهمي.');
}
if (nav.includes('router.back(')) {
  failures.push('الرجوع التشريحي: لا يجوز استخدام تاريخ المتصفح كأب تشريحي.');
}

const hall = requireFile('app/dashboard/page.js');
for (const required of [
  'data-portal-hall="true"',
  'بوابات العمل',
  'filterAreasForAccess(AREAS',
  "area.key !== 'home'",
  'أعمالي',
  'بانتظار قراري',
]) {
  if (!hall.includes(required)) failures.push(`صالة البوابات: مفقود ${required}`);
}

if (hall.includes('مركز العمل')) {
  failures.push('صالة البوابات: عاد مفهوم «مركز العمل» القديم بدل المكان الأعلى الفعلي.');
}
if (!hall.includes('href={portal.href}')) {
  failures.push('صالة البوابات: يجب أن تدخل البوابة من مسارها الدستوري بدل خريطة روابط موازية.');
}

if (failures.length) {
  console.error('\nAnatomical navigation audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Anatomical navigation audit passed: the top level is a real portal hall, places lead from their own surfaces, navigation remains secondary and anatomical, and single-child pseudo-levels stay flattened.');
