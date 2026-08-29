// دستور التشغيل المركزي V2 — المصدر الأعلى للقواعد المشتركة في النظام.
// ممنوع إنشاء قاعدة تشغيلية أو بصرية أو حالة معاملة موازية داخل صفحة إذا كان لها تعريف هنا.
export const SYSTEM_VERSION = '2.11.0-constitution';

export const CONSTITUTION = Object.freeze({
  id: 'arkan-master-constitution-v2',
  ui: Object.freeze({
    id: 'approved-black-shell-v2',
    rootAttribute: 'data-ui-constitution',
    currentShell: 'black-command-shell',
    changePolicy: 'tokens-and-shared-components-first',
  }),
  workSurface: Object.freeze({
    id: 'operational-notebook-v1',
    rootAttribute: 'data-work-kernel',
    pageAttribute: 'data-work-sheet',
    model: 'one-program-one-notebook',
    geometryPolicy: 'single-kernel-for-all-portals-and-tools',
    viewportPolicy: 'fluid-full-width',
    layoutOrder: Object.freeze(['navigation', 'sheet-header', 'ledger-or-work-area', 'action-dock']),
    stableHorizontalRails: true,
    stableVerticalRhythm: true,
    stableScrollbarGutter: true,
    useAvailableViewportWidth: true,
    forbidFixedViewportScaling: true,
    forbidSessionStoredViewportZoom: true,
    forbidPageLocalGeometryWhenKernelExists: true,
    finalSkinMayChangeWithoutReplacingKernel: true,
  }),
  interactionJourney: Object.freeze({
    id: 'contextual-work-continuity-v1',
    principle: 'the-user-must-never-search-for-work-they-just-opened',
    rawSurfacePolicy: 'preserve-current-interface-structure-and-style-by-default',
    smallWorkPlacement: 'inline-near-origin',
    largeWorkPlacement: 'viewport-pinned-contextual-surface',
    independentWorkspacePlacement: 'dedicated-route-only',
    statePolicy: 'record-work-context-is-url-derived-not-parallel-page-local-open-flags',
    originPolicy: 'stable-origin-id-primary-scroll-position-secondary',
    closePolicy: 'restore-origin-context-and-focus-without-jumping-to-page-top',
    browserBackPolicy: 'browser-back-and-internal-close-follow-the-same-context-exit',
    nestedWorkPolicy: 'context-stack-one-level-deeper-first-expand-only-when-needed',
    focusPolicy: 'programmatic-focus-only-after-direct-user-open-close-or-validation-action',
    validationPolicy: 'focus-first-invalid-field-inside-current-work-surface',
    motionPolicy: 'short-functional-motion-only-and-respect-reduced-motion',
    forbidRemoteFixedEditorOnLongPage: true,
    forbidPixelOnlyReturnAnchor: true,
    forbidBackgroundFocusSteal: true,
    forbidPageLocalCompetingWorkSurfaceState: true,
  }),
  print: Object.freeze({
    id: 'print-governance-v2',
    rootAttribute: 'data-print-constitution',
    engine: 'constitution-print-frame',
    changePolicy: 'shared-frame-and-central-settings-only',
  }),
  approvals: Object.freeze({
    id: 'approval-party-governance-v1',
    engine: 'approval-governance',
    changePolicy: 'central-party-signatory-and-visibility-rules-only',
    editorPlacement: 'document-data-section',
    snapshotSignatories: true,
    forbidGlobalEditorMount: true,
    forbidPageLocalPartyRules: true,
  }),
  transactions: Object.freeze({
    id: 'transaction-governance-v2',
    rootAttribute: 'data-transaction-constitution',
    changePolicy: 'central-status-and-transition-rules-only',
  }),
  operatingBudget: Object.freeze({
    id: 'company-operating-budget-v3',
    engine: 'company-operating-budget-engine-v2',
    route: '/dashboard/operating-budget',
    writePolicy: 'single-rpc-gateway-only',
    catalogGateway: 'budget_save_catalog_node',
    actualPaymentSource: 'treasury_movements',
    reservePolicy: 'virtual-earmark-not-bank-transfer',
    forecastPolicy: 'obligation-cycles-with-catch-up-reserve',
    catalogPolicy: 'category-and-cost-behavior-are-separate',
    valueOriginPolicy: 'leaf-calculation-nodes-only',
    aggregationPolicy: 'groups-recursively-sum-descendant-leaf-values',
    reportingPolicy: 'collapsed-and-expanded-views-share-one-calculation-tree',
    groupNodePolicy: 'classification-only-no-independent-financial-value',
    itemNodePolicy: 'financial-leaf-only-must-have-group-parent-no-children',
    inputPolicy: 'runtime-inputs-are-explicit-named-schema-entries',
    inputScopePolicy: 'input-values-belong-to-period-and-calculation-subject-not-global-period-only',
    componentBasePolicy: 'input-dependent-components-reference-explicit-approved-input-key',
    componentNamingPolicy: 'ui-calls-the-selected-input-calculation-base-arabic-asas-al-ihtisab',
    calculationPolicy: 'safe-declarative-components-no-eval',
    contributionPolicy: 'aggregate-by-rule-profile-not-employee-row',
    tariffPolicy: 'versioned-rates-and-bands',
    historyPolicy: 'rate-or-input-definition-change-creates-new-effective-version-never-silent-past-rewrite',
    forbidGroupStoredAmount: true,
    forbidItemChildren: true,
    forbidOrphanFinancialLeaf: true,
    forbidImplicitComponentInput: true,
    forbidInputGuessFromLabels: true,
    forbidDeclaredButUnimplementedCalculationType: true,
    forbidPageLocalInputSchema: true,
    forbidParallelSummaryCalculation: true,
    forbidPageLocalBudgetFormulas: true,
    forbidParallelExpenseLedger: true,
    preserveHistoricalRateVersions: true,
  }),
  components: Object.freeze({
    policy: 'shared-first',
    forbidPageLocalCloneWhenSharedExists: true,
    preserveApprovedUIByDefault: true,
  }),
});

