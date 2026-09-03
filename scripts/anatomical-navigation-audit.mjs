import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const requireFile = (rel) => {
  if (!exists(rel)) {
    failures.push(`${rel}: الملف مفقود.`);
    return '';
  }
  return read(rel);
};
const requireTokens = (label, text, tokens) => {
  for (const token of tokens) if (!text.includes(token)) failures.push(`${label}: مفقود ${token}`);
};

const anatomy = requireFile('lib/anatomical-navigation.js');
requireTokens('التشريح', anatomy, [
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
]);
if (!/export\s+function\s+perspectiveQuickLinks\([^)]*\)\s*\{\s*return\s*\[\]\s*;?\s*\}/s.test(anatomy)) failures.push('مركز العمل: العدسات الشخصية لا يجوز أن تعود كروابط داخل القائمة.');

const living = requireFile('lib/living-navigation.js');
requireTokens('الفرع الحي', living, [
  'single-living-branch-v4',
  "navigationPersistenceRevision:'manual-dismiss-v1'",
  "grandfatherRole:'guide-to-portals-and-guardians'",
  "childRole:'mirror-selected-biological-context'",
  "grandchildRole:'contextual-shelf-for-existing-tool-transactions'",
  'oneExpandedSiblingPerLevel:true',
  'navigationLeadsUntilMeaningfulStage:true',
  'stageLeadsAfterGuardianOrGroupSelection:true',
  'selectedBiologicalIdentityMayMirrorAsNonInteractiveContext:true',
  'directWorkChildrenAreHonoraryInNavigation:true',
  'navigationMayRemainPresentAcrossRealWorkThreshold:true',
  'desktopNavigationPersistsWhenWorkThresholdIsCrossed:true',
  'workZoneNavigationDismissRequiresExplicitUserInvocation:true',
  'workNavigationPersistsUntilUserDismissesOrReturnsToDesktop:true',
  'desktopNavigationReservesSpaceInsteadOfCoveringStage:true',
  'sameBehaviorEngineAcrossAllPortals:true',
  'workFirstHistoryOnDemand:true',
  "workStageOccupancy:'one-real-action-or-one-selected-transaction-only'",
  'grandchildContainsExistingTransactionsOnly:true',
  'grandchildNeverListsTransactionsOnStage:true',
  'grandchildClassificationIsToolSpecific:true',
  'grandchildClassificationLabelsMustBeShortProfessional:true',
  'grandchildTransactionOpensItselfNotItsClassification:true',
  'grandchildSelectionKeepsNavigationAndOwnsStage:true',
  "semanticBack:'one-anatomical-level-never-browser-history'",
  'RAPID_SEMANTIC_BACK_WINDOW_MS = 5000',
  "rapidDoubleBackMeaning:'return-to-employee-desktop'",
  'rapidDoubleBackClosesNavigation:true',
  'PROJECT_GUARDIANS',
  'PROJECT_APPROACH_REGIONS',
  'projectApproachHref',
  'publishNavigationMirrorContext',
  'publishGrandchildNavigationContext',
]);

const portalModel = requireFile('lib/portal-living-navigation.js');
requireTokens('تعميم البوابات', portalModel, [
  'LIVING_PORTALS','SHELL_PORTAL_GROUPS','accessiblePortalTools','livingPortalGroups','portalEntryNodes','activePortalGroup','activePortalTool','portalCoverageReport','generatedCoverageFallback:true',
]);

