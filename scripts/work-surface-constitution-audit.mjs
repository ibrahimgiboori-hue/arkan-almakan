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
  'program-driven-notebook-v2',
  'work-first-v3',
  'continuous-sheet-not-card-dashboard',
  'flow-unless-real-boundary',
  'compact-row-expands-in-context',
  'core-resolved-never-page-invented',
  'secondary-overflow',
  'WORK_INTERFACE_ROLE',
  'WORK_ACTION_KIND',
  'WORK_ACTION_SCOPE',
  'WORK_SELECTION_POLICY',
  'explicit-record-set-action-scope-v1',
  'selection-alone-never-mutates-data',
  'server-snapshot-validated-batch-source-only',
  'print-export-only-unless-explicit-governed-batch-source',
  'deny-unless-action-explicitly-declares',
  'same-work-surface-not-mobile-clone',
  'route-content-preserved-in-place',
  'single-route-content-host-no-cloning',
  'hidden-until-explicitly-called',
  'progressive-drill-in-no-stacked-accordions',
  'reserve-space-on-desktop-overlay-on-touch',
  'work-first-no-global-status-card-wall',
  'forbidRouteContentDuplication',
  'forbidBodyOwnedBusinessLogic',
  'forbidBodyFeatureDeletionDuringMigration',
  "from './app-constitution'",
  'AREAS.flatMap',
  'PROJECT_NAV_GROUPS.flatMap',
  'resolveWorkSurface',
  'defineWorkAction',
]);

if (/localStorage|sessionStorage/.test(constitution)) failures.push('work-surface constitution: حالة العمل لا يجوز أن تعيش في تخزين متصفح موازٍ.');
if (/export\s+const\s+AREAS\s*=/.test(constitution)) failures.push('work-surface constitution: ممنوع نسخ خريطة البوابات بدل اشتقاقها من app-constitution.');

const sessionConstitution = requireText('lib/work-session-constitution.js', [
  'zero-residue-work-session-v2',
  'user-work-session-not-page',
  'being-in-a-work-zone-does-not-mean-a-work-session-has-started',
  'a-procedural-session-must-end-with-an-explicit-terminal-action',
  'server-confirmed-effect-only',
  'action-server-commit-audit-completion-surface-release',
  'replace-active-route-organ-with-clean-completion-surface',
  'no-form-no-old-record-list-no-session-actions-after-release',
  'past-transactions-live-in-register-search-reports-not-under-active-work',
  'live-work-must-be-resolved-before-route-release',
  'navigation-cannot-silently-abandon-dirty-work',
  'draft-preserves-editable-work-state-without-creating-business-effect',
  'the-organ-owns-draft-persistence-the-body-only-orchestrates-leaving',
  'bodyMustNotInferCompletionFromButtonClick',
  'bodyMustNotInferCompletionFromToast',
  'bodyMustNotOwnBusinessTransition',
  'bodyMustNotInventDraftPersistence',
  'WORK_COMPLETION_KIND',
  'WORK_SESSION_STATE',
  'WORK_LEAVE_DECISION',
]);
if (/localStorage|sessionStorage/.test(sessionConstitution)) failures.push('work-session constitution: خاتمة الجلسة أو العمل الحي لا يجوز أن يعيش في تخزين متصفح موازٍ.');

const runtime = requireText('components/ui/WorkSurfaceRuntime.js', [
  'resolveWorkSurface',
  'data-work-surface-policy',
  'WorkSurfaceContext.Provider',
  'export function useWorkSurface',
  'arkan:page-command-requested',
  'arkan:close-context-requested',
]);
if (/localStorage|sessionStorage/.test(runtime)) failures.push('WorkSurfaceRuntime: ممنوع تخزين سياق الورقة محليًا.');

