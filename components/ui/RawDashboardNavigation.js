'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AREAS,
  PROJECT_NAV_GROUPS,
  activeConstitutionItem,
  activeProjectNavigationKey,
  projectNavigationHref,
} from '@/lib/app-constitution';
import { filterAreasForAccess, projectNavRequirement } from '@/lib/access-ui';
import { PORTAL_SECTION_ITEMS, PORTAL_EXISTING_DESTINATION_CAPABILITIES } from '@/lib/portal-section-constitution';

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

function NavTab({ active, tone = 'primary', onClick, children, title }) {
  return (
    <button
      type="button"
      className={`rawNavTab ${active ? (tone === 'tool' ? 'rawNavTabOnTool' : 'rawNavTabOn') : ''}`}
      onClick={onClick}
      title={title}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </button>
  );
}

function ToolGroup({ label, children }) {
  return (
    <div className="rawNavToolGroup">
      {label && <span className="rawNavGroupMark">{label}</span>}
      {children}
    </div>
  );
}

export default function RawDashboardNavigation({ me, onSignOut }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visibleAreas = useMemo(
    () => filterAreasForAccess(AREAS, me?.access || {}).filter((area) => area.key !== 'home'),
    [me],
  );

  const projectMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)(?:\/|$)/);
  const projectId = projectMatch?.[1] || null;
  const projectBase = projectId ? `/dashboard/projects/${projectId}` : null;
  const sectionMatch = pathname.match(/^\/dashboard\/workspace\/(projects|workforce|finance|documents|admin)\/section\/[^/]+/);
  const constitutionItem = activeConstitutionItem(pathname);
  const currentAreaKey = projectId ? 'projects' : sectionMatch?.[1] || constitutionItem?.area?.key || null;
  const currentArea = visibleAreas.find((area) => area.key === currentAreaKey) || null;

  const globalTools = useMemo(() => {
    if (!currentArea) return [];
    const capabilityKeys = me?.capabilityKeys || new Set();
    const merged = uniqueByHref([
      ...(currentArea.items || []),
      ...(PORTAL_SECTION_ITEMS[currentArea.key] || []),
    ]);

    return merged
      .filter((item) => !item.hidden && !item.legacy && !isActionOnlyRoute(item.href))
      .filter((item) => !isRedundantPortalTool(currentArea.key, item))
      .filter((item) => {
        if (me?.access?.fullAdmin) return true;
        if (currentArea.key === 'projects' && !me?.access?.projectsScreen) return item.href === currentArea.href;
        const required = item.capabilities || PORTAL_EXISTING_DESTINATION_CAPABILITIES[item.href] || [];
        if (required.length) return required.some((key) => capabilityKeys.has(key));
        return true;
      })
      .map((item) => ({ ...item, label: cleanToolLabel(item) }));
  }, [currentArea, me]);

  const currentGlobalTool = useMemo(() => (
    globalTools
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] || null
  ), [globalTools, pathname]);

  const projectTools = useMemo(() => {
    if (!projectId) return [];
    const globallyVisibleHrefs = new Set(globalTools.map((item) => item.href));
    const projectCaps = (me?.capabilities || []).filter((cap) =>
      cap.module_key === 'projects' &&
      (cap.scope_type === 'all' || (cap.scope_type === 'project' && cap.scope_key === projectId))
    );
    const full = Boolean(me?.access?.fullAdmin) || projectCaps.some((cap) => cap.source_key === 'projects_full_access');
    const hasAny = (keys) => full || keys.some((key) => projectCaps.some((cap) => cap.capability_key === key));

    return PROJECT_NAV_GROUPS.flatMap((group) => group.items.map((item) => ({
      ...item,
      groupKey: group.key,
      groupLabel: group.label,
      href: projectNavigationHref(projectId, item),
    })))
      .filter((item) => !globallyVisibleHrefs.has(item.href))
      .filter((item) => {
        const required = projectNavRequirement(item.key);
        return required.length === 0 || hasAny(required);
      });
  }, [globalTools, me, projectId]);

  const activeProjectKey = projectId
    ? activeProjectNavigationKey({ projectId, pathname, view: searchParams.get('view') })
    : null;
  const currentProjectTool = projectTools.find((item) => item.key === activeProjectKey) || null;

  const projectToolsByGroup = useMemo(() => (
    PROJECT_NAV_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      items: projectTools.filter((item) => item.groupKey === group.key),
    })).filter((group) => group.items.length > 0)
  ), [projectTools]);

  const parentHref = useMemo(() => {
    if (projectId) {
      const isProjectRoot = pathname === projectBase && !searchParams.get('view');
      return isProjectRoot ? '/dashboard/projects' : projectBase;
    }
    if (currentArea) {
      if (pathname === currentArea.href) return '/dashboard';
      return currentArea.href;
    }
    return '/dashboard';
  }, [currentArea, pathname, projectBase, projectId, searchParams]);

  function go(value) {
    if (!value || value === pathname) return;
    router.push(value);
  }

  return (
    <nav className="rawNav" aria-label="الملاحة الرئيسية">
      <div className="rawNavPrimary">
        <div className="rawNavActions">
          <button type="button" className="rawNavAction" onClick={() => go(parentHref)} title="العودة للمستوى الأعلى">
            <span aria-hidden="true">←</span><span>السابق</span>
          </button>
          <button type="button" className="rawNavAction" onClick={() => go('/dashboard')} title="بداية لوحة التحكم">
            <span aria-hidden="true">⌂</span><span>الرئيسية</span>
          </button>
        </div>

        <span className="rawNavRailLabel">البوابة</span>
        <div className="rawNavScroller rawNavPortalScroller">
          {visibleAreas.map((area) => (
            <NavTab key={area.key} active={currentArea?.key === area.key} onClick={() => go(area.href)}>
              {cleanPortalLabel(area.label)}
            </NavTab>
          ))}
        </div>

        <button type="button" className="rawNavSignOut" onClick={onSignOut}>خروج</button>
      </div>

      <div className="rawNavContext">
        <span className="rawNavRailLabel">المسار</span>
        <div className="rawNavScroller rawNavContextScroller">
          {globalTools.length > 0 && (
            <ToolGroup label={projectId ? 'عام' : null}>
              {globalTools.map((item) => (
                <NavTab
                  key={item.href}
                  tone="tool"
                  active={currentGlobalTool?.href === item.href}
                  onClick={() => go(item.href)}
                >
                  {item.label}
                </NavTab>
              ))}
            </ToolGroup>
          )}

          {projectToolsByGroup.map((group) => (
            <ToolGroup key={group.key} label={group.label}>
              {group.items.map((item) => (
                <NavTab key={item.key} active={currentProjectTool?.key === item.key} onClick={() => go(item.href)}>
                  {item.label}
                </NavTab>
              ))}
            </ToolGroup>
          ))}

          {!globalTools.length && !projectToolsByGroup.length && <span className="rawNavEmptyRail" aria-hidden="true">—</span>}
        </div>
      </div>
    </nav>
  );
}
