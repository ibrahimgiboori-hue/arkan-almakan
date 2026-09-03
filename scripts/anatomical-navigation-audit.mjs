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
  'workCenterMustNotAppearInNavigation',
  "visibility:'idle-body-only'",
  'navigationAccess:false',
  "label:'البوابات'",
  "'/dashboard/projects': 'سجل المشاريع'",
  "'/dashboard/employees': 'سجل الموظفين'",
  'isMeaningfulBranch',
  'perspectiveQuickLinks',
]) {
  if (!anatomy.includes(required)) failures.push(`التشريح: مفقود ${required}`);
}

if (!/export\s+function\s+perspectiveQuickLinks\([^)]*\)\s*\{\s*return\s*\[\]\s*;?\s*\}/s.test(anatomy)) {
  failures.push('مركز العمل: العدسات الشخصية لا يجوز أن تعود كروابط داخل القائمة.');
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
if (/>\s*مركز العمل\s*</.test(nav)) {
  failures.push('مركز العمل: عاد كوجهة مرئية داخل القائمة رغم أنه وضع خمول فقط.');
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

const idle = requireFile('app/dashboard/page.js');
for (const required of [
  'data-idle-work-surface="true"',
  'data-work-center-visibility="idle-only"',
  'مركز العمل',
  'أعمالي',
  'بانتظار قراري',
]) {
  if (!idle.includes(required)) failures.push(`وضع الخمول: مفقود ${required}`);
}

if (failures.length) {
  console.error('\nAnatomical navigation audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Anatomical navigation audit passed: product consciousness stays implicit, work center exists only as the idle body surface, visible navigation starts from portals, parent zoom-out is semantic, and single-child pseudo-levels are flattened.');