const sessionRuntime = requireText('components/ui/WorkSessionRuntime.js', [
  "from '@/lib/work-session-constitution'",
  "BEGIN: 'arkan:work-session-begin'",
  "DIRTY: 'arkan:work-session-dirty'",
  "CLEAN: 'arkan:work-session-clean'",
  "NAVIGATE: 'arkan:work-session-navigate'",
  'arkan:work-session-completed',
  'serverConfirmed !== true',
  'emitWorkSessionCompletion',
  'emitWorkSessionDirty',
  'requestWorkNavigation',
  'data-work-session-state',
  'data-work-dirty',
  'CompletedSurface',
  'LeaveWorkDialog',
  'WORK_SESSION_STATE.IDLE',
  'const [started, setStarted] = useState(false)',
  'const [pendingWork, setPendingWork] = useState(null)',
  'setStarted(true)',
  'setCompletion(null)',
  'beforeunload',
]);
if (/localStorage|sessionStorage/.test(sessionRuntime)) failures.push('WorkSessionRuntime: حالة انتهاء جلسة العمل أو بوابة المغادرة لا تُخزن محليًا.');
if (!/completion\s*\?\s*<CompletedSurface[\s\S]{0,180}:\s*children/.test(sessionRuntime)) {
  failures.push('WorkSessionRuntime: الخاتمة يجب أن تستبدل مشهد العمل المنتهي بدل إبقاء العضو والقوائم تحته.');
}
if (!sessionRuntime.includes('pendingWork?.dirty')) failures.push('WorkSessionRuntime: الملاحة يجب أن تمر على حالة العمل الحي قبل تحرير المسار.');

const layout = requireText('app/dashboard/layout.js', [
  "import WorkSurfaceRuntime from '@/components/ui/WorkSurfaceRuntime'",
  "import WorkSessionRuntime from '@/components/ui/WorkSessionRuntime'",
  "'./app-body-v3.css'",
  '<WorkSurfaceRuntime>',
  '</WorkSurfaceRuntime>',
  '<WorkSessionRuntime>',
  '</WorkSessionRuntime>',
  'data-work-kernel="operational-notebook-v1"',
  'className="appBodyStage"',
  'data-application-body="work-first-v3"',
  'data-organ-host="route-content"',
  'data-organ-preservation="in-place"',
]);

if ((layout.match(/\{children\}/g) || []).length !== 1) {
  failures.push('app/dashboard/layout.js: محتوى المسار يجب أن يركب مرة واحدة فقط داخل الجسد الجديد؛ ممنوع نسخ العضو أو عرضه في سطح موازٍ.');
}

