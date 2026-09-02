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
  PORTAL_MANAGEMENT_SECTIONS,
  PORTAL_EXISTING_DESTINATION_CAPABILITIES,
} from '@/lib/portal-section-constitution';
import GlobalSearch from './GlobalSearch';

const OPEN_INTENT_MS = 620;
const CLOSE_GRACE_MS = 520;
const PIN_STORAGE_KEY = 'arkan-context-nav-pinned';

function uniqueByHref(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.href || seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function cleanPortalLabel(value = '') {
  return String(value).replace(/^بوابة\s+/, '').trim();
}

function cleanToolLabel(item) {
  if (item?.sectionKey === 'disciplinary') return 'الإجراءات التأديبية';
  if (item?.sectionKey === 'performance') return 'فترة التجربة';
  return item?.label || 'أداة';
}

function isActionOnlyRoute(href = '') {
  return /\/(?:new|create)\/?$/.test(href);
}

function isRedundantPortalTool(areaKey, item) {
  return areaKey === 'workforce' && item?.sectionKey === 'planning';
}

function panelId(panel) {
  return [panel.type, panel.areaKey, panel.groupKey].filter(Boolean).join(':');
}

export default function ContextualDashboardNavigation({ me, onSignOut }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const lastPathRef = useRef(null);
  const navRef = useRef(null);
  const edgeRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [panel, setPanel] = useState({ type:'root' });
  const [motionDirection, setMotionDirection] = useState('forward');

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
        .map((item) => ({ ...item, label:cleanToolLabel(item) }));
      return [area.key, tools];
    }));
  }, [accessibleAreas, me]);

  const groupsByArea = useMemo(() => Object.fromEntries(accessibleAreas.map((area) => {
    const tools = toolsByArea[area.key] || [];
    const configured = PORTAL_MANAGEMENT_SECTIONS[area.key] || [];
    if (!configured.length) {
      return [area.key, tools.length ? [{ key:'general', label:'أدوات البوابة', items:tools }] : []];
    }

    const itemByHref = new Map(tools.map((item) => [item.href, item]));
    const groups = configured
      .map((group) => ({
        key:group.key,
        label:group.label,
        items:(group.hrefs || []).map((href) => itemByHref.get(href)).filter(Boolean),
      }))
      .filter((group) => group.items.length > 0);

    const assigned = new Set(configured.flatMap((group) => group.hrefs || []));
    const extras = tools.filter((item) => !assigned.has(item.href));
    if (extras.length) groups.push({ key:'general', label:'أدوات أخرى', items:extras });
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

  const contextPanel = useMemo(() => {
    if (projectId) {
      if (currentProjectGroup) return { type:'projectGroup', groupKey:currentProjectGroup.key };
      return { type:'project' };
    }
    if (currentAreaKey) {
      if (currentAreaGroup) return { type:'areaGroup', areaKey:currentAreaKey, groupKey:currentAreaGroup.key };
      return { type:'area', areaKey:currentAreaKey };
    }
    return { type:'root' };
  }, [currentAreaGroup, currentAreaKey, currentProjectGroup, projectId]);

  useEffect(() => {
    let saved = false;
    try { saved = window.localStorage.getItem(PIN_STORAGE_KEY) === 'true'; } catch (_) {}
    setPinned(saved);
    setOpen(saved);
    if (saved) setPanel(contextPanel);
    lastPathRef.current = pathname;
    setPinReady(true);
  // The first contextual panel is intentionally captured from the route at mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pinReady) return undefined;
    document.body.classList.toggle('appNavPinned', pinned);
    try { window.localStorage.setItem(PIN_STORAGE_KEY, String(pinned)); } catch (_) {}
    return () => document.body.classList.remove('appNavPinned');
  }, [pinReady, pinned]);

  useEffect(() => {
    if (!pinReady) return;
    const routeChanged = Boolean(lastPathRef.current && lastPathRef.current !== pathname);
    if (pinned) {
      setOpen(true);
      setPanel(contextPanel);
      setMotionDirection('forward');
    } else if (routeChanged) {
      setOpen(false);
    }
    lastPathRef.current = pathname;
  }, [contextPanel, pathname, pinReady, pinned]);

  useEffect(() => {
    function keydown(event) {
      if (event.key !== 'Escape' || !open) return;
      setPinned(false);
      setOpen(false);
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

  useEffect(() => () => {
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
  }, []);

  function clearTimers() {
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
  }

  function openFromIntent() {
    clearTimers();
    openTimerRef.current = window.setTimeout(() => {
      setPanel(contextPanel);
      setMotionDirection('forward');
      setOpen(true);
    }, OPEN_INTENT_MS);
  }

  function openImmediately() {
    clearTimers();
    setPanel(contextPanel);
    setMotionDirection('forward');
    setOpen(true);
  }

  function keepOpen() {
    window.clearTimeout(closeTimerRef.current);
  }

  function closeWithGrace() {
    window.clearTimeout(openTimerRef.current);
    if (pinned) return;
    closeTimerRef.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  }

  function dive(nextPanel) {
    setMotionDirection('forward');
    setPanel(nextPanel);
  }

  function back(nextPanel) {
    setMotionDirection('back');
    setPanel(nextPanel);
  }

  function go(href) {
    if (!href) return;
    if (!pinned) setOpen(false);
    if (href !== pathname) router.push(href);
  }

  function togglePinned() {
    setPinned((value) => {
      const next = !value;
      if (next) {
        setOpen(true);
        setPanel(contextPanel);
      }
      return next;
    });
  }

  const activeArea = panel.areaKey
    ? accessibleAreas.find((area) => area.key === panel.areaKey) || null
    : null;
  const activeAreaGroups = activeArea ? groupsByArea[activeArea.key] || [] : [];
  const activeAreaGroup = panel.type === 'areaGroup'
    ? activeAreaGroups.find((group) => group.key === panel.groupKey) || null
    : null;
  const activeProjectGroupPanel = panel.type === 'projectGroup'
    ? projectGroups.find((group) => group.key === panel.groupKey) || null
    : null;

  const quickLinks = [
    { label:'مركز العمل', href:'/dashboard' },
    { label:'أعمالي', href:'/dashboard/my-work' },
    ...(me?.access?.approvals ? [{ label:'اعتماداتي', href:'/dashboard/my-work/approvals' }] : []),
  ];

  return <>
    <button
      ref={edgeRef}
      type="button"
      className="appNavHotZone"
      aria-label="فتح قائمة البرنامج"
      aria-expanded={open}
      aria-controls="arkan-context-navigation"
      onPointerEnter={openFromIntent}
      onPointerLeave={() => window.clearTimeout(openTimerRef.current)}
      onClick={openImmediately}
    ><span aria-hidden="true" /></button>

    <button
      type="button"
      className="appNavTouchTrigger"
      aria-expanded={open}
      aria-controls="arkan-context-navigation"
      onClick={openImmediately}
    >القائمة</button>

    <aside
      ref={navRef}
      id="arkan-context-navigation"
      className="appContextNav"
      data-open={open ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      aria-label="التنقل في أركان المكان"
      aria-hidden={!open}
      onPointerEnter={keepOpen}
      onPointerLeave={closeWithGrace}
    >
      {open ? <>
        <header className="appNavHeader">
          <div className="appNavIdentity">
            <strong>أركان المكان</strong>
          </div>
          <button type="button" className="appNavPin" onClick={togglePinned}>
            {pinned ? 'إلغاء التثبيت' : 'إبقاء مفتوحة'}
          </button>
        </header>

        <div className="appNavSearch"><GlobalSearch /></div>

        <div key={panelId(panel)} className="appNavPanel" data-motion={motionDirection}>
          {panel.type === 'root' && <>
            <div className="appNavSectionLabel">العمل</div>
            <div className="appNavList">
              {quickLinks.map((item) => (
                <button key={item.href} type="button" className="appNavRow" data-active={pathname === item.href ? 'true' : 'false'} onClick={() => go(item.href)}>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="appNavSectionLabel">البوابات</div>
            <div className="appNavList">
              {accessibleAreas.map((area) => (
                <button key={area.key} type="button" className="appNavRow appNavRowParent" data-active={currentAreaKey === area.key ? 'true' : 'false'} onClick={() => dive({ type:'area', areaKey:area.key })}>
                  <span>{cleanPortalLabel(area.label)}</span>
                  <small>{(groupsByArea[area.key] || []).length}</small>
                </button>
              ))}
            </div>
          </>}

          {panel.type === 'area' && activeArea && <>
            <button type="button" className="appNavBack" onClick={() => back({ type:'root' })}>البوابات</button>
            <div className="appNavPanelHead"><strong>{cleanPortalLabel(activeArea.label)}</strong></div>
            <div className="appNavList">
              {activeAreaGroups.map((group) => (
                <button key={group.key} type="button" className="appNavRow appNavRowParent" data-active={currentAreaGroup?.key === group.key ? 'true' : 'false'} onClick={() => dive({ type:'areaGroup', areaKey:activeArea.key, groupKey:group.key })}>
                  <span>{group.label}</span>
                  <small>{group.items.length}</small>
                </button>
              ))}
            </div>
          </>}

          {panel.type === 'areaGroup' && activeArea && activeAreaGroup && <>
            <button type="button" className="appNavBack" onClick={() => back({ type:'area', areaKey:activeArea.key })}>{cleanPortalLabel(activeArea.label)}</button>
            <div className="appNavPanelHead"><strong>{activeAreaGroup.label}</strong></div>
            <div className="appNavList">
              {activeAreaGroup.items.map((item) => (
                <button key={item.href} type="button" className="appNavRow" data-active={currentGlobalTool?.href === item.href ? 'true' : 'false'} onClick={() => go(item.href)}>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>}

          {panel.type === 'project' && projectId && <>
            <button type="button" className="appNavBack" onClick={() => back({ type:'area', areaKey:'projects' })}>بوابة المشاريع</button>
            <div className="appNavPanelHead"><strong>المشروع الحالي</strong></div>
            <div className="appNavList">
              {projectGroups.map((group) => (
                <button key={group.key} type="button" className="appNavRow appNavRowParent" data-active={currentProjectGroup?.key === group.key ? 'true' : 'false'} onClick={() => dive({ type:'projectGroup', groupKey:group.key })}>
                  <span>{group.label}</span>
                  <small>{group.items.length}</small>
                </button>
              ))}
            </div>
          </>}

          {panel.type === 'projectGroup' && projectId && activeProjectGroupPanel && <>
            <button type="button" className="appNavBack" onClick={() => back({ type:'project' })}>المشروع الحالي</button>
            <div className="appNavPanelHead"><strong>{activeProjectGroupPanel.label}</strong></div>
            <div className="appNavList">
              {activeProjectGroupPanel.items.map((item) => (
                <button key={item.key} type="button" className="appNavRow" data-active={currentProjectTool?.key === item.key ? 'true' : 'false'} onClick={() => go(item.href)}>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>}
        </div>

        <footer className="appNavFooter">
          <button type="button" onClick={() => go('/dashboard')}>مركز العمل</button>
          <button type="button" onClick={onSignOut}>خروج</button>
        </footer>
      </> : null}
    </aside>
  </>;
}
