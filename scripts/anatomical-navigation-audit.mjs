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
  'persistent-navigation-tree-v1',
  'visible-shell-identity-not-navigation-node',
  "defaultVisibility: 'visible'",
  'userMayHideNavigation: true',
  'currentBranchStaysExpanded: true',
  'sameLevelSiblingsStayReachable: true',
  'sameLevelNavigationRequiresBack: false',
  "disclosureModel: 'progressive-accordion-tree'",
  "locationTrace: 'visible-breadcrumb'",
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
  'data-navigation-consciousness="persistent-tree"',
  "const VISIBILITY_STORAGE_KEY = 'arkan-context-nav-visible'",
  'const [visiblePreference, setVisiblePreference] = useState(true)',
  'const [expandedAreaKey, setExpandedAreaKey] = useState(null)',
  'const [expandedGroupKey, setExpandedGroupKey] = useState(null)',
  'className="appNavTree"',
  'className="appNavBreadcrumb"',
  'aria-expanded={areaExpanded}',
  'anatomyAreaLabel',
  'anatomyToolLabel',
  'isMeaningfulBranch',
  'perspectiveQuickLinks',
  '<strong>أركان المكان</strong>',
]) {
  if (!nav.includes(required)) failures.push(`الملاحة التشريحية: مفقود ${required}`);
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
if (/function\s+(?:back|dive)\s*\(/.test(nav)) {
  failures.push('الشجرة الدائمة: لا يجوز أن تعود الملاحة إلى نموذج الشاشات المتعاقبة back/dive.');
}
if (/if\s*\(![^)]*pinned[^)]*\)\s*setOpen\(false\)/.test(nav)) {
  failures.push('الشجرة الدائمة: التنقل بين الوجهات لا يجب أن يغلق القائمة المكتبية تلقائيًا.');
}

const shell = requireFile('app/dashboard/app-shell-v2.css');
for (const required of [
  '--app-nav-width: 248px',
  ".rawDashboardShell:has(.appContextNav[data-open='true']) .appBodyStage",
  'padding-inline-start: var(--app-nav-width)',
  '.appNavAreaHead',
  '.appNavGroupHead',
  '.appNavBreadcrumb',
]) {
  if (!shell.includes(required)) failures.push(`جسم الملاحة: مفقود ${required}`);
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

console.log('Anatomical navigation audit passed: the desktop shell is visible by default, hiding is optional, active branches preserve sibling access, disclosure stays progressive, breadcrumbs expose location, single-child pseudo-levels stay flattened, and browser history is not used as the anatomical parent graph.');
