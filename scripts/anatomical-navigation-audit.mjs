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
  'perspectiveQuickLinks',
]) {
  if (!anatomy.includes(required)) failures.push(`التشريح: مفقود ${required}`);
}

if (!/export\s+function\s+perspectiveQuickLinks\([^)]*\)\s*\{\s*return\s*\[\]\s*;?\s*\}/s.test(anatomy)) {
  failures.push('مركز العمل: العدسات الشخصية لا يجوز أن تعود كروابط داخل القائمة.');
}

const living = requireFile('lib/living-navigation.js');
for (const required of [
  'single-living-branch-v1',
  'oneExpandedSiblingPerLevel:true',
  'biologicalEntitiesLiveOnStageOnly:true',
  "biologicalChildFirstSurface:'identity-card-before-work-navigation'",
  'directWorkChildrenAreHonoraryInNavigation:true',
  'workChildrenAreClickableOnStage:true',
  "semanticBack:'one-anatomical-level-never-browser-history'",
  'PROJECT_GUARDIANS',
  'PROJECT_APPROACH_REGIONS',
  'projectApproachHref',
  'portalApproachHref',
]) {
  if (!living.includes(required)) failures.push(`الفرع الحي: مفقود ${required}`);
}

const nav = requireFile('components/ui/ContextualDashboardNavigation.js');
for (const required of [
  "from '@/lib/anatomical-navigation'",
  "from '@/lib/living-navigation'",
  'data-navigation-consciousness="implicit"',
  'data-living-branch="single"',
  'appNavBackArrow',
  'requestWorkSessionNavigation',
  'appNavHonoraryList',
  'appNavHonorary',
  'projectApproachHref',
  'portalApproachHref',
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
  failures.push('الرجوع التشريحي: عاد لفظ «الكل» بدل الأب التشريحي الحقيقي.');
}
if (nav.includes('router.back(')) {
  failures.push('الرجوع التشريحي: لا يجوز استخدام تاريخ المتصفح كأب تشريحي.');
}
if (!/availableProjectGuardians\.map[\s\S]*projectId[\s\S]*appNavProjectContext/.test(nav)) {
  failures.push('الأبناء البيولوجيون: بعد اختيار المشروع يجب أن يظهر سياقه دون تحويل قائمة الحاضنة إلى قائمة أسماء مشاريع.');
}
if (!/<span[^>]+className="appNavHonorary"/.test(nav)) {
  failures.push('العمل المباشر: العناصر الشرفية داخل القائمة يجب أن تكون نصًا غير قابل للضغط.');
}
if (/<button[^>]+className="appNavHonorary"/.test(nav)) {
  failures.push('العمل المباشر: العنصر الشرفي لا يجوز أن يصبح اختصارًا قابلًا للضغط للعمل.');
}

const projectStage = requireFile('components/ui/ProjectAnatomyStage.js');
for (const required of [
  'data-biological-card="project"',
  'بطاقة المشروع',
  'data-navigation-stage="project-region"',
  'projectNavigationHref',
  'requestWorkSessionNavigation',
]) {
  if (!projectStage.includes(required)) failures.push(`مسرح المشروع: مفقود ${required}`);
}

const portalStage = requireFile('app/dashboard/workspace/[portal]/page.js');
for (const required of [
  'data-navigation-stage="approach"',
  'PROJECT_GUARDIANS',
  'requestWorkSessionNavigation',
  'حاضنات الحالة',
]) {
  if (!portalStage.includes(required)) failures.push(`مسرح الملاحة: مفقود ${required}`);
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

console.log('Anatomical navigation audit passed: implicit consciousness stays hidden, the work center remains idle-only, one living branch owns navigation, biological children live on the stage, direct work stays honorary in the menu, and semantic back never depends on browser history.');
