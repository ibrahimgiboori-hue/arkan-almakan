// دستور سطح العمل: الصفحة تعلن سياقها فقط، والبرنامج يقرر كيف تتصرف الواجهة.
// لا توجد خريطة بوابات موازية هنا؛ المصدر التنظيمي يبقى app-constitution.js.
import { AREAS, PROJECT_NAV_GROUPS, activeConstitutionItem } from './app-constitution';

export const WORK_SURFACE_MODE = Object.freeze({
  NOTEBOOK: 'notebook',
  LEDGER: 'ledger',
  DOCUMENT: 'document',
});

export const WORK_SCREEN_KIND = Object.freeze({
  HOME: 'home',
  COLLECTION: 'collection',
  RECORD: 'record',
  PROJECT: 'project',
  PROJECT_TOOL: 'project-tool',
});

export const WORK_SAVE_POLICY = Object.freeze({
  SAFE_AUTO: 'safe-autosave',
  EXPLICIT: 'explicit-save',
  CONSEQUENCE: 'explicit-consequential-action',
});

export const WORK_ACTION_PLACEMENT = Object.freeze({
  ORIGIN: 'at-origin',
  HEADER: 'compact-header',
  OVERFLOW: 'secondary-overflow',
  DOCK: 'sheet-dock',
});

export const WORK_ACTION_CONSEQUENCE = Object.freeze({
  SAFE: 'safe',
  REVERSIBLE: 'reversible',
  CONSEQUENTIAL: 'consequential',
  DESTRUCTIVE: 'destructive',
});

export const WORK_SURFACE_POLICY = Object.freeze({
  id: 'program-driven-notebook-v2',
  model: 'one-program-one-notebook',
  composition: 'continuous-sheet-not-card-dashboard',
  defaultMode: WORK_SURFACE_MODE.NOTEBOOK,
  sectionPresentation: 'flow-unless-real-boundary',
  recordPresentation: 'compact-row-expands-in-context',
  tablePresentation: 'quiet-semantic-ledger',
  editPolicy: 'click-or-focus-to-edit',
  safeSavePolicy: WORK_SAVE_POLICY.SAFE_AUTO,
  consequentialSavePolicy: WORK_SAVE_POLICY.CONSEQUENCE,
  primaryActionPlacement: WORK_ACTION_PLACEMENT.ORIGIN,
  secondaryActionPlacement: WORK_ACTION_PLACEMENT.OVERFLOW,
  viewPolicy: 'same-data-multiple-views-no-parallel-data',
  permissionPolicy: 'core-resolved-never-page-invented',
  actionContextPolicy: 'core-resolved-system-actor-and-real-actor',
  printPolicy: 'same-content-through-print-constitution',
  feedbackPolicy: 'quiet-inline-status-errors-near-source',
  ordinaryUndoPolicy: 'prefer-undo-over-confirmation',
  consequentialConfirmationPolicy: 'confirm-or-govern-before-final-effect',
  keyboardPolicy: 'enter-tab-arrows-slash-and-global-command',
  forbidHeroDashboardAsWorkSurface: true,
  forbidCardAsDefaultSection: true,
  forbidPageLocalPermissionTruth: true,
  forbidPageLocalVisualConstitution: true,
  forbidParallelRecordDetailStateWhenRouteContextExists: true,
});

function visibleToolEntries() {
  return AREAS.flatMap((area) =>
    area.items
      .filter((item) => !item.hidden && !item.legacy)
      .map((item) => ({
        portalKey: area.key,
        portalLabel: area.label,
        href: item.href,
        label: item.label,
        capabilities: item.capabilities || [],
      }))
  );
}

export const WORK_TOOL_REGISTRY = Object.freeze(visibleToolEntries());

function projectTool(pathname, searchParams) {
  const match = String(pathname || '').match(/^\/dashboard\/projects\/([^/]+)(.*)$/);
  if (!match) return null;
  const projectId = match[1];
  const rest = match[2] || '';
  const view = searchParams?.get?.('view') || 'overview';
  const candidates = PROJECT_NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, groupKey:group.key, groupLabel:group.label })));

  let current = null;
  if (!rest) {
    current = candidates.find((item) => (item.view || 'overview') === view) || candidates.find((item) => item.view === 'overview');
  } else {
    current = candidates
      .filter((item) => item.suffix && (rest === item.suffix || rest.startsWith(`${item.suffix}/`)))
      .sort((a,b) => b.suffix.length - a.suffix.length)[0] || null;
  }

  return {
    portalKey:'projects',
    portalLabel:'بوابة المشاريع',
    toolKey:current?.key || 'project',
    toolLabel:current?.label || 'المشروع',
    toolGroupKey:current?.groupKey || null,
    toolGroupLabel:current?.groupLabel || null,
    projectId,
    kind:current ? WORK_SCREEN_KIND.PROJECT_TOOL : WORK_SCREEN_KIND.PROJECT,
  };
}

function ordinaryTool(pathname) {
  const exact = activeConstitutionItem(pathname);
  if (!exact) return null;
  const base = exact.href;
  const recordTail = pathname === base ? '' : pathname.slice(base.length).replace(/^\//,'');
  return {
    portalKey:exact.area.key,
    portalLabel:exact.area.label,
    toolKey:base,
    toolLabel:exact.label,
    toolHref:base,
    capabilities:exact.capabilities || [],
    kind:recordTail ? WORK_SCREEN_KIND.RECORD : (base === '/dashboard' ? WORK_SCREEN_KIND.HOME : WORK_SCREEN_KIND.COLLECTION),
    recordPath:recordTail || null,
  };
}

export function resolveWorkSurface(pathname, searchParams = null) {
  const project = projectTool(pathname, searchParams);
  const tool = project || ordinaryTool(pathname) || {
    portalKey:'unknown', portalLabel:'', toolKey:String(pathname || ''), toolLabel:'', kind:WORK_SCREEN_KIND.COLLECTION,
  };

  return Object.freeze({
    ...WORK_SURFACE_POLICY,
    ...tool,
    mode:WORK_SURFACE_MODE.NOTEBOOK,
  });
}

export function defineWorkAction(action = {}) {
  if (!action.key) throw new Error('Work action key is required');
  if (!action.label) throw new Error(`Work action ${action.key} requires a label`);
  const consequence = action.consequence || WORK_ACTION_CONSEQUENCE.SAFE;
  const placement = action.placement || (
    consequence === WORK_ACTION_CONSEQUENCE.SAFE
      ? WORK_ACTION_PLACEMENT.ORIGIN
      : WORK_ACTION_PLACEMENT.OVERFLOW
  );
  return Object.freeze({
    ...action,
    consequence,
    placement,
    savePolicy:action.savePolicy || (
      consequence === WORK_ACTION_CONSEQUENCE.SAFE
        ? WORK_SAVE_POLICY.SAFE_AUTO
        : WORK_SAVE_POLICY.CONSEQUENCE
    ),
  });
}

export function surfaceDataAttributes(surface) {
  return {
    'data-work-surface-mode':surface?.mode || WORK_SURFACE_MODE.NOTEBOOK,
    'data-work-portal':surface?.portalKey || 'unknown',
    'data-work-tool':surface?.toolKey || 'unknown',
    'data-work-screen-kind':surface?.kind || WORK_SCREEN_KIND.COLLECTION,
    'data-work-composition':WORK_SURFACE_POLICY.composition,
  };
}