const nav = requireFile('components/ui/ContextualDashboardNavigation.js');
requireTokens('الملاحة التشريحية', nav, [
  "from '@/lib/anatomical-navigation'",
  "from '@/lib/living-navigation'",
  "from '@/lib/portal-living-navigation'",
  'data-navigation-consciousness="implicit"',
  'data-living-branch="single"',
  'data-living-branch-scope="all-portals"',
  'data-navigation-role={navigationRole}',
  'GRANDCHILD_NAVIGATION_EVENT',
  'renderGrandchild',
  'activeGrandchildTab',
  'appNavGrandchildTabs',
  'appNavGrandchildTab',
  'appNavGrandchildGroupTitle',
  'onClick={()=>go(item.href)}',
  'appNavBackArrow',
  'appNavDismiss',
  'appNavAccountMenu',
  'تسجيل الخروج',
  'requestWorkSessionNavigation',
  'appNavHonoraryList',
  'appNavHonorary',
  'mirrorSubject?.subjectLabel',
  'portalEntryNodes',
  'entryNodesByArea',
  'entryNodes.map',
  'portalApproachHref',
  'FAST_DESKTOP_BACK_WINDOW_MS = 5000',
  'returnToEmployeeDesktop',
]);
if (/>\s*أركان المكان\s*</.test(nav)) failures.push('الوعي المستتر: اسم أركان المكان عاد كعنصر مرئي داخل الملاحة اليومية.');
if (/>\s*مركز العمل\s*</.test(nav)) failures.push('مركز العمل: عاد كوجهة مرئية داخل القائمة رغم أنه وضع خمول فقط.');
if (/>\s*الكل\s*</.test(nav)) failures.push('الرجوع التشريحي: عاد لفظ «الكل» بدل الأب التشريحي الحقيقي.');
if (nav.includes('router.back(')) failures.push('الرجوع التشريحي: لا يجوز استخدام تاريخ المتصفح كأب تشريحي.');
if (nav.includes("from '@/lib/supabase'")) failures.push('القائمة لا تستعلم عن الكيان البيولوجي أو معاملات الحفيد؛ تستقبل بياناتها من العضو أو المسرح.');
if (/<button[^>]+className="appNavHonorary"/.test(nav)) failures.push('مرآة السياق: العنصر الشرفي لا يجوز أن يصبح زر عمل.');
if (nav.includes('NAVIGATION_YIELD_EVENT') || /function\s+yieldToWork\s*\(/.test(nav)) failures.push('راحة الملاحة: لا يجوز إخفاء القائمة تلقائيًا عند عبور عتبة العمل؛ الإخفاء قرار المستخدم.');
if (!/function\s+go\s*\([^)]*\)\s*\{[\s\S]{0,500}?setOpen\(true\);/.test(nav)) failures.push('راحة الملاحة: التنقل داخل الفرع يجب أن يبقي القائمة مفتوحة حتى يختار المستخدم «إخفاء».');
if (!/<details[^>]+className="appNavAccountMenu"[\s\S]{0,300}?تسجيل الخروج/.test(nav)) failures.push('سلامة الخروج: تسجيل الخروج يجب أن يكون خلف خطوة «الحساب».');

const projectStage = requireFile('components/ui/ProjectAnatomyStage.js');
requireTokens('مسرح المشروع', projectStage, [
  'data-biological-card="project"','data-stage-leadership="stage"','availableRegions.map','projectApproachHref','publishNavigationMirrorContext','data-navigation-stage="project-region"','projectNavigationHref','requestWorkSessionNavigation',
]);
if (projectStage.includes('التنقل داخل المشروع يتم من القائمة')) failures.push('مسرح المشروع: عاد السلوك القديم الذي يجعل القائمة تقود بعد اختيار المشروع.');

const projectBoundary = requireFile('app/dashboard/projects/[id]/layout.js');
requireTokens('حد المشروع', projectBoundary, ['publishNavigationMirrorContext',"select('id,name_ar')","portalKey:'projects'"]);

const portalStage = requireFile('app/dashboard/workspace/[portal]/page.js');
requireTokens('مسرح البوابات', portalStage, ['livingPortalGroups','requestWorkSessionNavigation','data-navigation-stage="portal-group"','data-stage-leadership="stage"','data-living-branch-scope="all-portals"','group.items.map']);
if (/WorkPlatformPage|WORK_PLATFORM_|portalSwitcher|PORTAL_COPY|allowedPortals/.test(portalStage)) failures.push('مسرح البوابات: عاد منطق منصة الأعمال القديمة داخل المساحة الكبيرة.');

const projectList = requireFile('app/dashboard/projects/page.js');
requireTokens('مسرح الأبناء البيولوجيين', projectList, ['data-navigation-stage="biological-children"','projectCaretakerState','projectApproachHref(project.id,{care})']);

const projectsLogic = requireFile('lib/projects.js');
requireTokens('حاضنة المشروع', projectsLogic, ['declaredComplete',"return outstanding ? 'closing' : 'closed'"]);
if (/project\?\.status\s*===\s*['"]closed['"]\)\s*return\s*['"]closed['"]/.test(projectsLogic)) failures.push('حاضنة المشروع: status=closed لا يجوز أن يتجاوز الالتزامات المفتوحة.');

const threshold = requireFile('lib/work-threshold-constitution.js');
requireTokens('عتبة العمل', threshold, [
  "stageLeafRule: 'every-choice-presented-as-the-last-navigation-layer-must-resolve-to-a-work-zone'",'PROJECT_PATH_FUNCTIONS','PROJECT_VIEW_FUNCTIONS','projectWorkContext(pathname, searchParams)','quotationWorkContext(pathname)',"zoneKey:'projects-quotes'",'region',
]);
const thresholdRuntime = requireFile('components/ui/WorkThresholdRuntime.js');
if (!thresholdRuntime.includes('useSearchParams') || !thresholdRuntime.includes('resolveWorkThreshold(pathname, searchParams)')) failures.push('عتبة العمل: يجب أن تقرأ query context.');

const quoteBoundary = requireFile('app/dashboard/quotes/layout.js');
requireTokens('قائمة الحفيد لعروض الأسعار', quoteBoundary, ['publishGrandchildNavigationContext','QUOTE_LIST_TABS',"classification:'status-then-client'",'tabs,','groupsByClient','currentItemTabKey','data-selected-quote-actions="true"','data-action-consequence="destructive"']);
const quoteWork = requireFile('app/dashboard/quotes/page.js');
requireTokens('مسرح عروض الأسعار', quoteWork, ['data-new-quotation-operation="true"','data-stage-occupancy="single-action"','— إصدار جديد','WorkFormGrid','WorkField','ActionDock','بدء ${documentLabel}']);
if (quoteWork.includes('<table>') || quoteWork.includes('العمل الجاري') || quoteWork.includes('السجل')) failures.push('عروض الأسعار: أي قائمة معاملات داخل المسرح تخالف قاعدة المعاملة الواحدة.');

const geometry = requireFile('app/dashboard/arkan-dashboard-geometry-v2.css');
requireTokens('هندسة الجسد الموحدة', geometry, [
  ".rawDashboardShell:has(.appContextNav[data-open='true'][data-pinned='true']) .appBodyStage",
  '.appNavMirrorPortal',
  '.appNavMirrorSubjectTitle',
  '.appNavHonoraryListNested',
  '.appNavGrandchild',
  '.appNavGrandchildTabs',
  '.appNavGrandchildTab',
  '.appNavGrandchildGroupTitle',
  "[data-work-form-grid='true'] [data-work-field='true']",
]);

const forbiddenGeometry = [
  'app/dashboard/raw-phase.css','app/dashboard/transaction-underwear.css','app/dashboard/app-shell-v2.css','app/dashboard/app-body-v3.css','app/dashboard/living-navigation.css','app/dashboard/body-resuscitation.css','app/dashboard/legacy-structure-bridge-v1.css','app/dashboard/navigation-comfort-v1.css','app/dashboard/arkan-field-geometry-v1.css','app/dashboard/arkan-workspace-geometry-v1.css',
];
for (const file of forbiddenGeometry) if (exists(file)) failures.push(`${file}: هندسة قديمة ممنوعة بعد توحيد القبطان.`);

const idle = requireFile('app/dashboard/page.js');
requireTokens('وضع الخمول', idle, ['data-idle-work-surface="true"','data-work-center-visibility="idle-only"','data-employee-desktop="true"','مركز العمل','fn_create_workspace_task','الوارد والمراسلات','بانتظار قراري','التنبيهات']);

if (failures.length) {
  console.error('\nAnatomical navigation audit failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Anatomical navigation audit passed: one geometry captain owns the body, navigation persists until manual dismissal, sign out is protected, and old geometry cannot return.');