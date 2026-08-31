-- Remove cross-portal aliases that made one portal capable of surfacing another portal.
delete from public.permission_portal_capabilities
where (portal_key='documents' and capability_key='system.approvals.view')
   or (portal_key='finance' and capability_key='system.approvals.view')
   or (portal_key='admin' and capability_key='hr.organization.view');

-- Documents portal: native resources instead of borrowing system capabilities.
insert into public.permission_capabilities(
  capability_key,module_key,module_label_ar,resource_key,resource_label_ar,action_key,description_ar,risk_level,is_active
) values
  ('documents.documents.view','documents','المستندات','documents','المستندات','view','عرض المستندات والعمل الجاري',0,true),
  ('documents.documents.create','documents','المستندات','documents','المستندات','create','إنشاء مستند جديد',1,true),
  ('documents.documents.edit','documents','المستندات','documents','المستندات','edit','تعديل المستندات الجارية',1,true),
  ('documents.documents.delete','documents','المستندات','documents','المستندات','delete','حذف مستند وفق قواعد الحذف الآمن',3,true),
  ('documents.register.view','documents','المستندات','register','الصادر والوارد','view','عرض سجل الصادر والوارد',0,true),
  ('documents.register.create','documents','المستندات','register','الصادر والوارد','create','تسجيل صادر أو وارد',1,true),
  ('documents.register.edit','documents','المستندات','register','الصادر والوارد','edit','تعديل بيانات سجل الصادر والوارد',1,true),
  ('documents.archive.view','documents','المستندات','archive','الأرشيف','view','عرض الأرشيف والنسخ المحفوظة',0,true),
  ('documents.templates.view','documents','المستندات','templates','النماذج والقوالب','view','عرض مكتبة النماذج والقوالب',0,true),
  ('documents.templates.edit','documents','المستندات','templates','النماذج والقوالب','edit','إنشاء وتعديل النماذج والقوالب',2,true),
  ('documents.approvals.view','documents','المستندات','approvals','مراجعة المستندات','view','عرض المستندات التي تحتاج مراجعة أو اعتماد',1,true)
on conflict (capability_key) do update set
  module_key=excluded.module_key,
  module_label_ar=excluded.module_label_ar,
  resource_key=excluded.resource_key,
  resource_label_ar=excluded.resource_label_ar,
  action_key=excluded.action_key,
  description_ar=excluded.description_ar,
  risk_level=excluded.risk_level,
  is_active=true;

-- Admin portal: expose each administrative surface independently instead of making
-- system.access.manage_access a universal substitute for every admin screen.
insert into public.permission_capabilities(
  capability_key,module_key,module_label_ar,resource_key,resource_label_ar,action_key,description_ar,risk_level,is_active
) values
  ('system.board.view','system','النظام','board','مجلس الإدارة','view','عرض بيانات مجلس الإدارة',0,true),
  ('system.board.edit','system','النظام','board','مجلس الإدارة','edit','تعديل بيانات مجلس الإدارة',2,true),
  ('system.company.view','system','النظام','company','بيانات الشركة','view','عرض بيانات الشركة وإعداداتها العامة',0,true),
  ('system.company.edit','system','النظام','company','بيانات الشركة','edit','تعديل بيانات الشركة وإعداداتها العامة',2,true),
  ('system.organization.view','system','النظام','organization','الهيكل التنظيمي','view','عرض الهيكل التنظيمي من بوابة الإدارة',0,true),
  ('system.organization.edit','system','النظام','organization','الهيكل التنظيمي','edit','تعديل الهيكل التنظيمي من بوابة الإدارة',2,true),
  ('system.backup.view','system','النظام','backup','النسخ الاحتياطي','view','عرض حالة النسخ الاحتياطية',1,true),
  ('system.backup.create','system','النظام','backup','النسخ الاحتياطي','create','إنشاء نسخة احتياطية',3,true),
  ('system.procedures.view','system','النظام','procedures','دستور حركة المعاملات','view','عرض دستور حركة المعاملات',1,true),
  ('system.procedures.edit','system','النظام','procedures','دستور حركة المعاملات','edit','تعديل قواعد حركة المعاملات',3,true),
  ('system.workflows.view','system','النظام','workflows','سير العمل والاعتمادات','view','عرض مسارات سير العمل والاعتمادات',1,true),
  ('system.workflows.edit','system','النظام','workflows','سير العمل والاعتمادات','edit','تعديل مسارات سير العمل والاعتمادات',3,true),
  ('system.audit.view','system','النظام','audit','سجل النظام والتدقيق','view','عرض سجل التعديلات والإجراءات',1,true),
  ('system.catalogs.view','system','النظام','catalogs','قواميس النظام','view','عرض قواميس النظام والقيم المرجعية',1,true),
  ('system.catalogs.edit','system','النظام','catalogs','قواميس النظام','edit','تعديل قواميس النظام والقيم المرجعية',3,true)
on conflict (capability_key) do update set
  module_key=excluded.module_key,
  module_label_ar=excluded.module_label_ar,
  resource_key=excluded.resource_key,
  resource_label_ar=excluded.resource_label_ar,
  action_key=excluded.action_key,
  description_ar=excluded.description_ar,
  risk_level=excluded.risk_level,
  is_active=true;

-- Backfill explicitly in case this migration is replayed in an environment where the
-- registration trigger was created after some capability rows.
insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'documents',capability_key
from public.permission_capabilities
where module_key='documents'
on conflict do nothing;

insert into public.permission_portal_capabilities(portal_key,capability_key)
select 'admin',capability_key
from public.permission_capabilities
where module_key='system'
on conflict do nothing;
