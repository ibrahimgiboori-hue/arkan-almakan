'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
} from '@/lib/anatomical-navigation';
import { requestWorkNavigation } from './WorkSessionRuntime';

const CONTEXT_COLLAPSED_STORAGE_KEY = 'arkan-navigation-context-collapsed';

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

function PortalGlyph({ kind }) {
  const common = { width:20, height:20, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (kind === 'home') return <svg {...common}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5h5v5"/></svg>;
  if (kind === 'projects') return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 5V3h8v2M8 10h8M8 14h5"/></svg>;
  if (kind === 'workforce') return <svg {...common}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14.5 15.5c2.7-.5 4.8.8 5.5 4.5"/></svg>;
  if (kind === 'finance') return <svg {...common}><path d="M4 7h16M5 7l7-4 7 4M6 10v7M10 10v7M14 10v7M18 10v7M4 20h16"/></svg>;
  if (kind === 'documents') return <svg {...common}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 12h5M10 16h5"/></svg>;
  if (kind === 'admin') return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3h5l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.4L19 13a7 7 0 0 0 0-1Z"/></svg>;
  if (kind === 'my-work') return <svg {...common}><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/><path d="m8 5 1.5-2h5L16 5"/></svg>;
  if (kind === 'approvals') return <svg {...common}><path d="M5 12.5 10 17l9-10"/><path d="M5 4h11"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>;
}

function RailButton({ label, kind, active = false, onClick, badge = null }) {
  return (
    <button
      type="button"
      className="appRailItem"
      data-active={active ? 'true' : 'false'}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="appRailIcon"><PortalGlyph kind={kind} /></span>
      <span className="appRailLabel">{label}</span>
      {badge ? <span className="appRailBadge" aria-label={`${badge} عناصر`}>{badge}</span> : null}
    </button>
  );
}

export default function ContextualDashboardNavigation({ me, onSignOut }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const asideRef = useRef(null);
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);

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

  const currentArea = accessibleAreas.find((area) => area.key === currentAreaKey) || null;
  const currentAreaGroups = currentArea ? groupsByArea[currentArea.key] || [] : [];
  const hasDesktopContext = Boolean(projectId || currentArea);

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

  const contextTitle = projectId
    ? 'المشروع الحالي'
    : currentArea
      ? anatomyAreaLabel(currentArea)
      : 'التنقل';
  const contextSubtitle = projectId
    ? (currentProjectTool?.label || 'موقف المشروع')
    : (currentGlobalTool?.label || 'اختر ما تريد العمل عليه');

  useEffect(() => {
    let collapsed = false;
    try { collapsed = window.localStorage.getItem(CONTEXT_COLLAPSED_STORAGE_KEY) === 'true'; } catch (_) {}
    setDesktopExpanded(!collapsed);
    setPreferenceReady(true);
  }, []);

  useEffect(() => {
    if (!preferenceReady) return;
    try { window.localStorage.setItem(CONTEXT_COLLAPSED_STORAGE_KEY, String(!desktopExpanded)); } catch (_) {}
  }, [desktopExpanded, preferenceReady]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function keydown(event) {
      if (event.altKey && String(event.key || '').toLowerCase() === 'm') {
        event.preventDefault();
        const compact = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)').matches;
        if (compact) setMobileOpen((value) => !value);
        else if (hasDesktopContext) setDesktopExpanded((value) => !value);
        return;
      }
      if (event.key === 'Escape' && mobileOpen) setMobileOpen(false);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [hasDesktopContext, mobileOpen]);

  function go(href) {
    if (!href) return;
    setMobileOpen(false);
    if (href === pathname && !searchParams.toString()) return;
    requestWorkNavigation(href);
  }

  function choosePortal(area) {
    if (!area) return;
    if (area.key === currentAreaKey) {
      setDesktopExpanded(true);
      setMobileOpen(false);
      return;
    }
    setDesktopExpanded(true);
    go(area.href);
  }

  const approvalsBadge = null;

  return <>
    <nav className="appNavRail" aria-label="بوابات البرنامج" data-navigation-layer="primary-rail">
      <div className="appRailTop">
        <RailButton label="الرئيسية" kind="home" active={pathname === '/dashboard'} onClick={() => go('/dashboard')} />
        {accessibleAreas.map((area) => (
          <RailButton
            key={area.key}
            label={anatomyAreaLabel(area)}
            kind={area.key}
            active={currentAreaKey === area.key}
            onClick={() => choosePortal(area)}
          />
        ))}
      </div>

      <div className="appRailBottom">
        <RailButton label="أعمالي" kind="my-work" active={pathname === '/dashboard/my-work'} onClick={() => go('/dashboard/my-work')} />
        {me?.access?.approvals ? (
          <RailButton label="اعتماداتي" kind="approvals" badge={approvalsBadge} active={pathname.startsWith('/dashboard/approvals') || pathname.startsWith('/dashboard/my-work/approvals')} onClick={() => go('/dashboard/approvals')} />
        ) : null}
        {hasDesktopContext ? (
          <button
            type="button"
            className="appRailCollapse"
            aria-label={desktopExpanded ? 'طي القائمة الجانبية' : 'فتح القائمة الجانبية'}
            title={desktopExpanded ? 'طي القائمة الجانبية' : 'فتح القائمة الجانبية'}
            onClick={() => setDesktopExpanded((value) => !value)}
          >
            <span aria-hidden="true">{desktopExpanded ? '›' : '‹'}</span>
          </button>
        ) : null}
      </div>
    </nav>

    <button
      type="button"
      className="appNavMobileTrigger"
      aria-expanded={mobileOpen}
      aria-controls="arkan-context-navigation"
      aria-label="فتح القائمة"
      onClick={() => setMobileOpen(true)}
    >
      <span aria-hidden="true">☰</span>
      <span>القائمة</span>
    </button>

    {mobileOpen ? <button type="button" className="appNavMobileScrim" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} /> : null}

    <aside
      ref={asideRef}
      id="arkan-context-navigation"
      className="appContextNav"
      data-open={hasDesktopContext && desktopExpanded ? 'true' : 'false'}
      data-mobile-open={mobileOpen ? 'true' : 'false'}
      data-context-kind={projectId ? 'project' : currentArea ? 'portal' : 'root'}
      aria-label="قائمة المكان الحالي"
    >
      <header className="appNavContextHeader">
        <div className="appNavContextTitle">
          <strong>{contextTitle}</strong>
          <small>{contextSubtitle}</small>
        </div>
        <div className="appNavContextHeaderActions">
          <button type="button" className="appNavDesktopCollapse" onClick={() => setDesktopExpanded(false)}>طي</button>
          <button type="button" className="appNavMobileClose" onClick={() => setMobileOpen(false)} aria-label="إغلاق">×</button>
        </div>
      </header>

      <div className="appMobilePortalStrip" aria-label="تغيير البوابة">
        <button type="button" data-active={pathname === '/dashboard' ? 'true' : 'false'} onClick={() => go('/dashboard')}>الرئيسية</button>
        {accessibleAreas.map((area) => (
          <button key={area.key} type="button" data-active={currentAreaKey === area.key ? 'true' : 'false'} onClick={() => choosePortal(area)}>{anatomyAreaLabel(area)}</button>
        ))}
      </div>

      <div className="appNavContextBody">
        {projectId ? (
          <div className="appNavContextSections" data-project-navigation="all-groups-visible">
            {projectGroups.map((group) => (
              <section key={group.key} className="appNavContextSection" data-active={group.items.some((item) => item.key === activeProjectKey) ? 'true' : 'false'}>
                <h2>{group.label}</h2>
                <div className="appNavContextItems">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="appNavContextItem"
                      data-active={item.key === activeProjectKey ? 'true' : 'false'}
                      aria-current={item.key === activeProjectKey ? 'page' : undefined}
                      onClick={() => go(item.href)}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <section className="appNavContextSection appNavContextExit">
              <h2>خارج المشروع</h2>
              <div className="appNavContextItems">
                <button type="button" className="appNavContextItem" onClick={() => go('/dashboard/projects')}><span>كل المشاريع</span></button>
                <button type="button" className="appNavContextItem" onClick={() => go('/dashboard')}><span>كل البوابات</span></button>
              </div>
            </section>
          </div>
        ) : currentArea ? (
          <div className="appNavContextSections">
            {currentAreaGroups.map((group) => (
              <section key={group.key} className="appNavContextSection" data-active={group.items.some((item) => item.href === currentGlobalTool?.href) ? 'true' : 'false'}>
                <h2>{group.label}</h2>
                <div className="appNavContextItems">
                  {group.items.map((item) => {
                    const active = currentGlobalTool?.href === item.href;
                    return (
                      <button
                        key={item.href}
                        type="button"
                        className="appNavContextItem"
                        data-active={active ? 'true' : 'false'}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => go(item.href)}
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="appNavContextEmpty">
            <strong>اختر بوابة</strong>
            <span>كل شيء يبدأ من الشريط الرئيسي.</span>
          </div>
        )}
      </div>

      <footer className="appNavContextFooter">
        <button type="button" onClick={() => go('/dashboard/my-work')}>أعمالي</button>
        {me?.access?.approvals ? <button type="button" onClick={() => go('/dashboard/approvals')}>اعتماداتي</button> : null}
        <span className="appNavFooterSpacer" />
        <button type="button" onClick={onSignOut}>خروج</button>
      </footer>
    </aside>
  </>;
}
