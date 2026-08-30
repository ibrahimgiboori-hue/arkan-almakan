-- Keep the project work / claims report aligned with print constitution v2.
-- This migration is idempotent against environments where the report template
-- was already created interactively.

update public.document_templates
set layout = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       layout,
                       '{sections,1,kind}', '"totals"'::jsonb, false
                     ),
                     '{sections,3,columns,7,span}', '7'::jsonb, false
                   ),
                   '{sections,3,columns,8,span}', '25'::jsonb, false
                 ),
                 '{sections,3,columns,6,label}', '"بانتظار التحويل"'::jsonb, false
               ),
               '{constitutionVersion}', '"2.0"'::jsonb, true
             ),
    constitution_version = '2.0',
    updated_at = now()
where code = 'PROJECT_WORK_CLAIMS_REPORT_V1';
