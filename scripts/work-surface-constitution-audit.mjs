import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const requireText = (file, values) => {
  if (!exists(file)) { failures.push(`${file}: الملف البنيوي مفقود`); return ''; }
  const text = read(file);
  for (const value of values) if (!text.includes(value)) failures.push(`${file}: مفقود الثابت البنيوي ${value}`);
  return text;
};

if (exists('lib/interface-constitution.js')) failures.push('ممنوع وجود دستور واجهة موازٍ لـ work-surface-constitution.js.');
if (exists('app/dashboard/projects/projects-redesign.module.css')) failures.push('جلد بطاقات المشاريع القديم يجب ألا يعود بعد انتقال السجل إلى لغة الدفتر.');

const constitution = requireText('lib/work-surface-constitution.js', [
  'program-driven-notebook-v2','work-first-v3','continuous-sheet-not-card-dashboard','flow-unless-real-boundary','compact-row-expands-in-context','core-resolved-never-page-invented','secondary-overflow','WORK_INTERFACE_ROLE','WORK_ACTION_KIND','WORK_ACTION_SCOPE','WORK_SELECTION_POLICY','explicit-record-set-action-scope-v1','selection-alone-never-mutates-data','server-snapshot-validated-batch-source-only','print-export-only-unless-explicit-governed-batch-source','deny-unless-action-explicitly-declares','same-work-surface-not-mobile-clone','route-content-preserved-in-place','single-route-content-host-no-cloning','hidden-until-explicitly-called','progressive-drill-in-no-stacked-accordions','reserve-space-on-desktop-overlay-on-touch','work-first-no-global-status-card-wall','forbidRouteContentDuplication','forbidBodyOwnedBusinessLogic','forbidBodyFeatureDeletionDuringMigration',"from './app-constitution'",'AREAS.flatMap','PROJECT_NAV_GROUPS.flatMap','resolveWorkSurface','defineWorkAction',
]);
if (/localStorage|sessionStorage/.test(constitution)) failures.push('work-surface constitution: حالة العمل لا يجوز أن تعيش في تخزين متصفح موازٍ.');
if (/export\s+const\s+AREAS\s*=/.test(constitution)) failures.push('work-surface constitution: ممنوع نسخ خريطة البوابات بدل اشتقاقها من app-constitution.');

const sessionConstitution = requireText('lib/work-session-constitution.js', [
  'zero-residue-work-session-v1','user-work-session-not-page','being-in-a-work-zone-does-not-mean-a-work-session-has-started','a-procedural-session-must-end-with-an-explicit-terminal-action','server-confirmed-effect-only','action-server-commit-audit-completion-surface-release','replace-active-route-organ-with-clean-completion-surface','no-form-no-old-record-list-no-session-actions-after-release','past-transactions-live-in-register-search-reports-not-under-active-work','dirty-exists-only-when-an-organ-declares-real-unsaved-progress','anatomical-navigation-must-not-discard-declared-unsaved-progress-silently','discarding-may-lose-unsaved-progress-and-must-say-so-explicitly','bodyMustNotInferCompletionFromButtonClick','bodyMustNotInferCompletionFromToast','bodyMustNotInferDirtyFromOrdinaryBrowsing','bodyMustNotOwnBusinessTransition','WORK_COMPLETION_KIND','WORK_SESSION_STATE',
]);
if (/localStorage|sessionStorage/.test(sessionConstitution)) failures.push('work-session constitution: خاتمة الجلسة لا يجوز أن تعيش في تخزين متصفح موازٍ.');

const runtime = requireText('components/ui/WorkSurfaceRuntime.js', ['resolveWorkSurface','data-work-surface-policy','WorkSurfaceContext.Provider','export function useWorkSurface','arkan:page-command-requested','arkan:close-context-requested']);
if (/localStorage|sessionStorage/.test(runtime)) failures.push('WorkSurfaceRuntime: ممنوع تخزين سياق الورقة محليًا.');

