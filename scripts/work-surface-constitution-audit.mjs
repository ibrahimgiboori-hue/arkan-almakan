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
  'continuous-sheet-not-card-dashboard',
  'flow-unless-real-boundary',
  'compact-row-expands-in-context',
  'core-resolved-never-page-invented',
  'secondary-overflow',
  'WORK_INTERFACE_ROLE',
  'WORK_ACTION_KIND',
  'same-work-surface-not-mobile-clone',
  "from './app-constitution'",
  'AREAS.flatMap',
  'PROJECT_NAV_GROUPS.flatMap',
  'resolveWorkSurface',
  'defineWorkAction',
]);

if (/localStorage|sessionStorage/.test(constitution)) failures.push('work-surface constitution: حالة العمل لا يجوز أن تعيش في تخزين متصفح موازٍ.');
if (/export\s+const\s+AREAS\s*=/.test(constitution)) failures.push('work-surface constitution: ممنوع نسخ خريطة البوابات بدل اشتقاقها من app-constitution.');

const runtime = requireText('components/ui/WorkSurfaceRuntime.js', [
  'resolveWorkSurface',
  'data-work-surface-policy',
  'WorkSurfaceContext.Provider',
  'export function useWorkSurface',
  'arkan:page-command-requested',
  'arkan:close-context-requested',
]);
if (/localStorage|sessionStorage/.test(runtime)) failures.push('WorkSurfaceRuntime: ممنوع تخزين سياق الورقة محليًا.');

requireText('app/dashboard/layout.js', [
  "import WorkSurfaceRuntime from '@/components/ui/WorkSurfaceRuntime'",
  '<WorkSurfaceRuntime>',
  '</WorkSurfaceRuntime>',
  'data-work-kernel="operational-notebook-v1"',
]);

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

requireText('components/ui/RawGrid.js', [
  'data-cell-type',
  'data-grid-field',
  'data-keyboard-policy="enter-tab-native"',
  "case 'money'",
  "case 'multiline'",
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

if (failures.length) {
  console.error('\nProgram-driven work surface audit failed:\n');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Program-driven work surface audit passed: one notebook constitution controls surfaces, actions and interaction grammar.');
