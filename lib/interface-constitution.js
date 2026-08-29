// دستور الواجهة الخام: البرنامج يقرر شكل وسلوك صفحة العمل من النواة، لا من الصفحة نفسها.
// المرجع العملي: دفتر مستمر + سجلات قابلة للتوسع + بيانات بعدة طرق عرض + أوامر سياقية هادئة.

export const INTERFACE_CONSTITUTION = Object.freeze({
  id: 'arkan-raw-notebook-v1',
  metaphor: 'operational-notebook',
  shell: 'single-top-control-plane',
  page: 'continuous-work-sheet',
  section: 'flow-first-boundary-only-when-needed',
  record: 'compact-row-opens-context',
  table: 'semantic-ledger-inline-edit',
  detail: 'expand-or-open-record-never-parallel-dashboard',
  primaryAction: 'at-origin',
  secondaryActions: 'overflow-or-context-menu',
  viewOptions: 'presentation-only-never-data-copy',
  safeEdit: 'direct-edit-with-quiet-save',
  consequentialAction: 'explicit-governed-commit',
  feedback: 'inline-near-source',
  emptyState: 'quiet-and-actionable',
  keyboard: 'enter-tab-arrows-slash-escape',
  permissions: 'session-and-core-resolved',
  audit: 'system-actor-plus-real-actor',
  print: 'same-content-through-print-constitution',
  responsive: 'same-work-surface-not-mobile-clone',
});

export const INTERFACE_ROLE = Object.freeze({
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
});

export const ACTION_KIND = Object.freeze({
  CREATE: 'create',
  EDIT: 'edit',
  SAVE: 'save',
  REVIEW: 'review',
  APPROVE: 'approve',
  ROUTE: 'route',
  PRINT: 'print',
  EXPORT: 'export',
  DELETE: 'delete',
  VIEW: 'view',
});

export const ACTION_RISK = Object.freeze({
  SAFE: 'safe',
  REVERSIBLE: 'reversible',
  CONSEQUENTIAL: 'consequential',
  DESTRUCTIVE: 'destructive',
});

export const ACTION_PLACEMENT = Object.freeze({
  ORIGIN: 'at-origin',
  HEADER: 'compact-header',
  OVERFLOW: 'secondary-overflow',
  DOCK: 'sheet-dock',
});

export function defineInterfaceAction(action = {}) {
  if (!action.key) throw new Error('Interface action key is required');
  if (!action.label) throw new Error(`Interface action ${action.key} requires a label`);

  const risk = action.risk || ACTION_RISK.SAFE;
  const placement = action.placement || (
    risk === ACTION_RISK.SAFE ? ACTION_PLACEMENT.ORIGIN : ACTION_PLACEMENT.OVERFLOW
  );

  return Object.freeze({
    kind: ACTION_KIND.EDIT,
    capability: null,
    hiddenWhenUnauthorized: true,
    ...action,
    risk,
    placement,
  });
}

export function actionAllowed(action, session) {
  if (!action?.capability) return true;
  if (session?.access?.fullAdmin) return true;
  const keys = session?.capabilityKeys;
  if (keys && typeof keys.has === 'function') return keys.has(action.capability);
  return Array.isArray(session?.capabilities)
    ? session.capabilities.some((item) => item?.capability_key === action.capability)
    : false;
}

export function interfaceDataAttributes() {
  return {
    'data-interface-constitution': INTERFACE_CONSTITUTION.id,
    'data-interface-metaphor': INTERFACE_CONSTITUTION.metaphor,
    'data-interface-shell': INTERFACE_CONSTITUTION.shell,
    'data-interface-page': INTERFACE_CONSTITUTION.page,
    'data-interface-feedback': INTERFACE_CONSTITUTION.feedback,
  };
}
