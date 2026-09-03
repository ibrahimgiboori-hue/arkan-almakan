import { AREAS } from './app-constitution';
import { anatomyToolLabel } from './anatomical-navigation';
import { PROJECT_GUARDIANS } from './living-navigation';
import { SHELL_PORTAL_GROUPS } from './navigation-shell-constitution';
import {
  PORTAL_EXISTING_DESTINATION_CAPABILITIES,
  PORTAL_SECTION_ITEMS,
} from './portal-section-constitution';

export const LIVING_PORTALS = Object.freeze(['projects','workforce','finance','documents','admin']);

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

function routeMatches(pathname = '', href = '') {
  if (!href || !pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function portalArea(portalKey) {
  return AREAS.find((area) => area.key === portalKey && area.key !== 'home') || null;
}

export function portalApproachHref(portalKey, groupKey = '') {
  const base = `/dashboard/workspace/${encodeURIComponent(portalKey)}`;
  return groupKey ? `${base}?group=${encodeURIComponent(groupKey)}` : base;
}

export function accessiblePortalTools(portalKey, session) {
  const area = portalArea(portalKey);
  if (!area) return [];
  const capabilityKeys = session?.capabilityKeys || new Set();
  return uniqueByHref([
    ...(area.items || []),
    ...(PORTAL_SECTION_ITEMS[portalKey] || []),
  ])
    .filter((item) => !item.hidden && !item.legacy && !isActionOnlyRoute(item.href))
    .filter((item) => {
      if (session?.access?.fullAdmin) return true;
      if (portalKey === 'projects' && !session?.access?.projectsScreen) return item.href === area.href;
      const required = item.capabilities || PORTAL_EXISTING_DESTINATION_CAPABILITIES[item.href] || [];
      if (required.length) return required.some((key) => capabilityKeys.has(key));
      return true;
    })
    .map((item) => ({ ...item, label:anatomyToolLabel(portalKey, item) }));
}

export function livingPortalGroups(portalKey, session) {
  const tools = accessiblePortalTools(portalKey, session);
  const byHref = new Map(tools.map((item) => [item.href, item]));
  const groups = (SHELL_PORTAL_GROUPS[portalKey] || []).map((group) => ({
    ...group,
    items:(group.hrefs || []).map((href) => byHref.get(href)).filter(Boolean),
  })).filter((group) => group.items.length > 0);

  const covered = new Set(groups.flatMap((group) => group.items.map((item) => item.href)));
  const uncovered = tools.filter((item) => !covered.has(item.href));
  if (uncovered.length) {
    groups.push({
      key:'other',
      label:'أدوات أخرى',
      hrefs:Object.freeze(uncovered.map((item) => item.href)),
      items:uncovered,
      generatedCoverageFallback:true,
    });
  }
  return groups;
}

// كل بوابة تقدم عقد الدخول الخاصة بها كمعلومات فقط؛ الرسم والسلوك موحدان في القائمة.
// المشاريع لديها حاضنات حياة حقيقية، ولذلك تستبدل عقد السجل/العروض بحاضناتها،
// بينما تبقى المجموعات الأخرى (مثل الأطراف) عقدًا عادية داخل المحرك نفسه.
export function portalEntryNodes(portalKey, session) {
  const groups = livingPortalGroups(portalKey, session);
  if (portalKey !== 'projects') {
    return groups.map((group) => ({
      key:`group:${group.key}`,
      nodeKind:'group',
      label:group.label,
      href:portalApproachHref(portalKey, group.key),
      groupKey:group.key,
    }));
  }

  const toolHrefs = new Set(accessiblePortalTools('projects', session).map((item) => item.href));
  const guardians = PROJECT_GUARDIANS
    .filter((guardian) => guardian.entityKind === 'project' || toolHrefs.has(guardian.href))
    .map((guardian) => ({
      key:`guardian:${guardian.key}`,
      nodeKind:'guardian',
      label:guardian.label,
      href:guardian.href,
      guardianKey:guardian.key,
    }));

  const auxiliaryGroups = groups
    .filter((group) => !['projects','commercial'].includes(group.key))
    .map((group) => ({
      key:`group:${group.key}`,
      nodeKind:'group',
      label:group.label,
      href:portalApproachHref('projects', group.key),
      groupKey:group.key,
    }));

  return [...guardians, ...auxiliaryGroups];
}

export function activePortalGroup(portalKey, pathname, searchParams, session) {
  const groups = livingPortalGroups(portalKey, session);
  const requested = searchParams?.get?.('group') || '';
  if (requested) {
    const byQuery = groups.find((group) => group.key === requested);
    if (byQuery) return byQuery;
  }

  return groups
    .map((group) => ({
      group,
      match:group.items
        .filter((item) => routeMatches(pathname, item.href))
        .sort((a, b) => b.href.length - a.href.length)[0] || null,
    }))
    .filter((entry) => entry.match)
    .sort((a, b) => b.match.href.length - a.match.href.length)[0]?.group || null;
}

export function activePortalTool(portalKey, pathname, group, session) {
  if (!group) return null;
  const allowed = new Set(accessiblePortalTools(portalKey, session).map((item) => item.href));
  return (group.items || [])
    .filter((item) => allowed.has(item.href) && routeMatches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0] || null;
}

export function portalCoverageReport(portalKey, session) {
  const tools = accessiblePortalTools(portalKey, session);
  const groups = livingPortalGroups(portalKey, session);
  const covered = new Set(groups.flatMap((group) => group.items.map((item) => item.href)));
  return {
    portalKey,
    toolCount:tools.length,
    groupCount:groups.length,
    entryNodeCount:portalEntryNodes(portalKey, session).length,
    uncovered:tools.filter((item) => !covered.has(item.href)),
  };
}