const bodyCss = requireText('app/dashboard/app-body-v3.css', [
  'APPLICATION BODY V3',
  "[data-organ-host='route-content']",
  ".appContextNav[data-open='true'][data-pinned='true']",
  'padding-inline-end: var(--app-body-nav-width)',
  'content: none !important',
  '.appCompletedSurface',
  '.appCompletedActions',
  'data-work-session-state',
]);
if (/\[data-organ-host=['"]route-content['"]\][\s\S]{0,220}?display\s*:\s*none/i.test(bodyCss)) {
  failures.push('app-body-v3.css: الجسد الجديد يخفي مضيف العضو؛ ممنوع إسقاط محتوى المسارات أثناء الهجرة.');
}
if (/\[data-organ-host=['"]route-content['"]\][\s\S]{0,260}?(?:position\s*:\s*fixed|transform\s*:\s*scale)/i.test(bodyCss)) {
  failures.push('app-body-v3.css: الجسد الجديد يعيد تحجيم/تثبيت العضو نفسه بدل حمله داخل مساحة العمل الطبيعية.');
}

requireText('components/ui/ConstitutionUI.js', [
  "import { useWorkSurface } from './WorkSurfaceRuntime'",
  'const resolvedMode = surface?.mode || mode ||',
  'data-page-portal',
  'data-work-section-style',
  'boundary = false',
  'export function ContextActions',
  'secondary-overflow',
  'export function ViewOptions',
  'export function RecordList',
  'export function RecordRow',
  'export function RecordSummary',
  'export function InlineStatus',
]);

requireText('lib/record-selection.js', [
  'normalizeRecordSelection',
  'selectionQueryValue',
  'appendSelectionToUrl',
  'filterBySelection',
  'selectionState',
]);

requireText('components/ui/RawGrid.js', [
  'data-cell-type',
  'data-grid-field',
  'data-keyboard-policy="enter-tab-native"',
  'data-selection-surface',
  'data-record-selected',
  'selection = null',
  'visibleKeys',
  "case 'money'",
  "case 'multiline'",
]);

requireText('components/ui/ProgramAction.js', [
  'WORK_ACTION_SCOPE',
  'selectionCount',
  'data-action-scope',
  'data-selection-required',
  'data-bulk-decision-allowed',
]);

requireText('components/ui/WorkSheetKernel.js', [
  'export function WorkSelectionDock',
  'data-selection-dock',
  'data-selection-count',
]);

requireText('components/ui/GlobalSearch.js', [
  "import { WORK_SURFACE_EVENT } from './WorkSurfaceRuntime'",
  'WORK_SURFACE_EVENT.PAGE_COMMAND',
  'Ctrl K · /',
]);

requireText('lib/access-ui.js', [
  'export function canUseCapability',
  'export function canUseAnyCapability',
  'قاعدة البيانات/RPC تظل صاحبة الحكم الأمني النهائي',
]);

const projects = requireText('app/dashboard/projects/page.js', [
  'useDashboardSession',
  'canUseCapability',
  'RecordList',
  'RecordRow',
  'RecordSummary',
  'SummaryStrip',
  'FilterSurface',
]);
if (/projects-redesign\.module\.css|projectCard|projectGrid/.test(projects)) failures.push('/dashboard/projects: سجل المشاريع لا يجوز أن يعود إلى بطاقات Dashboard محلية.');
if (/v_my_capabilities|fn_is_primary_user|is_system_admin/.test(projects)) failures.push('/dashboard/projects: الصفحة أعادت اختراع حقيقة صلاحيات العرض بدل DashboardSession.');

const quotes = requireText('app/dashboard/quotes/page.js', [
  'ConstitutionPage',
  'TableFrame',
  'ContextActions',
  'useDashboardSession',
  'canUseCapability',
  'data-action-consequence="destructive"',
]);
if (/className=["']page-head["']|style=\{\{width:420|minWidth:420/.test(quotes)) failures.push('/dashboard/quotes: عاد تخطيط سجل محلي كثيف بدل دفتر البرنامج.');
if (/v_my_capabilities|fn_is_primary_user|is_system_admin/.test(quotes)) failures.push('/dashboard/quotes: الصفحة أعادت اختراع صلاحيات العرض بدل النواة.');

const payroll = requireText('app/dashboard/workspace/workforce/section/payroll/page.js', [
  'selection={{',
  'WorkSelectionDock',
  'طباعة المحدد',
  'رفع المحدد للمالية',
]);
if (/p_source_table:'payroll_runs'.*fn_submit_transaction_source/s.test(payroll)) failures.push('الرواتب: ممنوع إعادة إرسال المسير كاملًا كبديل عن معاملة الموظفين المحددين.');

const budget = requireText('app/dashboard/operating-budget/page.js', [
  'selectedStatementIds',
  'WorkSelectionDock',
  'printSelectedStatement',
  'طباعة المحدد',
]);
if (/submitSelectedStatement|approveSelectedStatement/i.test(budget)) failures.push('ميزانية التشغيل: التقرير المشتق لا ينشئ معاملة جماعية بلا مصدر تشغيلي صريح.');

if (failures.length) {
  console.error('\nProgram-driven work surface audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Program-driven work surface audit passed: one notebook body preserves route organs, enforces zero-residue completion and live-work leaving, and controls surfaces, selection scopes, actions and interaction grammar.');
