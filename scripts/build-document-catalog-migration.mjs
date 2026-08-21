import { DOCUMENT_CATALOG } from '../lib/document-catalog.mjs';

const sqlString = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const sqlArray = (values) => `ARRAY[${(values || []).map(sqlString).join(', ')}]::text[]`;
const jsonb = (value) => `${sqlString(JSON.stringify(value))}::jsonb`;

const values = DOCUMENT_CATALOG.map((template) => {
  const logic = template.profile === 'finance_request'
    ? [{ id: 'catalog_line_total', target: 'line_total', op: 'multiply', a: 'quantity', b: 'unit_price', scope: 'row' }]
    : [];
  return `(
    ${sqlString(template.code)}, ${sqlString(template.nameAr)}, ${sqlString(template.category)},
    ${sqlString(template.prefix)}, ${jsonb(template.layout)}, ${jsonb(logic)},
    ${sqlString(template.descriptionAr)}, ${sqlArray(template.relationScope)},
    ${sqlArray(template.keywords)}, ${sqlString(template.profile)},
    ${template.catalogOrder}, ${sqlString(template.constitutionVersion)},
    'catalog', true, true
  )`;
}).join(',\n');

const migration = `-- عائلة النماذج والمستندات وفق دستور المطبوعات 1.16
-- يُولد الكتالوج من lib/document-catalog.mjs حتى تبقى البيانات والاختبارات من مصدر واحد.

alter table public.document_templates
  add column if not exists template_source text,
  add column if not exists description_ar text,
  add column if not exists relation_scope text[],
  add column if not exists keywords text[],
  add column if not exists template_profile text,
  add column if not exists catalog_order integer,
  add column if not exists constitution_version text;

update public.document_templates
set template_source = case when code like 'CUSTOM\\_%' escape '\\' then 'user' else 'system' end
where template_source is null;

update public.document_templates
set relation_scope = case
  when category = 'projects' then array['project']::text[]
  when category = 'hr' then array['employee']::text[]
  else array['general']::text[]
end
where relation_scope is null;

update public.document_templates set keywords = array[]::text[] where keywords is null;

alter table public.document_templates
  alter column template_source set default 'system',
  alter column template_source set not null,
  alter column relation_scope set default array['general']::text[],
  alter column relation_scope set not null,
  alter column keywords set default array[]::text[],
  alter column keywords set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_templates'::regclass
      and conname = 'document_templates_source_check'
  ) then
    alter table public.document_templates
      add constraint document_templates_source_check
      check (template_source in ('system', 'catalog', 'user'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_templates'::regclass
      and conname = 'document_templates_relation_scope_check'
  ) then
    alter table public.document_templates
      add constraint document_templates_relation_scope_check
      check (relation_scope <@ array['employee', 'project', 'party', 'general']::text[]);
  end if;
end $$;

create index if not exists idx_document_templates_catalog
  on public.document_templates (template_source, category, catalog_order)
  where is_active = true;

create index if not exists idx_document_templates_keywords
  on public.document_templates using gin (keywords);

create index if not exists idx_documents_project
  on public.documents (project_id)
  where project_id is not null;

insert into public.document_templates (
  code, name_ar, category, prefix, layout, logic, description_ar,
  relation_scope, keywords, template_profile, catalog_order,
  constitution_version, template_source, is_custom, is_active
)
values
${values}
on conflict (code) do update set
  name_ar = excluded.name_ar,
  category = excluded.category,
  prefix = excluded.prefix,
  layout = excluded.layout,
  logic = excluded.logic,
  description_ar = excluded.description_ar,
  relation_scope = excluded.relation_scope,
  keywords = excluded.keywords,
  template_profile = excluded.template_profile,
  catalog_order = excluded.catalog_order,
  constitution_version = excluded.constitution_version,
  template_source = 'catalog',
  is_custom = true;

comment on column public.document_templates.template_source is
  'system: قالب مدمج، catalog: قالب دستوري مركزي، user: نسخة قابلة للتعديل';
comment on column public.document_templates.relation_scope is
  'الكيانات التي يمكن ربط المستند بها: employee/project/party/general';
comment on column public.document_templates.constitution_version is
  'إصدار دستور الطباعة الذي بُني عليه تخطيط القالب';
`;

process.stdout.write(migration);
