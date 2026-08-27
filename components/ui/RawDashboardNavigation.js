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
import styles from './RawDashboardNavigation.module.css';

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
  return item?.label || 'أداة';
}

function isActionOnlyRoute(href = '') {
  return /\/(?:new|create)\/?$/.test(href);
}

function TabRow({ label, children }) {
  return (
    <div className={styles.tabRow}>
      {label && <span className={styles.tabRowLabel}>{label}</span>}
      <div className={styles.tabScroller}>{children}</div>
    </div>
  );
}

function Tab({ active, tone, onClick, children, title }) {
  const toneClass = tone === 'alt' ? styles.tabOnAlt : styles.tabOn;
  return (
    <button
      type="button"
      className={`${styles.tab} ${active ? toneClass : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
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
      .filter((item) => {
        if (me?.access?.fullAdmin) return true;
        if (currentArea.key === 'projects' && !me?.access?.projectsScreen) return item.href === currentArea.href;
        const required = item.capabilities || PORTAL_EXISTING_DESTINATION_CAPABILITIES[item.href] || [];
        if (required.length) return required.some((key) => capabilityKeys.has(key));
        return true;
      })
      .map((item) => ({ ...item, label: cleanToolLabel(item) }));
  }, [currentArea, me]);

  const currentGlobalTool = useMemo(() => {
    return globalTools
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] || null;
  }, [globalTools, pathname]);

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

  const projectToolsByGroup = useMemo(() => {
    return PROJECT_NAV_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      items: projectTools.filter((item) => item.groupLabel === group.label),
    })).filter((group) => group.items.length > 0);
  }, [projectTools]);

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
    if (!value) return;
    router.push(value);
  }

  return (
    <nav className={styles.nav} aria-label="الملاحة الرئيسية الخام">
      <div className={styles.topBar}>
        <button type="button" className={styles.action} onClick={() => go(parentHref)} title="العودة للمستوى الأعلى">← المستوى السابق</button>
        <button type="button" className={styles.action} onClick={() => go('/dashboard')} title="بداية لوحة التحكم">الرئيسية</button>
        <button type="button" className={styles.signOut} onClick={onSignOut}>خروج</button>
      </div>

      <TabRow label="البوابة">
        {visibleAreas.map((area) => (
          <Tab key={area.key} active={currentArea?.key === area.key} onClick={() => go(area.href)}>
            {cleanPortalLabel(area.label)}
          </Tab>
        ))}
      </TabRow>

      {currentArea && globalTools.length > 0 && (
        <TabRow label="الأداة">
          {globalTools.map((item) => (
            <Tab key={item.href} tone="alt" active={currentGlobalTool?.href === item.href} onClick={() => go(item.href)}>
              {item.label}
            </Tab>
          ))}
        </TabRow>
      )}

      {projectId && projectToolsByGroup.map((group) => (
        <TabRow key={group.key} label={group.label}>
          {group.items.map((item) => (
            <Tab key={item.key} active={currentProjectTool?.key === item.key} onClick={() => go(item.href)}>
              {item.label}
            </Tab>
          ))}
        </TabRow>
      ))}
    </nav>
  );
}
