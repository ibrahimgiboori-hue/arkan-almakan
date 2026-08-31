import { MODULES } from './app-constitution';

export const ACCESS_PORTALS = Object.freeze([
  { key: 'projects', label: MODULES.projects.label, description: 'المشاريع والتشغيل والتنفيذ والمتابعة والملفات المالية المرتبطة بالمشروع.' },
  { key: 'workforce', label: MODULES.workforce.label, description: 'الموظفون والتوظيف والإجازات والرواتب والعلاقات والهيكل.' },
  { key: 'finance', label: MODULES.finance.label, description: 'المعاملات والذمم والخزينة والبنوك والميزانية والاعتمادات المالية.' },
  { key: 'documents', label: MODULES.documents.label, description: 'المستندات والسجلات والقوالب والمراجعة والاعتماد.' },
  { key: 'admin', label: MODULES.admin.label, description: 'إدارة النظام والشركة والهيكل وسير العمل والتدقيق.' },
]);

export const ACCESS_SCOPE_OPTIONS = Object.freeze([
  { key: 'all', label: 'كل النطاق المسموح' },
  { key: 'project', label: 'مشروع أو مشاريع محددة', portals: ['projects'] },
  { key: 'self', label: 'بياناته وأعماله فقط', portals: ['workforce'] },
]);

const ACTION_LABELS = Object.freeze({
  view: 'عرض',
  create: 'إضافة',
  edit: 'تعديل',
  update: 'تعديل',
  delete: 'حذف',
  submit: 'إرسال',
  approve: 'اعتماد',
  review: 'مراجعة',
  reject: 'رفض',
  forward: 'تحويل',
  export: 'تصدير',
  print: 'طباعة',
  record: 'تسجيل',
  manage: 'إدارة',
  manage_access: 'إدارة الصلاحيات',
  assign: 'إسناد',
  cancel: 'إلغاء',
  close: 'إقفال',
  reopen: 'إعادة فتح',
  pay: 'صرف / سداد',
  post: 'ترحيل',
  reverse: 'عكس',
  route: 'توجيه',
});

const FEATURE_LABELS = Object.freeze({
  projects: 'المشاريع', labor: 'العمالة', timesheets: 'الحضور والتايم شيت', expenses: 'المصروفات',
  progress: 'الإنجاز والقياسات', quotes: 'عروض الأسعار', custody: 'العهد', financial_summary: 'الملخص المالي',
  scope: 'النطاق والإسناد', claims: 'المستخلصات', materials: 'المواد', documents: 'المستندات',
  employees: 'الموظفون', leaves: 'الإجازات', payroll: 'الرواتب', employee_documents: 'وثائق الموظفين',
  disciplinary: 'العلاقات والإجراءات', end_service: 'نهاية الخدمة', recruitment: 'التوظيف', contracts: 'العقود',
  organization: 'الهيكل والتنظيم', advances: 'السلف والمديونيات', cases: 'المعاملات المالية', treasury: 'الخزينة والبنوك',
  reconciliation: 'المطابقة البنكية', dues: 'الذمم والمستحقات', overview: 'الملخص والمتابعة', operating_budget: 'ميزانية وتشغيل الشركة',
  approvals: 'الاعتمادات', access: 'إدارة الدخول والصلاحيات', audit: 'سجل النظام والتدقيق', catalogs: 'قواميس النظام',
});

const GROUPS = Object.freeze({
  projects: Object.freeze({
    daily: { label: 'العمل اليومي', features: ['labor','timesheets','expenses'] },
    execution: { label: 'إدارة التنفيذ', features: ['progress','scope','projects'] },
    finance: { label: 'المالية التشغيلية', features: ['quotes','custody','financial_summary','claims'] },
    files: { label: 'الملفات والمراجع', features: ['documents','materials'] },
  }),
  workforce: Object.freeze({
    people: { label: 'الأفراد', features: ['employees','leaves','employee_documents','disciplinary','end_service'] },
    recruitment: { label: 'التوظيف والتخطيط', features: ['recruitment','contracts','organization'] },
    compensation: { label: 'الرواتب والتعويضات', features: ['payroll'] },
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
    access: { label: 'النظام والصلاحيات', features: ['access','audit','catalogs'] },
    workflow: { label: 'سير العمل والاعتمادات', features: ['approvals'] },
    organization: { label: 'الشركة والهيكل', features: ['organization'] },
  }),
});

function featureFromCapability(capabilityKey) {
  const parts = String(capabilityKey || '').split('.').filter(Boolean);
  if (parts.length < 2) return 'other';
  return parts[1] || 'other';
}

function actionFromCapability(capabilityKey) {
  const parts = String(capabilityKey || '').split('.').filter(Boolean);
  return parts[parts.length - 1] || 'view';
}

function featureLabel(featureKey) {
  return FEATURE_LABELS[featureKey] || featureKey.replaceAll('_', ' ');
}

function groupMeta(portalKey, featureKey, requestedGroupKey) {
  const portalGroups = GROUPS[portalKey] || {};
  if (requestedGroupKey && portalGroups[requestedGroupKey]) {
    return { key: requestedGroupKey, label: portalGroups[requestedGroupKey].label };
  }
  const found = Object.entries(portalGroups).find(([, meta]) => meta.features.includes(featureKey));
  if (found) return { key: found[0], label: found[1].label };
  return { key: 'other', label: 'أخرى' };
}

function capabilityLabel(capability) {
  return capability.name_ar || capability.label_ar || capability.description_ar || ACTION_LABELS[actionFromCapability(capability.capability_key)] || actionFromCapability(capability.capability_key);
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
      const inferredFeature = featureFromCapability(row.capability_key);
      const featureKey = row.feature_key || inferredFeature;
      const group = groupMeta(portal.key, featureKey, row.group_key);
      if (!groups.has(group.key)) groups.set(group.key, { key: group.key, label: group.label, features: new Map() });
      const groupNode = groups.get(group.key);
      if (!groupNode.features.has(featureKey)) {
        groupNode.features.set(featureKey, { key: featureKey, label: featureLabel(featureKey), capabilities: [] });
      }
      groupNode.features.get(featureKey).capabilities.push({
        key: row.capability_key,
        action: actionFromCapability(row.capability_key),
        actionLabel: ACTION_LABELS[actionFromCapability(row.capability_key)] || actionFromCapability(row.capability_key).replaceAll('_', ' '),
        label: capabilityLabel(capability),
        description: capability.description_ar || '',
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
  }]));
}
