// دستور سطح العمل: الصفحة تعلن سياقها ومعناها فقط، والبرنامج يقرر كيف تتصرف الواجهة.
// لا توجد خريطة بوابات ولا دستور واجهة موازٍ هنا؛ المصدر التنظيمي يبقى app-constitution.js.
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

export const WORK_INTERFACE_ROLE = Object.freeze({
  SHEET: 'sheet',
  HEADER: 'header',
  SECTION: 'section',
  LEDGER: 'ledger',
  RECORD_LIST: 'record-list',
  RECORD: 'record',
  ENTRY: 'entry',
  ACTION: 'action',
  VIEW_OPTIONS: 'view-options',
  FEEDBACK: 'feedback',
  DOCK: 'dock',
  SELECTION: 'selection',
});

export const WORK_ACTION_KIND = Object.freeze({
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  SAVE: 'save',
  REVIEW: 'review',
  APPROVE: 'approve',
  ROUTE: 'route',
  PRINT: 'print',
  EXPORT: 'export',
  DELETE: 'delete',
});

export const WORK_ACTION_SCOPE = Object.freeze({
  SURFACE: 'surface',
  RECORD: 'record',
  SELECTION: 'selection',
});

export const WORK_SELECTION_PROFILE = Object.freeze({
  REPORT: 'report',
  TRANSACTION_BATCH: 'transaction-batch',
  OPERATIONAL_BULK: 'operational-bulk',
  DECISION_BULK: 'decision-bulk',
});

const WORK_SELECTION_ALLOWED_KINDS = Object.freeze({
  [WORK_SELECTION_PROFILE.REPORT]: Object.freeze([
    WORK_ACTION_KIND.VIEW,
    WORK_ACTION_KIND.PRINT,
    WORK_ACTION_KIND.EXPORT,
  ]),
  [WORK_SELECTION_PROFILE.TRANSACTION_BATCH]: Object.freeze([
    WORK_ACTION_KIND.VIEW,
    WORK_ACTION_KIND.PRINT,
    WORK_ACTION_KIND.EXPORT,
    WORK_ACTION_KIND.CREATE,
    WORK_ACTION_KIND.ROUTE,
    WORK_ACTION_KIND.REVIEW,
  ]),
  [WORK_SELECTION_PROFILE.OPERATIONAL_BULK]: Object.freeze([
    WORK_ACTION_KIND.VIEW,
    WORK_ACTION_KIND.EDIT,
    WORK_ACTION_KIND.SAVE,
    WORK_ACTION_KIND.PRINT,
    WORK_ACTION_KIND.EXPORT,
  ]),
  [WORK_SELECTION_PROFILE.DECISION_BULK]: Object.freeze([
    WORK_ACTION_KIND.VIEW,
    WORK_ACTION_KIND.PRINT,
    WORK_ACTION_KIND.EXPORT,
    WORK_ACTION_KIND.APPROVE,
    WORK_ACTION_KIND.DELETE,
  ]),
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

// الاختيار ليس Checkbox بصريًا؛ هو نطاق عمل صريح. الإجراء يعلن أنه يعمل على
// السجل الحالي أو مجموعة سجلات محددة، والطباعة/التصدير/المعاملات تحترم هذا النطاق.
export const WORK_SELECTION_POLICY = Object.freeze({
  id: 'explicit-record-set-action-scope-v1',
  identity: 'stable-record-id',
  resetOn: 'dataset-context-change',
  selectAll: 'visible-selectable-records-only',
  selectionEffect: 'selection-alone-never-mutates-data',
  actionScope: WORK_ACTION_SCOPE.SELECTION,
  defaultProfile: WORK_SELECTION_PROFILE.REPORT,
  print: 'selection-is-first-class-print-scope',
  export: 'selection-is-first-class-export-scope',
  transaction: 'server-snapshot-validated-batch-source-only',
  derivedReports: 'print-export-only-unless-explicit-governed-batch-source',
  operationalBulk: 'homogeneous-operation-contract-required',
  bulkDecision: 'deny-unless-action-explicitly-declares',
  clearAfterSuccessfulAction: true,
});

export const WORK_SURFACE_POLICY = Object.freeze({
  id: 'program-driven-notebook-v2',
  model: 'one-program-one-notebook',
  metaphor: 'operational-notebook',
  shell: 'single-top-control-plane',
  composition: 'continuous-sheet-not-card-dashboard',
  defaultMode: WORK_SURFACE_MODE.NOTEBOOK,
  sectionPresentation: 'flow-unless-real-boundary',
  recordPresentation: 'compact-row-expands-in-context',
  tablePresentation: 'quiet-semantic-ledger-inline-edit',
  detailPresentation: 'expand-or-open-record-never-parallel-dashboard',
  editPolicy: 'click-or-focus-to-edit',
  safeSavePolicy: WORK_SAVE_POLICY.SAFE_AUTO,
  consequentialSavePolicy: WORK_SAVE_POLICY.CONSEQUENCE,
  primaryActionPlacement: WORK_ACTION_PLACEMENT.ORIGIN,
  secondaryActionPlacement: WORK_ACTION_PLACEMENT.OVERFLOW,
  recordSelectionPolicy: WORK_SELECTION_POLICY.id,
  viewPolicy: 'same-data-multiple-views-no-parallel-data',
  permissionPolicy: 'core-resolved-never-page-invented',
  actionContextPolicy: 'core-resolved-system-actor-and-real-actor',
  printPolicy: 'same-content-through-print-constitution',
  feedbackPolicy: 'quiet-inline-status-errors-near-source',
  ordinaryUndoPolicy: 'prefer-undo-over-confirmation',
  consequentialConfirmationPolicy: 'confirm-or-govern-before-final-effect',
  keyboardPolicy: 'enter-tab-arrows-slash-and-global-command',
  responsivePolicy: 'same-work-surface-not-mobile-clone',
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
  const actionScope = action.actionScope || WORK_ACTION_SCOPE.SURFACE;
  const minSelection = actionScope === WORK_ACTION_SCOPE.SELECTION
    ? Math.max(1, Number(action.minSelection || 1))
    : 0;
  const kind = action.kind || WORK_ACTION_KIND.EDIT;
  const selectionProfile = actionScope === WORK_ACTION_SCOPE.SELECTION
    ? (action.selectionProfile || WORK_SELECTION_POLICY.defaultProfile)
    : null;
  const allowedKinds = selectionProfile ? WORK_SELECTION_ALLOWED_KINDS[selectionProfile] : null;
  const selectionProfileKnown = !selectionProfile || Boolean(allowedKinds);
  const selectionKindAllowed = !selectionProfile || Boolean(allowedKinds?.includes(kind));
  const guardedBulkDecision = actionScope === WORK_ACTION_SCOPE.SELECTION
    && [WORK_ACTION_KIND.APPROVE, WORK_ACTION_KIND.DELETE].includes(kind)
    && action.allowBulkDecision !== true;

  return Object.freeze({
    kind,
    capability:null,
    hiddenWhenUnauthorized:true,
    actionScope,
    minSelection,
    selectionProfile,
    allowBulkDecision:false,
    ...action,
    kind,
    actionScope,
    minSelection,
    selectionProfile,
    consequence,
    placement,
    selectionProfileKnown,
    selectionKindAllowed,
    bulkDecisionAllowed: !guardedBulkDecision,
    selectionActionAllowed: selectionProfileKnown && selectionKindAllowed && !guardedBulkDecision,
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
    'data-record-selection-policy':WORK_SELECTION_POLICY.id,
  };
}
