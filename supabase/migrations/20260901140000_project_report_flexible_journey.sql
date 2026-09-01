-- تقرير متابعة الأعمال: بيانات المصدر فقط.
-- الملخص التنفيذي/المالي وملخص التقرير والخلاصة ناتج مولد من البنود.
-- أسطر المتابعة داخل البند وأقسام ما بعد البنود تحمل عنواناً حراً يحدده المستخدم.

update public.document_templates
set layout = jsonb_build_object(
  'profile', 'project_work_claims_report',
  'sections', jsonb_build_array(
    jsonb_build_object(
      'id','report_identity',
      'kind','cards',
      'style','info',
      'title','بيانات التقرير',
      'fields', jsonb_build_array(
        jsonb_build_object('key','report_date','span',12,'type','date','label','تاريخ التقرير','required',true),
        jsonb_build_object('key','project_name_text','span',24,'type','text','label','المشروع / الموقع','required',true),
        jsonb_build_object('key','report_subject','span',36,'type','text','label','الموضوع','required',true),
        jsonb_build_object('key','recipient_primary','span',24,'type','text','label','موجّه إلى'),
        jsonb_build_object('key','recipient_secondary','span',24,'type','text','label','ونسخة إلى'),
        jsonb_build_object('key','prepared_by','span',12,'type','text','label','إعداد'),
        jsonb_build_object('key','prepared_title','span',24,'type','text','label','الصفة')
      )
    ),
    jsonb_build_object(
      'id','work_lines',
      'kind','table',
      'style','strict',
      'title','تفصيل الأعمال والمستخلصات',
      'presentation','flexible_item_journey',
      'journey_model','title_text_lines',
      'columns', jsonb_build_array(
        jsonb_build_object('key','item','span',10,'type','text','label','البند','required',true),
        jsonb_build_object('key','quantity','span',5,'type','number','label','الكمية'),
        jsonb_build_object('key','unit','span',4,'type','text','label','الوحدة'),
        jsonb_build_object('key','rate','span',6,'type','money','label','سعر الوحدة'),
        jsonb_build_object('key','work_value','span',7,'type','money','label','قيمة الأعمال'),
        jsonb_build_object('key','paid_value','span',6,'type','money','label','المحصّل'),
        jsonb_build_object('key','pending_value','span',6,'type','money','label','المتبقي / قيد التحويل'),
        jsonb_build_object('key','po_reference','span',7,'type','text','label','PO / المرجع')
      )
    ),
    jsonb_build_object(
      'id','signatures',
      'kind','signatures',
      'roles',jsonb_build_array('مُعدّ التقرير'),
      'style','strict',
      'title','إعداد التقرير'
    )
  ),
  'generated_sections', jsonb_build_object(
    'executive_summary','from_work_lines',
    'report_summary','from_work_lines',
    'conclusion','from_work_lines'
  ),
  'free_sections', jsonb_build_object(
    'enabled',true,
    'model','title_text_sections'
  ),
  'gridColumns',48,
  'schemaVersion',5,
  'constitutionVersion','2.1'
)
where code = 'PROJECT_WORK_CLAIMS_REPORT_V1';
