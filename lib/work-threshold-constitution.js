// DNA عتبة العمل في الجسد الجديد.
// التنقل التشريحي يحدد أين أنت؛ عبور العتبة يغيّر وضعية الجسد إلى العمل،
// لكنه لا يبدأ معاملة ولا ينشئ تغييرات من تلقاء نفسه.

export const WORK_POSTURE = Object.freeze({
  PERSPECTIVE: 'perspective',
  ANATOMY: 'anatomy',
  WORK_ZONE: 'work-zone',
  WORK_SESSION: 'work-session',
});

export const WORK_THRESHOLD_POLICY = Object.freeze({
  id: 'work-threshold-v1',
  journey: 'perspective-anatomy-work-zone-work-session-release-to-zone',
  thresholdMeaning: 'enter-operational-zone-not-start-transaction',
  sessionMeaning: 'explicit-user-work-that-can-create-or-change-operational-state',
  entryBehavior: 'single-quiet-transition-no-modal-no-toast-no-interstitial',
  visualBehavior: 'subtle-context-line-and-small-body-posture-shift',
  navigationBehavior: 'temporary-navigation-yields-to-work-zone-after-selection',
  pinnedNavigationPolicy: 'explicit-user-pin-remains-an-override',
  completionBehavior: 'release-session-without-forgetting-current-work-zone',
  historyBehavior: 'do-not-return-to-browser-history-after-completion',
  zoneMemory: 'route-derived-zone-context-survives-session-release',
  transactionBoundary: 'work-zone-is-not-dirty-and-is-not-working-by-itself',
});

const PROJECT_OPERATION_FUNCTIONS = Object.freeze([
  Object.freeze({ suffix:'/operations', label:'الحضور' }),
  Object.freeze({ suffix:'/operations/expenses', label:'المصروفات' }),
  Object.freeze({ suffix:'/operations/output', label:'الإنجاز اليومي' }),
  Object.freeze({ suffix:'/operations/movements', label:'حركات اليوم' }),
]);

function projectOperationsContext(pathname) {
  const match = String(pathname || '').match(/^\/dashboard\/projects\/([^/]+)(\/operations(?:\/[^/?#]+)?)?\/?$/);
  if (!match?.[1] || !match?.[2]) return null;
  const projectId = match[1];
  const suffix = match[2].replace(/\/$/, '');
  const current = PROJECT_OPERATION_FUNCTIONS.find((item) => item.suffix === suffix);
  if (!current) return null;
  return Object.freeze({
    posture:WORK_POSTURE.WORK_ZONE,
    zoneKey:'project-operations',
    zoneLabel:'التشغيل',
    functionLabel:current.label,
    parentLabel:'المشروع',
    parentHref:`/dashboard/projects/${projectId}`,
    subject:Object.freeze({ entityType:'project', entityId:projectId, stageKey:'operations' }),
  });
}

const DIRECT_WORK_ZONES = Object.freeze([
  Object.freeze({ path:'/dashboard/attendance', zoneKey:'workforce-attendance', zoneLabel:'الموارد البشرية', functionLabel:'الحضور والانصراف' }),
  Object.freeze({ path:'/dashboard/leaves', zoneKey:'workforce-leaves', zoneLabel:'الموارد البشرية', functionLabel:'الإجازات' }),
  Object.freeze({ path:'/dashboard/advances', zoneKey:'finance-advances', zoneLabel:'المالية', functionLabel:'السلف والمديونيات' }),
  Object.freeze({ path:'/dashboard/approvals', zoneKey:'approvals', zoneLabel:'المتابعة', functionLabel:'الاعتمادات' }),
]);

export function resolveWorkThreshold(pathname = '') {
  const path = String(pathname || '').replace(/\/$/, '') || '/';
  if (path === '/dashboard' || path === '/dashboard/my-work' || path === '/dashboard/my-work/approvals') {
    return Object.freeze({ posture:WORK_POSTURE.PERSPECTIVE, zoneKey:null, zoneLabel:'', functionLabel:'', parentLabel:'', parentHref:'', subject:null });
  }

  const projectOperations = projectOperationsContext(path);
  if (projectOperations) return projectOperations;

  const direct = DIRECT_WORK_ZONES.find((item) => path === item.path);
  if (direct) {
    return Object.freeze({
      posture:WORK_POSTURE.WORK_ZONE,
      zoneKey:direct.zoneKey,
      zoneLabel:direct.zoneLabel,
      functionLabel:direct.functionLabel,
      parentLabel:direct.zoneLabel,
      parentHref:'',
      subject:null,
    });
  }

  return Object.freeze({ posture:WORK_POSTURE.ANATOMY, zoneKey:null, zoneLabel:'', functionLabel:'', parentLabel:'', parentHref:'', subject:null });
}

export function isWorkZoneContext(context) {
  return context?.posture === WORK_POSTURE.WORK_ZONE && Boolean(context?.zoneKey);
}