const sessionRuntime = requireText('components/ui/WorkSessionRuntime.js', [
  "from '@/lib/work-session-constitution'","BEGIN: 'arkan:work-session-begin'","DIRTY: 'arkan:work-session-dirty'","NAVIGATE: 'arkan:work-session-navigate'",'arkan:work-session-completed','serverConfirmed !== true','emitWorkSessionCompletion','emitWorkSessionDirty','requestWorkSessionNavigation','data-work-session-state','data-work-session-dirty','CompletedSurface','UnsavedNavigationGuard','WORK_SESSION_STATE.IDLE','WORK_SESSION_STATE.DIRTY','const [started, setStarted] = useState(false)','const [dirty, setDirty] = useState(false)','setStarted(true)','setCompletion(null)','beforeunload','حفظ مسودة والمتابعة','تجاهل والمتابعة',
]);
if (/localStorage|sessionStorage/.test(sessionRuntime)) failures.push('WorkSessionRuntime: حالة انتهاء جلسة العمل لا تُخزن محليًا ولا تعيش بعد تغيير المسار.');
if (!/completion\s*\?\s*<CompletedSurface[\s\S]{0,220}:\s*<>/.test(sessionRuntime)) failures.push('WorkSessionRuntime: الخاتمة يجب أن تستبدل مشهد العمل المنتهي بدل إبقاء العضو والقوائم تحته.');

const layout = requireText('app/dashboard/layout.js', [
  "import WorkSurfaceRuntime from '@/components/ui/WorkSurfaceRuntime'",
  "import WorkSessionRuntime from '@/components/ui/WorkSessionRuntime'",
  "'./arkan-dashboard-geometry-v2.css'",
  '<WorkSurfaceRuntime>','</WorkSurfaceRuntime>','<WorkSessionRuntime>','</WorkSessionRuntime>',
  'data-work-kernel="operational-notebook-v1"','className="appBodyStage"','data-application-body="work-first-v3"','data-organ-host="route-content"','data-organ-preservation="in-place"','data-geometry-owner="arkan-dashboard-v2"',
]);
if ((layout.match(/\{children\}/g) || []).length !== 1) failures.push('app/dashboard/layout.js: محتوى المسار يجب أن يركب مرة واحدة فقط داخل الجسد الجديد؛ ممنوع نسخ العضو أو عرضه في سطح موازٍ.');

