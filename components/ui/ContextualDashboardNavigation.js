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
import {
  PORTAL_EXISTING_DESTINATION_CAPABILITIES,
  PORTAL_SECTION_ITEMS,
} from '@/lib/portal-section-constitution';
import { anatomyAreaLabel, anatomyToolLabel } from '@/lib/anatomical-navigation';
import {
  PROJECT_APPROACH_REGIONS,
  PROJECT_GUARDIANS,
  normalizeProjectCare,
  normalizeProjectRegion,
  projectApproachHref,
  projectRegionForItemKey,
} from '@/lib/living-navigation';
import { requestWorkSessionNavigation } from '@/components/ui/WorkSessionRuntime';

const PIN_STORAGE_KEY = 'arkan-context-nav-pinned';

function uniqueByHref(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.href || seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function isActionOnlyRoute(href = '') {
  return /\/(?:new|create)\/?$/.test(href);
}

function isRedundantPortalTool(areaKey, item) {
  return areaKey === 'workforce' && item?.sectionKey === 'planning';
}

export default function ContextualDashboardNavigation({ me, onSignOut }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navRef = useRef(null);
  const edgeRef = useRef(null);
  const lastPathRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinReady, setPinReady] = useState(false);

  const accessibleAreas = useMemo(
    () => filterAreasForAccess(AREAS, me?.access || {}).filter((area) => area.key !== 'home'),
    [me],
  );

  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)(?:\/|$)/);
  const projectId = projectMatch?.[1] || null;
  const isProjectAnatomy = Boolean(projectId && pathname === `/dashboard/projects/${projectId}/anatomy`);
  const workspaceMatch = pathname.match(/^\/dashboard\/workspace\/(projects|workforce|finance|documents|admin)(?:\/|$)/);
  const constitutionItem = activeConstitutionItem(pathname);
  const rawAreaKey = projectId ? 'projects' : workspaceMatch?.[1] || constitutionItem?.area?.key || null;
  const currentAreaKey = rawAreaKey === 'home' ? null : rawAreaKey;

  const toolsByArea = useMemo(() => {
    const capabilityKeys = me?.capabilityKeys || new Set();
    return Object.fromEntries(accessibleAreas.map((area) => {
      const merged = uniqueByHref([
        ...(area.items || []),
        ...(PORTAL_SECTION_ITEMS[area.key] || []),
      ]);
      const tools = merged
        .filter((item) => !item.hidden && !item.legacy && !isActionOnlyRoute(item.href))
        .filter((item) => !isRedundantPortalTool(area.key, item))
        .filter((item) => {
          if (me?.access?.fullAdmin) return true;
          if (area.key === 'projects' && !me?.access?.projectsScreen) return item.href === area.href;
          const required = item.capabilities || PORTAL_EXISTING_DESTINATION_CAPABILITIES[item.href] || [];
          if (required.length) return required.some((key) => capabilityKeys.has(key));
          return true;
        })
        .map((item) => ({ ...item, label:anatomyToolLabel(area.key, item) }));
      return [area.key, tools];
    }));
  }, [accessibleAreas, me]);

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

  const availableProjectGuardians = useMemo(() => PROJECT_GUARDIANS.filter((guardian) =>
    guardian.entityKind === 'project' || (toolsByArea.projects || []).some((item) => item.href === guardian.href)
  ), [toolsByArea]);

  useEffect(() => {
    let saved = false;
    try { saved = window.localStorage.getItem(PIN_STORAGE_KEY) === 'true'; } catch (_) {}
    setPinned(saved);
    setOpen(saved);
    lastPathRef.current = pathname;
    setPinReady(true);
  }, []);

  useEffect(() => {
    if (!pinReady) return;
    try { window.localStorage.setItem(PIN_STORAGE_KEY, String(pinned)); } catch (_) {}
  }, [pinReady, pinned]);

  useEffect(() => {
    if (!pinReady) return;
    const routeChanged = Boolean(lastPathRef.current && lastPathRef.current !== pathname);
    if (pinned) setOpen(true);
    else if (routeChanged) setOpen(false);
    lastPathRef.current = pathname;
  }, [pathname, pinReady, pinned]);

  useEffect(() => {
    function keydown(event) {
      if (event.key !== 'Escape' || !open) return;
      setOpen(false);
      if (pinned) setPinned(false);
    }
    function outsidePointer(event) {
      if (!open || pinned) return;
      if (navRef.current?.contains(event.target) || edgeRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    window.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', outsidePointer);
    return () => {
      window.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', outsidePointer);
    };
  }, [open, pinned]);

  function openNavigation() {
    setOpen(true);
  }

  function go(href, options = {}) {
    if (!href) return;
    const accepted = requestWorkSessionNavigation(href, { replace:options.replace === true });
    if (!accepted) {
      if (!pinned) setOpen(false);
      return;
    }
    if (!pinned && options.keepOpen !== true) setOpen(false);
    if (options.replace) router.replace(href);
    else router.push(href);
  }

  function togglePinned() {
    setPinned((value) => {
      const next = !value;
      setOpen(true);
      return next;
    });
  }

  const backTarget = useMemo(() => {
    if (!currentAreaKey) return null;
    if (projectId) {
      if (isProjectAnatomy) {
        if (currentProjectRegion) {
          return { href:projectApproachHref(projectId,{ care:currentCare }), label:'بطاقة المشروع' };
        }
        const guardian = availableProjectGuardians.find((item) => item.key === currentCare);
        return { href:`/dashboard/projects?care=${encodeURIComponent(currentCare)}`, label:guardian?.label || 'المشاريع' };
      }
      if (currentProjectRegion) {
        return { href:projectApproachHref(projectId,{ care:currentCare, region:currentProjectRegion.key }), label:currentProjectRegion.label };
      }
      return { href:projectApproachHref(projectId,{ care:currentCare }), label:'بطاقة المشروع' };
    }
    if (currentAreaKey === 'projects') {
      if (pathname === '/dashboard/workspace/projects') return { href:'/dashboard', label:'البوابات' };
      return { href:'/dashboard/workspace/projects', label:'المشاريع' };
    }
    return { href:'/dashboard', label:'البوابات' };
  }, [availableProjectGuardians, currentAreaKey, currentCare, currentProjectRegion, isProjectAnatomy, pathname, projectId]);

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
      data-pinned={pinned ? 'true' : 'false'}
      data-navigation-consciousness="implicit"
      data-living-branch="single"
      data-living-branch-pilot="projects"
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
              onClick={() => go(backTarget.href,{keepOpen:true})}
            ><span aria-hidden="true">→</span></button> : null}
          </div>
          <button type="button" onClick={togglePinned}>{pinned ? 'تحرير' : 'إبقاء'}</button>
        </div>

        <div className="appNavPanel" data-anatomy-level="living-branch">
          <div className="appNavList appNavPortalList">
            {accessibleAreas.map((area) => {
              const areaActive=currentAreaKey===area.key;
              return <div key={area.key} className="appNavBranch" data-expanded={areaActive&&area.key==='projects'?'true':'false'}>
                <button
                  type="button"
                  className="appNavRow appNavRowParent"
                  data-active={areaActive?'true':'false'}
                  onClick={()=>go(area.key==='projects'?'/dashboard/workspace/projects':area.href,{keepOpen:area.key==='projects'})}
                >
                  <span>{anatomyAreaLabel(area)}</span>
                </button>

                {areaActive && area.key==='projects' ? <div className="appNavChildren" data-branch-kind="project-guardians">
                  {availableProjectGuardians.map((guardian)=>{
                    const active=guardianKey===guardian.key;
                    return <div key={guardian.key} className="appNavBranch appNavBranchNested" data-expanded={active&&projectId?'true':'false'}>
                      <button type="button" className="appNavRow appNavRowNested" data-active={active?'true':'false'} onClick={()=>go(guardian.href,{keepOpen:true})}>
                        <span>{guardian.label}</span>
                      </button>
                      {active&&projectId ? <div className="appNavProjectContext">
                        <button type="button" className="appNavRow appNavRowNested appNavProjectCardRow" data-active={isProjectAnatomy&&!currentProjectRegion?'true':'false'} onClick={()=>go(projectApproachHref(projectId,{care:currentCare}),{keepOpen:true})}>
                          <span>بطاقة المشروع</span>
                        </button>
                        {projectRegions.map((region)=>{
                          const selected=currentProjectRegion?.key===region.key;
                          return <div key={region.key} className="appNavBranch appNavBranchDeep" data-expanded={selected?'true':'false'}>
                            <button type="button" className="appNavRow appNavRowNested appNavRegionRow" data-active={selected?'true':'false'} onClick={()=>go(projectApproachHref(projectId,{care:currentCare,region:region.key}),{keepOpen:true})}>
                              <span>{region.label}</span>
                            </button>
                            {selected ? <div className="appNavHonoraryList" aria-label={`أعمال ${region.label}`}>
                              {region.items.map((item)=><span key={item.key} className="appNavHonorary" data-current={activeProjectKey===item.key?'true':'false'}>{item.label}</span>)}
                            </div> : null}
                          </div>;
                        })}
                      </div> : null}
                    </div>;
                  })}
                </div> : null}
              </div>;
            })}
          </div>

          <div className="appNavBottomActions">
            <button type="button" onClick={onSignOut}>خروج</button>
          </div>
        </div>
      </> : null}
    </aside>
  </>;
}
