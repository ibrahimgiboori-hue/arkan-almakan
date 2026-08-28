-- انتهت مرحلة الانتقال إلى محرر الشجرة الموحد.
-- المدخل العام الوحيد للكتالوج هو budget_save_catalog_node.
drop function if exists public.budget_save_catalog_item(
  uuid,uuid,uuid,text,text,text,text,text,text,boolean,text,integer,date,jsonb,text,date,jsonb
);