const geometry = requireText('app/dashboard/arkan-dashboard-geometry-v2.css', [
  'ARKAN DASHBOARD GEOMETRY V2',
  "[data-organ-host='route-content']",
  ".rawDashboardShell:has(.appContextNav[data-open='true'][data-pinned='true']) .appBodyStage",
  '.appCompletedSurface','.appCompletedActions','.appNavBackArrow','.appNavHonorary','.appNavGrandchildTabs','.appNavGrandchildTab','.appUnsavedNavigationGuard','.appUnsavedNavigationActions',
  "[data-record-statuses='true']",
  "[data-work-form-grid='true'] [data-work-field='true']",
  "[data-field-mode='generated']","[data-field-mode='linked']","[data-field-mode='calculated']",
]);
if (/\[data-organ-host=['"]route-content['"]\][\s\S]{0,220}?display\s*:\s*none/i.test(geometry)) failures.push('القبطان الموحد يخفي مضيف العضو؛ ممنوع إسقاط محتوى المسارات.');
if (/\[data-organ-host=['"]route-content['"]\][\s\S]{0,260}?(?:position\s*:\s*fixed|transform\s*:\s*scale)/i.test(geometry)) failures.push('القبطان الموحد يعيد تحجيم/تثبيت العضو نفسه بدل حمله داخل مساحة العمل الطبيعية.');

const forbiddenGeometry = [
  'app/dashboard/raw-phase.css','app/dashboard/transaction-underwear.css','app/dashboard/app-shell-v2.css','app/dashboard/app-body-v3.css','app/dashboard/living-navigation.css','app/dashboard/body-resuscitation.css','app/dashboard/legacy-structure-bridge-v1.css','app/dashboard/navigation-comfort-v1.css','app/dashboard/arkan-field-geometry-v1.css','app/dashboard/arkan-workspace-geometry-v1.css',
];
for (const file of forbiddenGeometry) if (exists(file)) failures.push(`${file}: هندسة قديمة ممنوعة بعد توحيد القبطان.`);

requireText('components/ui/ConstitutionUI.js', ["import { useWorkSurface } from './WorkSurfaceRuntime'",'const resolvedMode = surface?.mode || mode ||','data-page-portal','data-work-section-style','boundary = false','export function WorkFormGrid','export function WorkField','data-field-mode={mode}','export function DocumentBody','export function DocumentSection','export function ContextActions','secondary-overflow','export function ViewOptions','export function RecordList','export function RecordRow','export function RecordSummary','export function InlineStatus']);
requireText('lib/record-selection.js', ['normalizeRecordSelection','selectionQueryValue','appendSelectionToUrl','filterBySelection','selectionState']);
requireText('components/ui/RawGrid.js', ['data-cell-type','data-grid-field','data-keyboard-policy="enter-tab-native"','data-selection-surface','data-record-selected','selection = null','visibleKeys',"case 'money'","case 'multiline'","case 'generated'","case 'linked'","case 'calculated'",'data-work-underwear="transaction-grid-v1"']);
requireText('components/ui/ProgramAction.js', ['WORK_ACTION_SCOPE','selectionCount','data-action-scope','data-selection-required','data-bulk-decision-allowed']);
requireText('components/ui/WorkSheetKernel.js', ['export function WorkSelectionDock','data-selection-dock','data-selection-count']);
requireText('components/ui/GlobalSearch.js', ["import { WORK_SURFACE_EVENT } from './WorkSurfaceRuntime'",'WORK_SURFACE_EVENT.PAGE_COMMAND','Ctrl K · /']);
requireText('lib/access-ui.js', ['export function canUseCapability','export function canUseAnyCapability','قاعدة البيانات/RPC تظل صاحبة الحكم الأمني النهائي']);

const projects = requireText('app/dashboard/projects/page.js', ['useDashboardSession','canUseCapability','projectCaretakerState','normalizeProjectCare','projectApproachHref','RecordList','RecordRow','RecordSummary','FilterSurface']);
if (/projects-redesign\.module\.css|projectCard|projectGrid/.test(projects)) failures.push('/dashboard/projects: سجل المشاريع لا يجوز أن يعود إلى بطاقات Dashboard محلية.');
if (/v_my_capabilities|fn_is_primary_user|is_system_admin/.test(projects)) failures.push('/dashboard/projects: الصفحة أعادت اختراع حقيقة صلاحيات العرض بدل DashboardSession.');

requireText('app/dashboard/projects/[id]/anatomy/page.js', ['ProjectAnatomyStage','useDashboardSession',"select('id,project_no,name_ar,city,stage,status,supply_scope,our_role,commencement_date,duration_days')"]);

const quotes = requireText('app/dashboard/quotes/page.js', ['ConstitutionPage','useDashboardSession','canUseCapability','data-new-quotation-operation="true"','data-stage-occupancy="single-action"','— إصدار جديد','WorkFormGrid','WorkField','ActionDock','بدء ${documentLabel}']);
if (quotes.includes('<table>') || quotes.includes('العمل الجاري') || quotes.includes('السجل')) failures.push('/dashboard/quotes: المعاملات الموجودة لا يجوز أن تعود إلى المسرح؛ المسرح لإجراء جديد واحد فقط.');
if (/v_my_capabilities|fn_is_primary_user|is_system_admin/.test(quotes)) failures.push('/dashboard/quotes: الصفحة أعادت اختراع صلاحيات العرض بدل النواة.');

const quoteBoundary = requireText('app/dashboard/quotes/layout.js', ['publishGrandchildNavigationContext','QUOTE_LIST_TABS',"classification:'status-then-client'",'groupsByClient','data-selected-quote-actions="true"','data-action-consequence="destructive"']);
if (!quoteBoundary.includes('router.push(`/dashboard/quotes/${data}`)')) failures.push('عروض الأسعار: نسخ العرض يجب أن يفتح النسخة نفسها كموضوع العمل الجديد.');

const payroll = requireText('app/dashboard/workspace/workforce/section/payroll/page.js', ['selection={{','WorkSelectionDock','طباعة المحدد','رفع المحدد للمالية']);
if (/p_source_table:'payroll_runs'.*fn_submit_transaction_source/s.test(payroll)) failures.push('الرواتب: ممنوع إعادة إرسال المسير كاملًا كبديل عن معاملة الموظفين المحددين.');

const budget = requireText('app/dashboard/operating-budget/page.js', ['selectedStatementIds','WorkSelectionDock','printSelectedStatement','طباعة المحدد']);
if (/submitSelectedStatement|approveSelectedStatement/i.test(budget)) failures.push('ميزانية التشغيل: التقرير المشتق لا ينشئ معاملة جماعية بلا مصدر تشغيلي صريح.');

const portalApprovals = requireText('app/dashboard/workspace/[portal]/approvals/page.js', [
  'RecordList','RecordRow','RecordSummary','StatusChip','ConstitutionDialog','data-record-statuses="true"',
]);
if (/\.module\.css|window\.prompt/.test(portalApprovals)) failures.push('اعتمادات البوابة: يجب أن تستهلك primitives والحوار الموحدين دون هندسة صفحة أو نافذة متصفح موازية.');

if (failures.length) {
  console.error('\nProgram-driven work surface audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Program-driven work surface audit passed: one unified dashboard geometry preserves organs, gives every field one family, and one real action or selected transaction owns the stage.');
