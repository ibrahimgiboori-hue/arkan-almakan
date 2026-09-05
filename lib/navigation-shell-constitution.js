import { PORTAL_MANAGEMENT_SECTIONS } from './portal-section-constitution';

// القائمة السياقية لا تملك كتالوجًا ثانيًا للبوابات. البوابات العامة ترث مجموعاتها
// من PORTAL_MANAGEMENT_SECTIONS، ونضيف هنا فقط ما يخص هندسة الملاحة نفسها.
function groupsFromManagement(portalKey) {
  return Object.freeze((PORTAL_MANAGEMENT_SECTIONS[portalKey] || []).map((group) => Object.freeze({
    key: group.key,
    label: group.shortLabel || group.label,
    hrefs: Object.freeze([...(group.hrefs || [])]),
  })));
}

function insertHref(group, href, afterHref = null) {
  const hrefs = [...(group.hrefs || [])].filter((value) => value !== href);
  const at = afterHref ? hrefs.indexOf(afterHref) : -1;
  hrefs.splice(at >= 0 ? at + 1 : hrefs.length, 0, href);
  return Object.freeze({ ...group, hrefs:Object.freeze(hrefs) });
}

const workforceGroups = Object.freeze(groupsFromManagement('workforce').map((group) =>
  group.key === 'people'
    ? insertHref(group, '/dashboard/attendance', '/dashboard/employees')
    : group
));

const financeGroups = Object.freeze((() => {
  const groups = [...groupsFromManagement('finance')];
  const operationsIndex = groups.findIndex((group) => group.key === 'operations');
  const budgetGroup = Object.freeze({
    key:'budget',
    label:'الميزانية والتشغيل',
    hrefs:Object.freeze(['/dashboard/operating-budget']),
  });
  groups.splice(operationsIndex >= 0 ? operationsIndex + 1 : 0, 0, budgetGroup);
  return groups;
})());

export const SHELL_PORTAL_GROUPS = Object.freeze({
  // المشاريع لها قائمة عليا خاصة؛ وما داخل المشروع نفسه يحكمه PROJECT_NAV_GROUPS.
  projects: Object.freeze([
    Object.freeze({ key:'projects', label:'المشاريع', hrefs:Object.freeze(['/dashboard/projects']) }),
    Object.freeze({ key:'parties', label:'الأطراف', hrefs:Object.freeze(['/dashboard/contractors','/dashboard/entities']) }),
    Object.freeze({ key:'commercial', label:'العروض', hrefs:Object.freeze(['/dashboard/quotes']) }),
  ]),
  workforce: workforceGroups,
  finance: financeGroups,
  documents: groupsFromManagement('documents'),
  admin: groupsFromManagement('admin'),
});