export const SYSTEM = Object.freeze({
  locale: 'ar-SA',
  direction: 'rtl',
  calendar: 'gregory',
  timezone: 'Asia/Riyadh',
  currency: 'SAR',
  vatRate: 0.15,
  lowLeaveBalanceDays: 7,
  moneyDecimals: 2,
  attendance: Object.freeze({
    fullDay: 1,
    halfDay: 0.5,
    maxPerWorkerPerDate: 1,
    states: Object.freeze({ full: 'full', half: 'half', absent: 'absent' }),
    legacyReadableStates: Object.freeze(['leave', 'stopped']),
  }),
  payroll: Object.freeze({ monthlyDailyDivisor: 30 }),
  print: Object.freeze({
    defaultSize: 'A4',
    defaultOrientation: 'portrait',
    preserveAssetQuality: true,
    splitTableRows: false,
    previewMatchesPrint: true,
    marginsMm: Object.freeze({ top: 19, right: 19, bottom: 19, left: 19 }),
    minAssetOpacity: 1,
    forbidImageFilters: true,
  }),
});

export const ATTENDANCE_PRESENTATION = Object.freeze({
  full: Object.freeze({ ar:'كامل', short:'ك', tone:'ok' }),
  half: Object.freeze({ ar:'نصف', short:'½', tone:'info' }),
  absent: Object.freeze({ ar:'غياب', short:'غ', tone:'bad' }),
  stopped: Object.freeze({ ar:'توقف', short:'ت', tone:'warn', legacy:true }),
  leave: Object.freeze({ ar:'إجازة', short:'إ', tone:'neutral', legacy:true }),
});

export const WORKFLOW_STATUS = Object.freeze({
  DRAFT: 'draft', SUBMITTED: 'submitted', REVIEWED: 'reviewed', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled',
});

