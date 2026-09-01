-- تقرير متابعة الأعمال والمستخلصات: البند هو وحدة القراءة والطباعة.
-- نحتفظ بالأعمدة القديمة للتوافق مع المسودات السابقة، ونضيف تعريف العرض
-- التشغيلي الصريح ليستخدمه المحرر والقبطان دون مسار طباعة موازٍ.

update public.document_templates t
set layout = jsonb_set(
  jsonb_set(t.layout, '{schemaVersion}', '4'::jsonb, true),
  '{sections}',
  (
    select jsonb_agg(
      case
        when section_item->>'id' = 'work_lines' then
          section_item || jsonb_build_object(
            'presentation', 'item_journey',
            'operational_fields', jsonb_build_array(
              jsonb_build_object('key','execution_status','label','حالة التنفيذ'),
              jsonb_build_object('key','delivery_status','label','حالة التسليم'),
              jsonb_build_object('key','claim_status','label','حالة المستخلص'),
              jsonb_build_object('key','po_status','label','حالة PO'),
              jsonb_build_object('key','collection_status','label','حالة التحصيل'),
              jsonb_build_object('key','next_action','label','الإجراء التالي'),
              jsonb_build_object('key','notes','label','ملاحظات')
            )
          )
        else section_item
      end
      order by ord
    )
    from jsonb_array_elements(t.layout->'sections') with ordinality as x(section_item, ord)
  ),
  true
)
where t.code='PROJECT_WORK_CLAIMS_REPORT_V1';
