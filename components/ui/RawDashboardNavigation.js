'use client';

import { useEffect, useMemo, useState } from 'react';
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
  PORTAL_MANAGEMENT_SECTIONS,
} from '@/lib/portal-section-constitution';
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
  if (item?.sectionKey === 'performance') return 'فترة التجربة';
  return item?.label || 'أداة';
}

function isActionOnlyRoute(href = '') {
  return /\/(?:new|create)\/?$/.test(href);
}

function isRedundantPortalTool(areaKey, item) {
  // تخطيط القوى العاملة كان يكرر نفس الشواغر والاحتياج الموجود فعليًا في شاشة التوظيف.
  // نبقي المسار القديم للتوافق، لكن لا نعرض مدخلين لنفس الوظيفة في الملاحة.
  return areaKey === 'workforce' && item?.sectionKey === 'planning';
}

function TabRow({ label, children }) {
  return (
    <div className={styles.tabRow}>
      {label && <span className={styles.tabRowLabel}>{label}</span>}
      <div className={styles.tabScroller}>{children}</div>
    </div>
  );
}

// عارض واحد لكل مجموعات الأدوات في جميع البوابات والمشاريع.
// الاختلاف يأتي من دستور المجموعات فقط، لا من شكل أو سلوك الملاحة.
function GroupedToolRow({ label, groups }) {
  return (
    <div className={styles.tabRow}>
      {label && <span className={styles.tabRowLabel}>{label}</span>}
      <div className={styles.tabScroller}>
        {groups.map((group) => (
          <div className={styles.toolGroup} key={group.key}>
            {group.label && <span className={styles.groupMark}>{group.label}</span>}
            {group.children}
          </div>
        ))}
      </div>
    </div>
  );
}

function groupToolsByConstitution(areaKey, items = []) {
  const sections = PORTAL_MANAGEMENT_SECTIONS[areaKey] || [];
  if (!sections.length) {
    return items.length ? [{ key: `${areaKey || 'area'}-tools`, label: null, items }] : [];
  }

  const byHref = new Map(items.map((item) => [item.href, item]));
  const used = new Set();
  const groups = sections.map((section) => {
    const sectionItems = (section.hrefs || [])
      .map((href) => byHref.get(href))
      .filter(Boolean);
    sectionItems.forEach((item) => used.add(item.href));
    return {
      key: section.key,
      label: section.shortLabel || section.label,
      items: sectionItems,
    };
  }).filter((group) => group.items.length > 0);

  const remaining = items.filter((item) => !used.has(item.href));
  if (remaining.length) {
    groups.push({ key: `${areaKey}-other`, label: 'أخرى', items: remaining });
  }
  return groups;
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

// الشريط يبقى بكامل حجمه عند أعلى الصفحة (كل التسميات والفواصل واضحة)،
// ثم يضيق بمجرد ما المستخدم يبدأ يشتغل/يمرّر — نفس سلوك أشرطة الأدوات في
// أدوات العمل الخام (Linear/GitHub/VSCode): حضور كامل عند الحاجة، انكماش
// فوري لصالح مساحة العمل بمجرد ما المستخدم يتحرك.
function useCompactOnScroll(threshold = 8) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let ticking = false;
    function apply() {
      setCompact(window.scrollY > threshold);
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return compact;
}

export default function RawDashboardNavigation({ me, onSignOut }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactOnScroll();

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
      .filter((item) => !isRedundantPortalTool(currentArea.key,item))
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

  const globalToolsByGroup = useMemo(
    () => groupToolsByConstitution(currentArea?.key, globalTools),
    [currentArea, globalTools],
  );

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
    <nav className={`${styles.nav} ${compact ? styles.navCompact : ''}`} aria-label="الملاحة الرئيسية الخام">
      <div className={styles.topBar}>
        <button type="button" className={styles.action} onClick={() => go(parentHref)} title="العودة للمستوى الأعلى">
          <span aria-hidden="true">←</span>
          <span className={styles.actionLabel}>المستوى السابق</span>
        </button>
        <button type="button" className={styles.action} onClick={() => go('/dashboard')} title="بداية لوحة التحكم">
          <span aria-hidden="true">⌂</span>
          <span className={styles.actionLabel}>الرئيسية</span>
        </button>
        <button type="button" className={styles.signOut} onClick={onSignOut}>خروج</button>
      </div>

      <TabRow label="البوابة">
        {visibleAreas.map((area) => (
          <Tab key={area.key} active={currentArea?.key === area.key} onClick={() => go(area.href)}>
            {cleanPortalLabel(area.label)}
          </Tab>
        ))}
      </TabRow>

      {currentArea && globalToolsByGroup.length > 0 && (
        <GroupedToolRow
          label="الأداة"
          groups={globalToolsByGroup.map((group) => ({
            key: group.key,
            label: group.label,
            children: group.items.map((item) => (
              <Tab key={item.href} tone="alt" active={currentGlobalTool?.href === item.href} onClick={() => go(item.href)}>
                {item.label}
              </Tab>
            )),
          }))}
        />
      )}

      {projectId && projectToolsByGroup.length > 0 && (
        <GroupedToolRow
          label="المشروع"
          groups={projectToolsByGroup.map((group) => ({
            key: group.key,
            label: group.label,
            children: group.items.map((item) => (
              <Tab key={item.key} active={currentProjectTool?.key === item.key} onClick={() => go(item.href)}>
                {item.label}
              </Tab>
            )),
          }))}
        />
      )}
    </nav>
  );
}