export const REQUEST_STATUS = Object.freeze({
  DRAFT: WORKFLOW_STATUS.DRAFT, SUBMITTED: WORKFLOW_STATUS.SUBMITTED, HR_REVIEWED: 'hr_reviewed', ACCOUNTANT_APPROVED: 'accountant_approved', CEO_APPROVED: 'ceo_approved', REJECTED: WORKFLOW_STATUS.REJECTED, CANCELLED: WORKFLOW_STATUS.CANCELLED,
});

export const PROJECT_STATUS = Object.freeze({
  DRAFT: 'draft', ACTIVE: 'active', ON_HOLD: 'on_hold', COMPLETED: 'completed', CANCELLED: 'cancelled',
});

export const CLAIM_STATUS = Object.freeze({
  DRAFT: 'draft', SUBMITTED: 'submitted', REVIEWED: 'reviewed', APPROVED: 'approved', PARTIALLY_PAID: 'partially_paid', PAID: 'paid', REJECTED: 'rejected', CANCELLED: 'cancelled',
});

export const STATUS_LABELS_AR = Object.freeze({
  draft: 'مسودة', submitted: 'مقدّم', reviewed: 'تمت المراجعة', approved: 'معتمد',
  hr_reviewed: 'تم الإجراء الأول', accountant_approved: 'تمت المراجعة المالية', ceo_approved: 'معتمد نهائيًا',
  active: 'نشط', on_hold: 'متوقف مؤقتًا', completed: 'مكتمل', partially_paid: 'مسدد جزئيًا', paid: 'مسدد',
  rejected: 'مرفوض', cancelled: 'ملغى',
});

export function roundValue(value, decimals = SYSTEM.moneyDecimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

export function attendanceValue(status) {
  if (status === SYSTEM.attendance.states.full) return SYSTEM.attendance.fullDay;
  if (status === SYSTEM.attendance.states.half) return SYSTEM.attendance.halfDay;
  return 0;
}

export function attendancePresentation(status) {
  return ATTENDANCE_PRESENTATION[status] || Object.freeze({ ar:String(status || '—'), short:'—', tone:'neutral' });
}

export function dailyRateFromMonthly(monthlySalary) {
  return roundValue(Number(monthlySalary || 0) / SYSTEM.payroll.monthlyDailyDivisor);
}

export function calculateVat(amount, rate = SYSTEM.vatRate) {
  return roundValue(Number(amount || 0) * Number(rate || 0));
}

export function enforceAttendanceLimit(entries = []) {
  const total = entries.reduce((sum, value) => sum + (typeof value === 'string' ? attendanceValue(value) : Number(value || 0)), 0);
  return total <= SYSTEM.attendance.maxPerWorkerPerDate;
}

export function inclusiveDays(from, to) {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00+03:00`);
  const end = new Date(`${to}T00:00:00+03:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

export function operationalDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SYSTEM.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function leaveBalanceState(balance) {
  const days = Number(balance || 0);
  if (days <= 0) return 'blocked';
  if (days < SYSTEM.lowLeaveBalanceDays) return 'warning';
  return 'ok';
}

export function statusLabelAr(status, fallback = '—') { return STATUS_LABELS_AR[status] || fallback; }
export function canMutateWorkflow(status) { return [WORKFLOW_STATUS.DRAFT, WORKFLOW_STATUS.SUBMITTED].includes(status); }
export function canCancelWorkflow(status) { return ![WORKFLOW_STATUS.REJECTED, WORKFLOW_STATUS.CANCELLED, CLAIM_STATUS.PAID].includes(status); }

export function printMarginStyle(overrides = {}) {
  const m = { ...SYSTEM.print.marginsMm, ...overrides };
  return {
    '--print-margin-top': `${m.top}mm`, '--print-margin-right': `${m.right}mm`, '--print-margin-bottom': `${m.bottom}mm`, '--print-margin-left': `${m.left}mm`,
  };
}
