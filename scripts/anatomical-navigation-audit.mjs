import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
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
  'single-living-branch-v2',
  'oneExpandedSiblingPerLevel:true',
  'navigationLeadsUntilMeaningfulStage:true',
  'stageLeadsAfterGuardianOrGroupSelection:true',
  'selectedBiologicalIdentityMayMirrorAsNonInteractiveContext:true',
  'directWorkChildrenAreHonoraryInNavigation:true',
  'desktopNavigationPersistsUntilUserDismisses:true',
  'desktopNavigationReservesSpaceInsteadOfCoveringStage:true',
  'sameBehaviorEngineAcrossAllPortals:true',
  "semanticBack:'one-anatomical-level-never-browser-history'",
  'PROJECT_GUARDIANS',
  'PROJECT_APPROACH_REGIONS',
  'projectApproachHref',
  'publishNavigationMirrorContext',
]) {
  if (!living.includes(required)) failures.push(`الفرع الحي: مفقود ${required}`);
}

const portalModel = requireFile('lib/portal-living-navigation.js');
for (const required of [
  'LIVING_PORTALS',
  'SHELL_PORTAL_GROUPS',
  'accessiblePortalTools',
  'livingPortalGroups',
  'portalEntryNodes',
  'activePortalGroup',
  'activePortalTool',
  'portalCoverageReport',
  'generatedCoverageFallback:true',
]) {
  if (!portalModel.includes(required)) failures.push(`تعميم البوابات: مفقود ${required}`);
}

const nav = requireFile('components/ui/ContextualDashboardNavigation.js');
for (const required of [
  "from '@/lib/anatomical-navigation'",
  "from '@/lib/living-navigation'",
  "from '@/lib/portal-living-navigation'",
  'data-navigation-consciousness="implicit"',
  'data-living-branch="single"',
  'data-living-branch-scope="all-portals"',
  'data-navigation-role={mirrorMode',
  'appNavBackArrow',
  'appNavDismiss',
  'requestWorkSessionNavigation',
  'appNavHonoraryList',
  'appNavHonorary',
  'mirrorSubject?.subjectLabel',
  'portalEntryNodes',
  'entryNodesByArea',
  'entryNodes.map',
  'portalApproachHref',
]) {
  if (!nav.includes(required)) failures.push(`الملاحة التشريحية: مفقود ${required}`);
}

if (/>\s*أركان المكان\s*</.test(nav)) failures.push('الوعي المستتر: اسم أركان المكان عاد كعنصر مرئي داخل الملاحة اليومية.');
if (/>\s*مركز العمل\s*</.test(nav)) failures.push('مركز العمل: عاد كوجهة مرئية داخل القائمة رغم أنه وضع خمول فقط.');
if (/>\s*الكل\s*</.test(nav)) failures.push('الرجوع التشريحي: عاد لفظ «الكل» بدل الأب التشريحي الحقيقي.');
if (nav.includes('router.back(')) failures.push('الرجوع التشريحي: لا يجوز استخدام تاريخ المتصفح كأب تشريحي.');
if (nav.includes("from '@/lib/supabase'")) failures.push('مرآة السياق: القائمة لا تستعلم عن الكيان البيولوجي؛ تستقبل هويته من المسرح فقط.');
if (/<button[^>]+className="appNavHonorary"/.test(nav)) failures.push('مرآة السياق: العنصر الشرفي لا يجوز أن يصبح زر عمل.');
if (/area\.key\s*===\s*['\"]projects['\"][\s\S]{0,260}?appNavChildren/.test(nav)) failures.push('الملاحة التشريحية: عاد مسار رسم خاص بالمشاريع بدل محرك عقد الدخول العام.');
if (!nav.includes("label:'البوابات'") && !nav.includes("label: 'البوابات'")) failures.push('الرجوع التشريحي: نهاية السياق يجب أن تُسمّى «البوابات» لا «وضع الخمول».');
if (nav.includes("label:'وضع الخمول'") || nav.includes("label: 'وضع الخمول'")) failures.push('الخمول ليس وجهة ملاحة ولا يجوز أن يكون اسم هدف سهم الرجوع.');

const projectStage = requireFile('components/ui/ProjectAnatomyStage.js');
for (const required of [
  'data-biological-card="project"',
  'data-stage-leadership="stage"',
  'availableRegions.map',
  'projectApproachHref',
  'publishNavigationMirrorContext',
  'data-navigation-stage="project-region"',
  'projectNavigationHref',
  'requestWorkSessionNavigation',
]) {
  if (!projectStage.includes(required)) failures.push(`مسرح المشروع: مفقود ${required}`);
}
if (projectStage.includes('التنقل داخل المشروع يتم من القائمة')) {
  failures.push('مسرح المشروع: عاد السلوك القديم الذي يجعل القائمة تقود بعد اختيار المشروع.');
}

const projectBoundary = requireFile('app/dashboard/projects/[id]/layout.js');
for (const required of [
  'publishNavigationMirrorContext',
  "select('id,name_ar')",
  "portalKey:'projects'",
]) {
  if (!projectBoundary.includes(required)) failures.push(`حد المشروع: مفقود ${required}`);
}

const portalStage = requireFile('app/dashboard/workspace/[portal]/page.js');
for (const required of [
  'livingPortalGroups',
  'requestWorkSessionNavigation',
  'data-navigation-stage="portal-group"',
  'data-stage-leadership="stage"',
  'data-living-branch-scope="all-portals"',
  'group.items.map',
]) {
  if (!portalStage.includes(required)) failures.push(`مسرح البوابات: مفقود ${required}`);
}
if (/WorkPlatformPage|WORK_PLATFORM_|portalSwitcher|PORTAL_COPY|allowedPortals/.test(portalStage)) {
  failures.push('مسرح البوابات: عاد منطق منصة الأعمال القديمة داخل المساحة الكبيرة.');
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
for (const required of ['declaredComplete', "return outstanding ? 'closing' : 'closed'"]) {
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

const css = requireFile('app/dashboard/living-navigation.css');
for (const required of [
  ".rawDashboardShell:has(.appContextNav[data-open='true']) .appBodyStage",
  '.appNavMirrorPortal',
  '.appNavMirrorSubject',
  '.appNavHonoraryListNested',
]) {
  if (!css.includes(required)) failures.push(`سلوك الجسد المرئي: مفقود ${required}`);
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

console.log('Anatomical navigation audit passed: one entry-node behavior engine spans all portals; the list leads early, the stage leads late, selected context mirrors back without becoming a shortcut, and idle remains a state rather than a destination.');
