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
  stageLeafRule: 'every-choice-presented-as-the-last-navigation-layer-must-resolve-to-a-work-zone',
});

const PROJECT_REGION_AR = Object.freeze({
  operations:'التشغيل',
  scope:'النطاق والتنفيذ',
  finance:'المالية',
  documents:'المستندات والمتابعة',
  management:'بيانات ومتابعة المشروع',
});

const PROJECT_PATH_FUNCTIONS = Object.freeze([
  Object.freeze({ suffix:'/operations', label:'الحضور' }),
  Object.freeze({ suffix:'/operations/expenses', label:'المصروفات' }),
  Object.freeze({ suffix:'/operations/output', label:'الإنجاز اليومي' }),
  Object.freeze({ suffix:'/operations/movements', label:'حركات اليوم' }),
  Object.freeze({ suffix:'/operations/reports', label:'تقارير التايم شيت' }),
  Object.freeze({ suffix:'/operations/labor', label:'العمالة' }),
  Object.freeze({ suffix:'/operations/custody', label:'العهدة' }),
  Object.freeze({ suffix:'/operations/finance', label:'السلف والدفعات' }),
  Object.freeze({ suffix:'/quotes', label:'عروض المشروع' }),
  Object.freeze({ suffix:'/insights/cost-control', label:'التحكم المالي' }),
  Object.freeze({ suffix:'/insights/planning', label:'التخطيط والجدولة' }),
  Object.freeze({ suffix:'/insights/changes', label:'التغييرات' }),
  Object.freeze({ suffix:'/insights/correspondence', label:'المراسلات الفنية' }),
]);

const PROJECT_VIEW_FUNCTIONS = Object.freeze({
  overview:'ملخص المشروع',
  scope:'النطاق والإسناد',
  progress:'قياسات الإنجاز',
  claims:'المستخلصات',
  guarantees:'الضمانات والمحتجزات',
  docs:'المستندات والمواد',
  settings:'بيانات المشروع',
});

function queryValue(searchParams, key) {
  if (!searchParams) return '';
  if (typeof searchParams.get === 'function') return String(searchParams.get(key) || '');
  if (searchParams instanceof URLSearchParams) return String(searchParams.get(key) || '');
  return String(searchParams[key] || '');
}

function projectWorkContext(pathname, searchParams) {
  const path=String(pathname||'').replace(/\/$/,'');
  const match=path.match(/^\/dashboard\/projects\/([^/]+)(\/.*)?$/);
  if(!match?.[1])return null;
  const projectId=match[1];
  const suffix=match[2]||'';
  if(suffix==='/anatomy')return null;

  let functionLabel='';
  if(!suffix){
    const view=queryValue(searchParams,'view')||'overview';
    functionLabel=PROJECT_VIEW_FUNCTIONS[view]||'';
  }else{
    functionLabel=PROJECT_PATH_FUNCTIONS.find((item)=>item.suffix===suffix)?.label||'';
  }
  if(!functionLabel)return null;

  const region=queryValue(searchParams,'region');
  const zoneLabel=PROJECT_REGION_AR[region]||'المشروع';
  return Object.freeze({
    posture:WORK_POSTURE.WORK_ZONE,
    zoneKey:`project-${region||'work'}`,
    zoneLabel,
    functionLabel,
    parentLabel:'بطاقة المشروع',
    parentHref:`/dashboard/projects/${projectId}/anatomy`,
    subject:Object.freeze({ entityType:'project', entityId:projectId, stageKey:region||'work' }),
  });
}

function quotationWorkContext(pathname) {
  const path=String(pathname||'').replace(/\/$/,'');
  if(path !== '/dashboard/quotes' && !path.startsWith('/dashboard/quotes/')) return null;
  const match=path.match(/^\/dashboard\/quotes\/([^/]+)/);
  return Object.freeze({
    posture:WORK_POSTURE.WORK_ZONE,
    zoneKey:'projects-quotes',
    zoneLabel:'عروض الأسعار',
    functionLabel:match?.[1] ? 'العمل على عرض سعر' : 'إنشاء ومتابعة عروض الأسعار',
    parentLabel:'المشاريع',
    parentHref:'/dashboard',
    subject:match?.[1] ? Object.freeze({ entityType:'quotation', entityId:match[1] }) : null,
  });
}

const DIRECT_WORK_ZONES = Object.freeze([
  Object.freeze({ path:'/dashboard/attendance', zoneKey:'workforce-attendance', zoneLabel:'الموارد البشرية', functionLabel:'الحضور والانصراف' }),
  Object.freeze({ path:'/dashboard/leaves', zoneKey:'workforce-leaves', zoneLabel:'الموارد البشرية', functionLabel:'الإجازات' }),
  Object.freeze({ path:'/dashboard/advances', zoneKey:'finance-advances', zoneLabel:'المالية', functionLabel:'السلف والمديونيات' }),
  Object.freeze({ path:'/dashboard/approvals', zoneKey:'approvals', zoneLabel:'المتابعة', functionLabel:'الاعتمادات' }),
]);

export function resolveWorkThreshold(pathname = '', searchParams = null) {
  const path = String(pathname || '').replace(/\/$/, '') || '/';
  if (path === '/dashboard' || path === '/dashboard/my-work' || path === '/dashboard/my-work/approvals') {
    return Object.freeze({ posture:WORK_POSTURE.PERSPECTIVE, zoneKey:null, zoneLabel:'', functionLabel:'', parentLabel:'', parentHref:'', subject:null });
  }

  const projectWork = projectWorkContext(path, searchParams);
  if (projectWork) return projectWork;

  const quotationWork = quotationWorkContext(path);
  if (quotationWork) return quotationWork;

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
