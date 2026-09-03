// DNA الفرع الحي الواحد — في البداية القائمة تقود، ثم يتسلم المسرح القيادة
// وتتحول القائمة إلى مرآة سياق غير قابلة للضغط.

export const NAVIGATION_MIRROR_EVENT = 'arkan:navigation-mirror-context';

export const LIVING_BRANCH_POLICY = Object.freeze({
  id:'single-living-branch-v2',
  oneExpandedSiblingPerLevel:true,
  navigationLeadsUntilMeaningfulStage:true,
  stageLeadsAfterGuardianOrGroupSelection:true,
  biologicalEntitiesLiveOnStageOnly:true,
  selectedBiologicalIdentityMayMirrorAsNonInteractiveContext:true,
  biologicalChildFirstSurface:'identity-card-before-work-navigation',
  directWorkChildrenAreHonoraryInNavigation:true,
  honoraryRowsMustNotLookDisabled:true,
  workChildrenAreClickableOnStage:true,
  navigationStopsWhenNextChoiceIsDirectWork:true,
  desktopNavigationPersistsUntilUserDismisses:true,
  desktopNavigationReservesSpaceInsteadOfCoveringStage:true,
  compactNavigationMayOverlayAndYield:true,
  semanticBack:'one-anatomical-level-never-browser-history',
  idleWorkCenterIsNotANavigationDestination:true,
  sameBehaviorEngineAcrossAllPortals:true,
});

export const PROJECT_GUARDIANS = Object.freeze([
  Object.freeze({ key:'quotes', label:'عروض الأسعار', href:'/dashboard/quotes', entityKind:'quotation' }),
  Object.freeze({ key:'prep', label:'قيد الإعداد', href:'/dashboard/projects?care=prep', entityKind:'project' }),
  Object.freeze({ key:'active', label:'المشاريع النشطة', href:'/dashboard/projects?care=active', entityKind:'project' }),
  Object.freeze({ key:'closing', label:'قيد الإقفال', href:'/dashboard/projects?care=closing', entityKind:'project' }),
  Object.freeze({ key:'closed', label:'المشاريع المغلقة', href:'/dashboard/projects?care=closed', entityKind:'project' }),
]);

// مناطق المشروع التي تسبق العمل الحقيقي.
// بعد اختيار المشروع، المسرح يجعل هذه المناطق قابلة للاختيار، والقائمة تعكسها فقط.
export const PROJECT_APPROACH_REGIONS = Object.freeze([
  Object.freeze({
    key:'operations', label:'التشغيل',
    itemKeys:Object.freeze(['attendance','expenses','daily-output','movements','timesheet-reports']),
  }),
  Object.freeze({
    key:'scope', label:'النطاق والتنفيذ',
    itemKeys:Object.freeze(['labor','scope','progress']),
  }),
  Object.freeze({
    key:'finance', label:'المالية',
    itemKeys:Object.freeze(['custody','payments','claims','guarantees','cost-control']),
  }),
  Object.freeze({
    key:'documents', label:'المستندات والمتابعة',
    itemKeys:Object.freeze(['quotes','docs','correspondence']),
  }),
  Object.freeze({
    key:'management', label:'بيانات ومتابعة المشروع',
    itemKeys:Object.freeze(['settings','overview','planning','changes']),
  }),
]);

export function normalizeProjectCare(value) {
  return PROJECT_GUARDIANS.some((item)=>item.key===value && item.entityKind==='project') ? value : 'active';
}

export function normalizeProjectRegion(value) {
  return PROJECT_APPROACH_REGIONS.some((item)=>item.key===value) ? value : '';
}

export function portalApproachHref(portalKey, groupKey = '') {
  const base=`/dashboard/workspace/${encodeURIComponent(portalKey)}`;
  return groupKey ? `${base}?group=${encodeURIComponent(groupKey)}` : base;
}

export function projectApproachHref(projectId, { care='active', region='' } = {}) {
  const params=new URLSearchParams();
  params.set('care',normalizeProjectCare(care));
  const normalizedRegion=normalizeProjectRegion(region);
  if(normalizedRegion)params.set('region',normalizedRegion);
  return `/dashboard/projects/${projectId}/anatomy?${params.toString()}`;
}

export function withNavigationContext(href, { care='', region='' } = {}) {
  if(!href)return href;
  const [path,raw='']=String(href).split('?');
  const params=new URLSearchParams(raw);
  if(care)params.set('care',normalizeProjectCare(care));
  if(region)params.set('region',normalizeProjectRegion(region));
  const qs=params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function projectRegionForItemKey(itemKey) {
  return PROJECT_APPROACH_REGIONS.find((region)=>region.itemKeys.includes(itemKey)) || null;
}

export function publishNavigationMirrorContext(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAVIGATION_MIRROR_EVENT, { detail }));
}
