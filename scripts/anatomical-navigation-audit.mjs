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
  'implicit-consciousness-v1',
  'implicit-consciousness-not-navigation-root',
  'return-to-user-work-perspective-when-anatomical-parent-ends',
  'anatomical-zoom-out-not-browser-history',
  'show-real-parent-label-never-generic-back-or-all',
  'child-must-add-meaning-and-must-not-repeat-parent-label',
  'do-not-invent-a-navigation-level-for-a-single-child',
  "label: 'مركز العمل'",
  "'/dashboard/projects': 'سجل المشاريع'",
  "'/dashboard/employees': 'سجل الموظفين'",
  'isMeaningfulBranch',
]) {
  if (!anatomy.includes(required)) failures.push(`التشريح: مفقود ${required}`);
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

if (failures.length) {
  console.error('\nAnatomical navigation audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Anatomical navigation audit passed: product consciousness stays implicit, visible hierarchy starts from the user perspective, parent zoom-out is semantic, and single-child pseudo-levels are flattened.');
