import { MODULES } from './app-constitution';

export const ACCESS_PORTALS = Object.freeze([
  { key: 'projects', label: MODULES.projects.label, description: 'المشاريع والتشغيل والتنفيذ والمتابعة والملفات المالية المرتبطة بالمشروع.' },
  { key: 'workforce', label: MODULES.workforce.label, description: 'الموظفون والتوظيف والإجازات والرواتب والعلاقات والهيكل.' },
  { key: 'finance', label: MODULES.finance.label, description: 'المعاملات والذمم والخزينة والبنوك والميزانية والاعتمادات المالية.' },
  { key: 'documents', label: MODULES.documents.label, description: 'المستندات والسجلات والقوالب والمراجعة والاعتماد.' },
  { key: 'admin', label: MODULES.admin.label, description: 'إدارة النظام والشركة والهيكل وسير العمل والتدقيق.' },
]);

// These values are constrained by the live permission tables. More scope editors can be
// added when their canonical selector (department/entity/etc.) is available in the UI.
export const ACCESS_SCOPE_OPTIONS = Object.freeze([
  { key: 'all', label: 'كامل النطاق' },
  { key: 'project', label: 'مشروع أو مشاريع محددة', portals: ['projects'] },
]);

const ACTION_LABELS = Object.freeze({
  view: 'عرض', create: 'إضافة', edit: 'تعديل', delete: 'حذف', submit: 'إرسال',
  approve: 'اعتماد', final_approve: 'اعتماد نهائي', review: 'مراجعة', reject: 'رفض',
  return: 'إرجاع', hold: 'تعليق', release: 'فك التعليق', forward: 'تحويل', export: 'تصدير',
  print: 'طباعة', record: 'تسجيل', manage: 'إدارة', manage_access: 'إدارة الصلاحيات',
  assign: 'إسناد', cancel: 'إلغاء', reopen: 'إعادة فتح', pay: 'صرف / سداد', post: 'ترحيل',
  reverse: 'عكس', route: 'توجيه', reconcile: 'مطابقة', collect: 'تحصيل', change_status: 'تغيير الحالة',
  correct: 'تصحيح',
});

const GROUPS = Object.freeze({
  projects: Object.freeze({
    daily: { label: 'العمل اليومي', features: ['labor','labor_correction','timesheets','expenses','execution'] },
    execution: { label: 'إدارة التنفيذ', features: ['progress','scope','projects','contract_value'] },
    parties: { label: 'الأطراف والإسناد', features: ['contractors','contractor_master','contractor_permits','entities'] },
    finance: { label: 'المالية التشغيلية', features: ['quotes','custody','financial_summary','claims'] },
    files: { label: 'الملفات والمراجع', features: ['documents','materials','overview'] },
  }),
  workforce: Object.freeze({
    people: { label: 'الأفراد', features: ['employees','leaves','employee_documents','disciplinary','end_service','overview'] },
    recruitment: { label: 'التوظيف والتخطيط', features: ['recruitment','contracts','organization'] },
    compensation: { label: 'الرواتب والتعويضات', features: ['payroll'] },
    governance: { label: 'الحوكمة', features: ['governance'] },
  }),
  finance: Object.freeze({
    operations: { label: 'المعاملات والذمم', features: ['advances','cases','dues'] },
    treasury: { label: 'الخزينة والبنوك', features: ['treasury','reconciliation'] },
    control: { label: 'التحكم المالي', features: ['overview','projects','payroll','operating_budget'] },
    approvals: { label: 'الاعتمادات', features: ['approvals'] },
  }),
  documents: Object.freeze({
    documents: { label: 'المستندات', features: ['documents'] },
    approvals: { label: 'المراجعة والاعتماد', features: ['approvals'] },
  }),
  admin: Object.freeze({
    access: { label: 'النظام والصلاحيات', features: ['access'] },
    workflow: { label: 'سير العمل والاعتمادات', features: ['approvals'] },
    organization: { label: 'الشركة والهيكل', features: ['organization'] },
  }),
});

function groupMeta(portalKey, featureKey, requestedGroupKey) {
  const portalGroups = GROUPS[portalKey] || {};
  if (requestedGroupKey && portalGroups[requestedGroupKey]) {
    return { key: requestedGroupKey, label: portalGroups[requestedGroupKey].label };
  }
  const found = Object.entries(portalGroups).find(([, meta]) => meta.features.includes(featureKey));
  if (found) return { key: found[0], label: found[1].label };
  return { key: 'other', label: 'أخرى' };
}

function fallbackFeature(capabilityKey) {
  const parts = String(capabilityKey || '').split('.').filter(Boolean);
  return parts[1] || 'other';
}

function fallbackAction(capabilityKey) {
  const parts = String(capabilityKey || '').split('.').filter(Boolean);
  return parts[parts.length - 1] || 'view';
}

export function scopeOptionsForPortal(portalKey) {
  return ACCESS_SCOPE_OPTIONS.filter((option) => !option.portals || option.portals.includes(portalKey));
}

export function buildAccessTree(capabilities = [], portalCapabilityMap = []) {
  const capabilityByKey = new Map(
    capabilities
      .filter((item) => item && item.capability_key && item.is_active !== false)
      .map((item) => [item.capability_key, item]),
  );

  return ACCESS_PORTALS.map((portal) => {
    const groups = new Map();
    const rows = portalCapabilityMap
      .filter((row) => row.portal_key === portal.key && capabilityByKey.has(row.capability_key))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.capability_key).localeCompare(String(b.capability_key)));

    rows.forEach((row) => {
      const capability = capabilityByKey.get(row.capability_key);
      const featureKey = row.feature_key || capability.resource_key || fallbackFeature(row.capability_key);
      const featureLabel = capability.resource_label_ar || featureKey.replaceAll('_', ' ');
      const action = capability.action_key || fallbackAction(row.capability_key);
      const group = groupMeta(portal.key, featureKey, row.group_key);

      if (!groups.has(group.key)) groups.set(group.key, { key: group.key, label: group.label, features: new Map() });
      const groupNode = groups.get(group.key);
      if (!groupNode.features.has(featureKey)) {
        groupNode.features.set(featureKey, { key: featureKey, label: featureLabel, capabilities: [] });
      }
      groupNode.features.get(featureKey).capabilities.push({
        key: row.capability_key,
        action,
        actionLabel: ACTION_LABELS[action] || action.replaceAll('_', ' '),
        label: `${featureLabel} — ${ACTION_LABELS[action] || action.replaceAll('_', ' ')}`,
        description: capability.description_ar || '',
        riskLevel: Number(capability.risk_level || 0),
      });
    });

    return {
      ...portal,
      capabilityKeys: rows.map((row) => row.capability_key),
      groups: [...groups.values()].map((group) => ({ ...group, features: [...group.features.values()] })),
    };
  });
}

export function emptyAccessDraft(tree = []) {
  return Object.fromEntries(tree.map((portal) => [portal.key, {
    mode: 'none',
    scopeType: 'all',
    scopeKeys: [],
    selectedCapabilities: [],
    excludedCapabilities: [],
  }]));
}
