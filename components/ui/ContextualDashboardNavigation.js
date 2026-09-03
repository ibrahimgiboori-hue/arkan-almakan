'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AREAS,
  PROJECT_NAV_GROUPS,
  activeConstitutionItem,
  activeProjectNavigationKey,
} from '@/lib/app-constitution';
import { filterAreasForAccess, projectNavRequirement } from '@/lib/access-ui';
import { anatomyAreaLabel } from '@/lib/anatomical-navigation';
import {
  NAVIGATION_MIRROR_EVENT,
  GRANDCHILD_NAVIGATION_EVENT,
  PROJECT_APPROACH_REGIONS,
  normalizeProjectCare,
  normalizeProjectRegion,
  projectApproachHref,
  projectRegionForItemKey,
} from '@/lib/living-navigation';
import {
  activePortalGroup,
  activePortalTool,
  portalEntryNodes,
  portalApproachHref,
} from '@/lib/portal-living-navigation';
import { requestWorkSessionNavigation } from '@/components/ui/WorkSessionRuntime';

const NAVIGATION_YIELD_EVENT = 'arkan:navigation-yield-to-work';
const FAST_DESKTOP_BACK_WINDOW_MS = 5000;

function isCompactNavigationViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)').matches;
}

export default function ContextualDashboardNavigation({ me, onSignOut }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams?.toString() || '';
  const navRef = useRef(null);
  const edgeRef = useRef(null);
  const lastSemanticBackAtRef = useRef(0);
  const navigationIntentRef = useRef('');
  const [open, setOpen] = useState(false);
  const [expandedAreaKey, setExpandedAreaKey] = useState(null);
  const [mirrorSubject, setMirrorSubject] = useState(null);
  const [grandchildContext, setGrandchildContext] = useState(null);
  const [activeGrandchildTab, setActiveGrandchildTab] = useState('');
  const [expandedGrandchildGroup, setExpandedGrandchildGroup] = useState('');

  const accessibleAreas = useMemo(
    () => filterAreasForAccess(AREAS, me?.access || {}).filter((area) => area.key !== 'home'),
    [me],
  );

  const entryNodesByArea = useMemo(() => Object.fromEntries(
    accessibleAreas.map((area) => [area.key, portalEntryNodes(area.key, me)]),
  ), [accessibleAreas, me]);

  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)(?:\/|$)/);
  const projectId = projectMatch?.[1] || null;
  const isProjectAnatomy = Boolean(projectId && pathname === `/dashboard/projects/${projectId}/anatomy`);
  const workspaceMatch = pathname.match(/^\/dashboard\/workspace\/(projects|workforce|finance|documents|admin)(?:\/|$)/);
  const constitutionItem = activeConstitutionItem(pathname);
  const rawAreaKey = projectId ? 'projects' : workspaceMatch?.[1] || constitutionItem?.area?.key || null;
  const currentAreaKey = rawAreaKey === 'home' ? null : rawAreaKey;
  const currentArea = accessibleAreas.find((area) => area.key === currentAreaKey) || null;

  const projectTools = useMemo(() => {
    if (!projectId) return [];
    const projectCaps = (me?.capabilities || []).filter((cap) =>
      cap.module_key === 'projects' &&
      (cap.scope_type === 'all' || (cap.scope_type === 'project' && String(cap.scope_key) === String(projectId)))
    );
    const full = Boolean(me?.access?.fullAdmin) || projectCaps.some((cap) => cap.source_key === 'projects_full_access');
    const hasAny = (keys) => full || keys.some((key) => projectCaps.some((cap) => cap.capability_key === key));
    return PROJECT_NAV_GROUPS.flatMap((group) => group.items).filter((item) => {
      const required = projectNavRequirement(item.key);
      return required.length === 0 || hasAny(required);
    });
  }, [me, projectId]);

  const projectRegions = useMemo(() => PROJECT_APPROACH_REGIONS
    .map((region) => ({
      ...region,
      items:region.itemKeys.map((key) => projectTools.find((item) => item.key === key)).filter(Boolean),
    }))
    .filter((region) => region.items.length > 0), [projectTools]);

  const activeProjectKey = projectId && !isProjectAnatomy
    ? activeProjectNavigationKey({ projectId, pathname, view:searchParams.get('view') })
    : null;
  const inferredRegion = projectRegionForItemKey(activeProjectKey)?.key || '';
  const requestedRegion = normalizeProjectRegion(searchParams.get('region'));
  const currentProjectRegionKey = isProjectAnatomy ? requestedRegion : (inferredRegion || requestedRegion);
  const currentProjectRegion = projectRegions.find((region) => region.key === currentProjectRegionKey) || null;
  const currentCare = normalizeProjectCare(searchParams.get('care'));

  const guardianKey = pathname.startsWith('/dashboard/quotes')
    ? 'quotes'
    : (currentAreaKey === 'projects' && (pathname.startsWith('/dashboard/projects') || projectId) ? currentCare : '');

  const projectGuardianNodes = useMemo(() => (entryNodesByArea.projects || [])
    .filter((node) => node.nodeKind === 'guardian'), [entryNodesByArea.projects]);

  const currentGenericGroup = useMemo(() => {
    if (!currentAreaKey || guardianKey) return null;
    return activePortalGroup(currentAreaKey, pathname, searchParams, me);
  }, [currentAreaKey, guardianKey, me, pathname, queryKey, searchParams]);

  const currentGenericTool = useMemo(() => {
    if (!currentAreaKey || !currentGenericGroup) return null;
    return activePortalTool(currentAreaKey, pathname, currentGenericGroup, me);
  }, [currentAreaKey, currentGenericGroup, me, pathname]);

  const mirrorMode = Boolean(currentAreaKey && (guardianKey || currentGenericGroup));
  const grandchildMode = Boolean(
    grandchildContext?.scopePrefix && String(pathname || '').startsWith(grandchildContext.scopePrefix)
  );

  useEffect(() => {
    if (currentAreaKey) setExpandedAreaKey(currentAreaKey);
  }, [currentAreaKey]);

  useEffect(() => {
    if (!projectId) setMirrorSubject(null);
  }, [projectId]);

  useEffect(() => {
    if (navigationIntentRef.current === 'semantic-back') {
      navigationIntentRef.current = '';
      return;
    }
    navigationIntentRef.current = '';
    lastSemanticBackAtRef.current = 0;
  }, [pathname, queryKey]);

  useEffect(() => {
    function mirrorContext(event) {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : null;
      if (!detail?.portalKey || detail.portalKey !== currentAreaKey) return;
      setMirrorSubject(detail);
    }
    function grandchildNavigation(event) {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : null;
      if (!detail?.scopePrefix || !detail?.title) return;
      setGrandchildContext(detail);
    }
    window.addEventListener(NAVIGATION_MIRROR_EVENT, mirrorContext);
    window.addEventListener(GRANDCHILD_NAVIGATION_EVENT, grandchildNavigation);
    return () => {
      window.removeEventListener(NAVIGATION_MIRROR_EVENT, mirrorContext);
      window.removeEventListener(GRANDCHILD_NAVIGATION_EVENT, grandchildNavigation);
    };
  }, [currentAreaKey]);

  useEffect(() => {
    if (!grandchildMode || !grandchildContext) return;
    const tabs = grandchildContext.tabs || [];
    const preferredTab = grandchildContext.currentItemTabKey || grandchildContext.defaultTabKey || tabs[0]?.key || '';
    if (preferredTab && tabs.some((tab)=>tab.key===preferredTab)) setActiveGrandchildTab(preferredTab);

    if (!grandchildContext.currentItemId) {
      setExpandedGrandchildGroup('');
      return;
    }

    const itemTab = tabs.find((tab)=>(tab.groups || []).some((group)=>(group.items || []).some((item)=>item.id===grandchildContext.currentItemId)));
    const activeGroup = (itemTab?.groups || []).find((group)=>(group.items || []).some((item)=>item.id===grandchildContext.currentItemId));
    if (itemTab) setActiveGrandchildTab(itemTab.key);
    if (activeGroup) setExpandedGrandchildGroup(activeGroup.key);
  }, [grandchildContext, grandchildMode]);

  useEffect(() => {
    function keydown(event) {
      if (event.key !== 'Escape' || !open) return;
      setOpen(false);
    }
    function outsidePointer(event) {
      if (!open || !isCompactNavigationViewport()) return;
      if (navRef.current?.contains(event.target) || edgeRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function yieldToWork() {
      setOpen(false);
    }
    window.addEventListener('keydown', keydown);
    window.addEventListener(NAVIGATION_YIELD_EVENT, yieldToWork);
    document.addEventListener('pointerdown', outsidePointer);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener(NAVIGATION_YIELD_EVENT, yieldToWork);
      document.removeEventListener('pointerdown', outsidePointer);
    };
  }, [open]);

  function resetFastBackSequence() {
    lastSemanticBackAtRef.current = 0;
  }

  function openNavigation() {
    setOpen(true);
  }

  function go(href, options = {}) {
    if (!href) return;
    if (options.fromBack !== true) resetFastBackSequence();
    const accepted = requestWorkSessionNavigation(href, { replace:options.replace === true });
    if (!accepted) return;
    navigationIntentRef.current = options.fromBack === true ? 'semantic-back' : 'forward';
    setOpen(options.keepOpen !== false);
    if (options.replace) router.replace(href);
    else router.push(href);
  }

  function selectArea(area) {
    resetFastBackSequence();
    setExpandedAreaKey(area.key);
    setOpen(true);
  }

  const backTarget = useMemo(() => {
    if (!currentAreaKey) {
      return expandedAreaKey ? { kind:'collapse', label:'البوابات' } : null;
    }

    if (projectId) {
      if (isProjectAnatomy && currentProjectRegion) {
        return {
          kind:'route',
          href:projectApproachHref(projectId,{ care:currentCare }),
          label:mirrorSubject?.subjectLabel || 'بطاقة المشروع',
        };
      }
      if (!isProjectAnatomy && currentProjectRegion) {
        return {
          kind:'route',
          href:projectApproachHref(projectId,{ care:currentCare, region:currentProjectRegion.key }),
          label:currentProjectRegion.label,
        };
      }
      if (isProjectAnatomy) {
        const guardian = projectGuardianNodes.find((item) => item.guardianKey === currentCare);
        return {
          kind:'route',
          href:`/dashboard/projects?care=${encodeURIComponent(currentCare)}`,
          label:guardian?.label || 'المشاريع',
        };
      }
    }

    if (guardianKey) {
      return { kind:'idle', areaKey:'projects', href:'/dashboard', label:'المشاريع' };
    }

    if (currentGenericGroup) {
      const onGroupStage = workspaceMatch?.[1] === currentAreaKey && Boolean(searchParams.get('group'));
      if (onGroupStage) {
        return { kind:'idle', areaKey:currentAreaKey, href:'/dashboard', label:anatomyAreaLabel(currentArea || { key:currentAreaKey }) };
      }
      return {
        kind:'route',
        href:portalApproachHref(currentAreaKey, currentGenericGroup.key),
        label:currentGenericGroup.label,
      };
    }

    return { kind:'idle', areaKey:currentAreaKey, href:'/dashboard', label:anatomyAreaLabel(currentArea || { key:currentAreaKey }) };
  }, [
    currentArea,
    currentAreaKey,
    currentCare,
    currentGenericGroup,
    currentProjectRegion,
    expandedAreaKey,
    guardianKey,
    isProjectAnatomy,
    mirrorSubject,
    projectGuardianNodes,
    projectId,
    queryKey,
    searchParams,
    workspaceMatch,
  ]);

  function returnToEmployeeDesktop() {
    const accepted = requestWorkSessionNavigation('/dashboard');
    if (!accepted) return;
    lastSemanticBackAtRef.current = 0;
    navigationIntentRef.current = 'semantic-back';
    setOpen(false);
    setExpandedAreaKey(null);
    setMirrorSubject(null);
    setGrandchildContext(null);
    setActiveGrandchildTab('');
    setExpandedGrandchildGroup('');
    router.push('/dashboard');
  }

  function goBack() {
    if (!backTarget) return;
    const now = Date.now();
    const previous = lastSemanticBackAtRef.current;
    if (previous > 0 && now - previous < FAST_DESKTOP_BACK_WINDOW_MS) {
      returnToEmployeeDesktop();
      return;
    }
    lastSemanticBackAtRef.current = now;

    if (backTarget.kind === 'collapse') {
      setExpandedAreaKey(null);
      setOpen(true);
      return;
    }
    if (backTarget.kind === 'idle') {
      setExpandedAreaKey(backTarget.areaKey || null);
      go(backTarget.href,{fromBack:true});
      return;
    }
    go(backTarget.href,{fromBack:true});
  }

  function renderGrandchild() {
    if (!grandchildContext) return null;
    const tabs = grandchildContext.tabs || [];
    const currentTab = tabs.find((tab)=>tab.key===activeGrandchildTab) || tabs[0] || null;
    const groups = currentTab?.groups || [];

    return <div className="appNavGrandchild" data-navigation-role="grandchild" data-tool-key={grandchildContext.toolKey || ''}>
      <div className="appNavGrandchildTitle">{grandchildContext.title}</div>

      {tabs.length ? <div className="appNavGrandchildTabs" role="tablist" aria-label={`تصنيف ${grandchildContext.title}`}>
        {tabs.map((tab)=><button
          type="button"
          role="tab"
          aria-selected={currentTab?.key===tab.key}
          key={tab.key}
          className="appNavGrandchildTab"
          data-current={currentTab?.key===tab.key ? 'true':'false'}
          onClick={()=>{
            resetFastBackSequence();
            setActiveGrandchildTab(tab.key);
            setExpandedGrandchildGroup('');
          }}
        >
          <span>{tab.label}</span>
          <small>{tab.count}</small>
        </button>)}
      </div> : <div className="appNavGrandchildEmpty">لا توجد معاملات محفوظة.</div>}

      {currentTab ? <div className="appNavGrandchildGroups" data-classification="tool-defined">
        {groups.map((group)=>{
          const expanded = expandedGrandchildGroup === group.key;
          return <div className="appNavGrandchildGroup" key={group.key} data-expanded={expanded ? 'true':'false'}>
            <button type="button" className="appNavGrandchildGroupTitle" onClick={()=>{
              resetFastBackSequence();
              setExpandedGrandchildGroup(expanded ? '' : group.key);
            }}>
              <span>{group.label}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
            </button>
            {expanded ? <div className="appNavGrandchildItems">
              {(group.items || []).map((item)=><button
                type="button"
                key={item.id || item.href}
                className="appNavGrandchildItem"
                data-current={grandchildContext.currentItemId === item.id ? 'true' : 'false'}
                onClick={()=>go(item.href,{keepOpen:false})}
              >
                <span>{item.label}</span>
                {item.meta ? <small>{item.meta}</small> : null}
              </button>)}
            </div> : null}
          </div>;
        })}
      </div> : null}
    </div>;
  }

  function renderMirror() {
    if (!currentArea) return null;
    const guardian = projectGuardianNodes.find((item) => item.guardianKey === guardianKey) || null;

    return <div className="appNavMirror" data-navigation-role="mirror">
      <div className="appNavMirrorPortal">{anatomyAreaLabel(currentArea)}</div>

      {guardian ? <div className="appNavMirrorTrail">
        <span className="appNavHonorary appNavHonoraryStrong" data-current="true">{guardian.label}</span>
      </div> : null}

      {projectId ? <div className="appNavMirrorSubject">
        <div className="appNavMirrorSubjectTitle">{mirrorSubject?.subjectLabel || 'المشروع المحدد'}</div>
        <div className="appNavHonoraryList" aria-label="تشريح المشروع الحالي">
          {projectRegions.map((region) => {
            const selected = currentProjectRegion?.key === region.key;
            return <div key={region.key} className="appNavMirrorRegion" data-current={selected ? 'true' : 'false'}>
              <span className="appNavHonorary" data-current={selected ? 'true' : 'false'}>{region.label}</span>
              {selected ? <div className="appNavHonoraryList appNavHonoraryListNested" aria-label={`أعمال ${region.label}`}>
                {region.items.map((item) => (
                  <span key={item.key} className="appNavHonorary" data-current={activeProjectKey === item.key ? 'true' : 'false'}>{item.label}</span>
                ))}
              </div> : null}
            </div>;
          })}
        </div>
      </div> : null}

      {!guardian && currentGenericGroup ? <div className="appNavMirrorSubject">
        <div className="appNavMirrorSubjectTitle">{currentGenericGroup.label}</div>
        <div className="appNavHonoraryList" aria-label={`محتويات ${currentGenericGroup.label}`}>
          {currentGenericGroup.items.map((item) => (
            <span key={item.href} className="appNavHonorary" data-current={currentGenericTool?.href === item.href ? 'true' : 'false'}>{item.label}</span>
          ))}
        </div>
      </div> : null}
    </div>;
  }

  function renderGuide() {
    return <div className="appNavList appNavPortalList" data-navigation-role="guide">
      {accessibleAreas.map((area) => {
        const areaExpanded = expandedAreaKey === area.key;
        const entryNodes = entryNodesByArea[area.key] || [];
        return <div key={area.key} className="appNavBranch" data-expanded={areaExpanded ? 'true' : 'false'}>
          <button
            type="button"
            className="appNavRow appNavRowParent"
            data-active={areaExpanded ? 'true' : 'false'}
            onClick={() => selectArea(area)}
          >
            <span>{anatomyAreaLabel(area)}</span>
          </button>

          {areaExpanded ? <div className="appNavChildren" data-branch-kind="portal-entry-nodes">
            {entryNodes.map((node) => (
              <button key={node.key} type="button" className="appNavRow appNavRowNested" onClick={() => go(node.href)}>
                <span>{node.label}</span>
              </button>
            ))}
          </div> : null}
        </div>;
      })}
    </div>;
  }

  const navigationRole = grandchildMode ? 'grandchild' : (mirrorMode ? 'mirror' : 'guide');

  return <>
    <button
      ref={edgeRef}
      type="button"
      className="appNavHotZone"
      aria-label="فتح قائمة البرنامج"
      aria-expanded={open}
      aria-controls="arkan-context-navigation"
      onClick={openNavigation}
    ><span aria-hidden="true" /></button>

    <button
      type="button"
      className="appNavTouchTrigger"
      aria-expanded={open}
      aria-controls="arkan-context-navigation"
      onClick={openNavigation}
    >القائمة</button>

    <aside
      ref={navRef}
      id="arkan-context-navigation"
      className="appContextNav"
      data-open={open ? 'true' : 'false'}
      data-navigation-consciousness="implicit"
      data-living-branch="single"
      data-living-branch-scope="all-portals"
      data-navigation-role={navigationRole}
      aria-label="التنقل في مساحة العمل"
      aria-hidden={!open}
    >
      {open ? <>
        <div className="appNavTopLine" data-consciousness-visibility="implicit">
          <div>
            {backTarget ? <button
              type="button"
              className="appNavBackArrow"
              aria-label={`الرجوع إلى ${backTarget.label}`}
              title={`الرجوع إلى ${backTarget.label}`}
              onClick={goBack}
            ><span aria-hidden="true">→</span></button> : null}
          </div>
          <button type="button" className="appNavDismiss" onClick={() => setOpen(false)}>إخفاء</button>
        </div>

        <div className="appNavPanel" data-anatomy-level="living-branch">
          {grandchildMode ? renderGrandchild() : (mirrorMode ? renderMirror() : renderGuide())}

          <div className="appNavBottomActions">
            <button type="button" onClick={onSignOut}>خروج</button>
          </div>
        </div>
      </> : null}
    </aside>
  </>;
}
