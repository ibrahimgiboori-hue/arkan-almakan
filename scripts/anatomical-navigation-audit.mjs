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
]) {
  if (!living.includes(required)) failures.push(`الفرع الحي: مفقود ${required}`);
}

const nav = requireFile('components/ui/ContextualDashboardNavigation.js');
for (const required of [
  "from '@/lib/anatomical-navigation'",
  "from '@/lib/living-navigation'",
  'data-navigation-consciousness="implicit"',
  'data-living-branch="single"',
  'data-living-branch-pilot="projects"',
  'appNavBackArrow',
  'requestWorkSessionNavigation',
  'appNavHonoraryList',
  'appNavHonorary',
  'projectApproachHref',
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
if (nav.includes('projectName') || /from\(['"]projects['"]\)/.test(nav) || nav.includes("from '@/lib/supabase'")) {
  failures.push('الأبناء البيولوجيون: القائمة لا يجوز أن تعرف اسم المشروع أو تستعلم عنه؛ هوية الابن تعيش في المسرح فقط.');
}
if (!/availableProjectGuardians\.map[\s\S]*projectId[\s\S]*appNavProjectContext/.test(nav)) {
  failures.push('الأبناء البيولوجيون: بعد اختيار مشروع يبقى سياقه الهيكلي ظاهرًا دون إدخال اسم الابن في القائمة.');
}
if (!/<span[^>]+className="appNavHonorary"/.test(nav)) {
  failures.push('العمل المباشر: العناصر الشرفية داخل القائمة يجب أن تكون نصًا غير قابل للضغط.');
}
if (/<button[^>]+className="appNavHonorary"/.test(nav)) {
  failures.push('العمل المباشر: العنصر الشرفي لا يجوز أن يصبح اختصارًا قابلًا للضغط للعمل.');
}
if (nav.includes('SHELL_PORTAL_GROUPS') || nav.includes('portalApproachHref(')) {
  failures.push('نسخة القبول: لا يجوز تثبيت تشريح الموارد البشرية/المالية/المستندات القديم داخل الفرع الحي قبل اعتماده؛ التجربة الحالية للمشاريع فقط.');
}
if (!nav.includes("label:'البوابات'") && !nav.includes("label: 'البوابات'")) {
  failures.push('الرجوع التشريحي: نهاية السياق يجب أن تُسمّى «البوابات» لا «وضع الخمول».');
}
if (nav.includes("label:'وضع الخمول'") || nav.includes("label: 'وضع الخمول'")) {
  failures.push('الخمول ليس وجهة ملاحة ولا يجوز أن يكون اسم هدف سهم الرجوع.');
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
  'data-living-branch-pilot="projects"',
  "portal==='projects'",
  'router.replace(area.href)',
  'المساحة الكبيرة لا تكرر عناصر الملاحة',
]) {
  if (!portalStage.includes(required)) failures.push(`مسرح الملاحة: مفقود ${required}`);
}
if (/PROJECT_GUARDIANS|SHELL_PORTAL_GROUPS|PORTAL_SECTION_ITEMS|requestWorkSessionNavigation/.test(portalStage)) {
  failures.push('مسرح الاقتراب: لا يجوز أن يكرر الحاضنات أو يثبت تشريح البوابات الأخرى؛ القابل للضغط يبقى في القائمة.');
}

const projectList = requireFile('app/dashboard/projects/page.js');
for (const required of [
  'data-navigation-stage="biological-children"',
  'projectCaretakerState',
  'projectApproachHref(project.id,{care})',
]) {
  if (!projectList.includes(required)) failures.push(`مسرح الأبناء البيولوجيين: مفقود ${required}`);
}

const projectsLogic = requireFile('lib/projects.js');
for (const required of [
  'declaredComplete',
  "return outstanding ? 'closing' : 'closed'",
]) {
  if (!projectsLogic.includes(required)) failures.push(`حاضنة المشروع: مفقود ${required}`);
}
if (/project\?\.status\s*===\s*['"]closed['"]\)\s*return\s*['"]closed['"]/.test(projectsLogic)) {
  failures.push('حاضنة المشروع: status=closed لا يجوز أن يتجاوز الالتزامات المفتوحة.');
}

const threshold = requireFile('lib/work-threshold-constitution.js');
for (const required of [
  "stageLeafRule: 'every-choice-presented-as-the-last-navigation-layer-must-resolve-to-a-work-zone'",
  'PROJECT_PATH_FUNCTIONS',
  'PROJECT_VIEW_FUNCTIONS',
  'projectWorkContext(pathname, searchParams)',
  'region',
]) {
  if (!threshold.includes(required)) failures.push(`عتبة العمل: مفقود ${required}`);
}
const thresholdRuntime = requireFile('components/ui/WorkThresholdRuntime.js');
if (!thresholdRuntime.includes('useSearchParams') || !thresholdRuntime.includes('resolveWorkThreshold(pathname, searchParams)')) {
  failures.push('عتبة العمل: يجب أن تقرأ query context حتى تعبر وظائف المشروع المبنية على view= العتبة فعلًا.');
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

console.log('Anatomical navigation audit passed: the projects pilot owns one living branch, biological identities stay on stage, clickable navigation is not duplicated on stage, every project leaf crosses the work threshold, closing is conservative, and idle remains a state rather than a destination.');
