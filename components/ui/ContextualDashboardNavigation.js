'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AREAS,
  PROJECT_NAV_GROUPS,
  activeConstitutionItem,
  activeProjectNavigationKey,
  projectNavigationHref,
} from '@/lib/app-constitution';
import { filterAreasForAccess, projectNavRequirement } from '@/lib/access-ui';
import {
  PORTAL_SECTION_ITEMS,
  PORTAL_EXISTING_DESTINATION_CAPABILITIES,
} from '@/lib/portal-section-constitution';
import { SHELL_PORTAL_GROUPS } from '@/lib/navigation-shell-constitution';
import {
  anatomyAreaLabel,
  anatomyGroupLabel,
  anatomyToolLabel,
  isMeaningfulBranch,
  perspectiveQuickLinks,
} from '@/lib/anatomical-navigation';

const VISIBILITY_STORAGE_KEY = 'arkan-context-nav-visible';

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

function groupIdentity(areaKey, groupKey) {
  return `${areaKey}:${groupKey}`;
}

export default function ContextualDashboardNavigation({ me, onSignOut }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navRef = useRef(null);
  const edgeRef = useRef(null);
  const touchRef = useRef(null);
  const [visiblePreference, setVisiblePreference] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [expandedAreaKey, setExpandedAreaKey] = useState(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);
  const [expandedProjectGroupKey, setExpandedProjectGroupKey] = useState(null);

  const accessibleAreas = useMemo(
    () => filterAreasForAccess(AREAS, me?.access || {}).filter((area) => area.key !== 'home'),
    [me],
  );

  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)(?:\/|$)/);
  const projectId = projectMatch?.[1] || null;
  const sectionMatch = pathname.match(/^\/dashboard\/workspace\/(projects|workforce|finance|documents|admin)\/section\/[^/]+/);
  const constitutionItem = activeConstitutionItem(pathname);
  const currentAreaKey = projectId ? 'projects' : sectionMatch?.[1] || constitutionItem?.area?.key || null;

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

  const groupsByArea = useMemo(() => Object.fromEntries(accessibleAreas.map((area) => {
    const tools = toolsByArea[area.key] || [];
    const configured = SHELL_PORTAL_GROUPS[area.key] || [];
    if (!configured.length) {
      return [area.key, tools.length ? [{ key:'general', label:'الأدوات', items:tools }] : []];
    }

    const itemByHref = new Map(tools.map((item) => [item.href, item]));
    const groups = configured
      .map((group) => ({
        key:group.key,
        label:anatomyGroupLabel(area.key, group),
        items:(group.hrefs || []).map((href) => itemByHref.get(href)).filter(Boolean),
      }))
      .filter((group) => group.items.length > 0);

    const assigned = new Set(configured.flatMap((group) => group.hrefs || []));
    const extras = tools.filter((item) => !assigned.has(item.href));
    if (extras.length) groups.push({ key:'more', label:'المزيد', items:extras });
    return [area.key, groups];
  })), [accessibleAreas, toolsByArea]);

  const currentGlobalTool = useMemo(() => {
    const tools = toolsByArea[currentAreaKey] || [];
    return tools
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] || null;
  }, [currentAreaKey, pathname, toolsByArea]);

  const currentAreaGroup = useMemo(() => {
    if (!currentAreaKey || !currentGlobalTool) return null;
    return (groupsByArea[currentAreaKey] || []).find((group) =>
      group.items.some((item) => item.href === currentGlobalTool.href)
    ) || null;
  }, [currentAreaKey, currentGlobalTool, groupsByArea]);

  const projectTools = useMemo(() => {
    if (!projectId) return [];
    const projectCaps = (me?.capabilities || []).filter((cap) =>
      cap.module_key === 'projects' &&
      (cap.scope_type === 'all' || (cap.scope_type === 'project' && String(cap.scope_key) === String(projectId)))
    );
    const full = Boolean(me?.access?.fullAdmin) || projectCaps.some((cap) => cap.source_key === 'projects_full_access');
    const hasAny = (keys) => full || keys.some((key) => projectCaps.some((cap) => cap.capability_key === key));

    return PROJECT_NAV_GROUPS.flatMap((group) => group.items.map((item) => ({
      ...item,
      groupKey:group.key,
      groupLabel:group.label,
      href:projectNavigationHref(projectId, item),
    }))).filter((item) => {
      const required = projectNavRequirement(item.key);
      return required.length === 0 || hasAny(required);
    });
  }, [me, projectId]);

  const projectGroups = useMemo(() => PROJECT_NAV_GROUPS
    .map((group) => ({
      key:group.key,
      label:group.label,
      items:projectTools.filter((item) => item.groupKey === group.key),
    }))
    .filter((group) => group.items.length > 0), [projectTools]);

  const activeProjectKey = projectId
    ? activeProjectNavigationKey({ projectId, pathname, view:searchParams.get('view') })
    : null;
  const currentProjectTool = projectTools.find((item) => item.key === activeProjectKey) || null;
  const currentProjectGroup = currentProjectTool
    ? projectGroups.find((group) => group.key === currentProjectTool.groupKey) || null
    : null;

  const currentArea = currentAreaKey
    ? accessibleAreas.find((area) => area.key === currentAreaKey) || null
    : null;

  const open = compactViewport ? mobileOpen : visiblePreference;
  const quickLinks = perspectiveQuickLinks({ approvals:me?.access?.approvals === true });

  const breadcrumbs = useMemo(() => {
    if (projectId) {
      return [
        currentArea ? anatomyAreaLabel(currentArea) : anatomyAreaLabel('projects'),
        'المشروع الحالي',
        currentProjectGroup?.label,
        currentProjectTool?.label,
      ].filter(Boolean);
    }
    return [
      currentArea ? anatomyAreaLabel(currentArea) : null,
      currentAreaGroup?.label,
      currentGlobalTool?.label,
    ].filter(Boolean);
  }, [currentArea, currentAreaGroup, currentGlobalTool, currentProjectGroup, currentProjectTool, projectId]);

  useEffect(() => {
    let savedVisible = true;
    try {
      const stored = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (stored === 'false') savedVisible = false;
    } catch (_) {}
    setVisiblePreference(savedVisible);

    const media = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
    const syncViewport = () => {
      const compact = media.matches;
      setCompactViewport(compact);
      if (compact) setMobileOpen(false);
    };
    syncViewport();
    media.addEventListener?.('change', syncViewport);
    setNavigationReady(true);
    return () => media.removeEventListener?.('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!navigationReady) return;
    try { window.localStorage.setItem(VISIBILITY_STORAGE_KEY, String(visiblePreference)); } catch (_) {}
  }, [navigationReady, visiblePreference]);

  useEffect(() => {
    if (currentAreaKey) setExpandedAreaKey(currentAreaKey);
    if (currentAreaKey && currentAreaGroup) {
      setExpandedGroupKey(groupIdentity(currentAreaKey, currentAreaGroup.key));
    }
    if (currentProjectGroup) setExpandedProjectGroupKey(currentProjectGroup.key);
  }, [currentAreaGroup, currentAreaKey, currentProjectGroup, pathname]);

  useEffect(() => {
    function keydown(event) {
      if (event.key !== 'Escape' || !open) return;
      if (compactViewport) setMobileOpen(false);
      else setVisiblePreference(false);
    }
    function outsidePointer(event) {
      if (!compactViewport || !mobileOpen) return;
      if (
        navRef.current?.contains(event.target) ||
        edgeRef.current?.contains(event.target) ||
        touchRef.current?.contains(event.target)
      ) return;
      setMobileOpen(false);
    }
    window.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', outsidePointer);
    return () => {
      window.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', outsidePointer);
    };
  }, [compactViewport, mobileOpen, open]);

  function openNavigation() {
    if (compactViewport) setMobileOpen(true);
    else setVisiblePreference(true);
  }

  function hideNavigation() {
    if (compactViewport) setMobileOpen(false);
    else setVisiblePreference(false);
  }

  function go(href) {
    if (!href) return;
    if (compactViewport) setMobileOpen(false);
    if (href !== pathname) router.push(href);
  }

  function toggleArea(areaKey) {
    setExpandedAreaKey((current) => current === areaKey ? null : areaKey);
  }

  function toggleGroup(areaKey, groupKey) {
    const identity = groupIdentity(areaKey, groupKey);
    setExpandedGroupKey((current) => current === identity ? null : identity);
  }

  function toggleProjectGroup(groupKey) {
    setExpandedProjectGroupKey((current) => current === groupKey ? null : groupKey);
  }

  return <>
    <button
      ref={edgeRef}
      type="button"
      className="appNavHotZone"
      aria-label="إظهار قائمة البرنامج"
      aria-expanded={open}
      aria-controls="arkan-context-navigation"
      onClick={openNavigation}
    ><span aria-hidden="true" /></button>

    <button
      ref={touchRef}
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
      data-navigation-ready={navigationReady ? 'true' : 'false'}
      data-navigation-consciousness="persistent-tree"
      aria-label="التنقل في مساحة العمل"
      aria-hidden={!open}
    >
      <div className="appNavTopLine">
        <strong>أركان المكان</strong>
        <button type="button" onClick={hideNavigation}>إخفاء</button>
      </div>

      <div className="appNavPanel">
        {breadcrumbs.length ? (
          <nav className="appNavBreadcrumb" aria-label="المسار الحالي">
            {breadcrumbs.map((label, index) => (
              <span key={`${label}-${index}`} data-current={index === breadcrumbs.length - 1 ? 'true' : 'false'}>
                {label}
              </span>
            ))}
          </nav>
        ) : null}

        <div className="appNavList appNavQuickList" data-anatomy-level="perspective">
          {quickLinks.map((item) => (
            <button
              key={item.href}
              type="button"
              className="appNavRow"
              data-active={pathname === item.href ? 'true' : 'false'}
              onClick={() => go(item.href)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="appNavTree" data-anatomy-level="system">
          {accessibleAreas.map((area) => {
            const areaGroups = groupsByArea[area.key] || [];
            const areaExpanded = expandedAreaKey === area.key;
            const areaActive = currentAreaKey === area.key;

            return (
              <section key={area.key} className="appNavArea" data-active={areaActive ? 'true' : 'false'}>
                <button
                  type="button"
                  className="appNavAreaHead"
                  aria-expanded={areaExpanded}
                  onClick={() => toggleArea(area.key)}
                >
                  <span>{anatomyAreaLabel(area)}</span>
                  <small aria-hidden="true">{areaExpanded ? '−' : '+'}</small>
                </button>

                {areaExpanded ? (
                  <div className="appNavAreaBody">
                    {area.key === 'projects' && projectId && projectGroups.length ? (
                      <section className="appNavProjectContext" aria-label="المشروع الحالي">
                        <div className="appNavContextLabel">المشروع الحالي</div>
                        {projectGroups.map((group) => {
                          const groupExpanded = expandedProjectGroupKey === group.key;
                          const groupActive = currentProjectGroup?.key === group.key;
                          const directItem = !isMeaningfulBranch(group) ? group.items[0] : null;

                          if (directItem) {
                            return (
                              <button
                                key={group.key}
                                type="button"
                                className="appNavRow appNavNestedRow"
                                data-active={currentProjectTool?.key === directItem.key ? 'true' : 'false'}
                                onClick={() => go(directItem.href)}
                              >
                                <span>{directItem.label}</span>
                              </button>
                            );
                          }

                          return (
                            <div key={group.key} className="appNavGroup" data-active={groupActive ? 'true' : 'false'}>
                              <button
                                type="button"
                                className="appNavGroupHead"
                                aria-expanded={groupExpanded}
                                onClick={() => toggleProjectGroup(group.key)}
                              >
                                <span>{group.label}</span>
                                <small aria-hidden="true">{groupExpanded ? '−' : '+'}</small>
                              </button>
                              {groupExpanded ? (
                                <div className="appNavGroupItems">
                                  {group.items.map((item) => (
                                    <button
                                      key={item.key}
                                      type="button"
                                      className="appNavRow appNavNestedRow"
                                      data-active={currentProjectTool?.key === item.key ? 'true' : 'false'}
                                      onClick={() => go(item.href)}
                                    >
                                      <span>{item.label}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </section>
                    ) : null}

                    {areaGroups.map((group) => {
                      const directItem = !isMeaningfulBranch(group) ? group.items[0] : null;
                      const identity = groupIdentity(area.key, group.key);
                      const groupExpanded = expandedGroupKey === identity;
                      const groupActive = areaActive && currentAreaGroup?.key === group.key;

                      if (directItem) {
                        return (
                          <button
                            key={group.key}
                            type="button"
                            className="appNavRow appNavNestedRow"
                            data-active={currentGlobalTool?.href === directItem.href ? 'true' : 'false'}
                            onClick={() => go(directItem.href)}
                          >
                            <span>{directItem.label}</span>
                          </button>
                        );
                      }

                      return (
                        <div key={group.key} className="appNavGroup" data-active={groupActive ? 'true' : 'false'}>
                          <button
                            type="button"
                            className="appNavGroupHead"
                            aria-expanded={groupExpanded}
                            onClick={() => toggleGroup(area.key, group.key)}
                          >
                            <span>{group.label}</span>
                            <small aria-hidden="true">{groupExpanded ? '−' : '+'}</small>
                          </button>
                          {groupExpanded ? (
                            <div className="appNavGroupItems">
                              {group.items.map((item) => (
                                <button
                                  key={item.href}
                                  type="button"
                                  className="appNavRow appNavNestedRow"
                                  data-active={currentGlobalTool?.href === item.href ? 'true' : 'false'}
                                  onClick={() => go(item.href)}
                                >
                                  <span>{item.label}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="appNavBottomActions">
          <button type="button" onClick={onSignOut}>خروج</button>
        </div>
      </div>
    </aside>
  </>;
}
