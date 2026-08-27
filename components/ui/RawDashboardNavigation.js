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
      <button type="button" className={styles.action} onClick={() => go(parentHref)} title="العودة للمستوى الأعلى">← المستوى السابق</button>
      <button type="button" className={styles.action} onClick={() => go('/dashboard')} title="بداية لوحة التحكم">الرئيسية</button>

      <label className={styles.field}>
        <span>البوابة</span>
        <select value={currentArea?.key || ''} onChange={(e) => {
          const area = visibleAreas.find((item) => item.key === e.target.value);
          if (area) go(area.href);
        }}>
          <option value="">اختر بوابة</option>
          {visibleAreas.map((area) => <option key={area.key} value={area.key}>{cleanPortalLabel(area.label)}</option>)}
        </select>
      </label>

      <label className={styles.field}>
        <span>الأداة</span>
        <select value={currentGlobalTool?.href || ''} onChange={(e) => go(e.target.value)} disabled={!currentArea || globalTools.length === 0}>
          <option value="">{currentArea ? 'اختر أداة' : 'اختر البوابة أولًا'}</option>
          {globalTools.map((item) => <option key={item.href} value={item.href}>{item.label}</option>)}
        </select>
      </label>

      {projectId && projectTools.length > 0 && (
        <label className={`${styles.field} ${styles.projectField}`}>
          <span>داخل المشروع</span>
          <select value={currentProjectTool?.href || ''} onChange={(e) => go(e.target.value)}>
            <option value="">اختر أداة المشروع</option>
            {PROJECT_NAV_GROUPS.map((group) => {
              const groupItems = projectTools.filter((item) => item.groupLabel === group.label);
              if (!groupItems.length) return null;
              return <optgroup label={group.label} key={group.key}>{groupItems.map((item) => <option key={item.key} value={item.href}>{item.label}</option>)}</optgroup>;
            })}
          </select>
        </label>
      )}

      <button type="button" className={styles.signOut} onClick={onSignOut}>خروج</button>
    </nav>
  );
}
