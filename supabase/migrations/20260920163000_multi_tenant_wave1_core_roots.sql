begin;

-- Shared tenant-data access gate. Existing business capability policies remain
-- permissive; this restrictive boundary is ANDed with them.
create or replace function private.has_tenant_data_access(
  p_organization_id uuid,
  p_module_key text default 'core'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select p_organization_id=public.current_organization_id()
    and private.has_active_org_membership(p_organization_id)
    and exists (
      select 1
      from public.organization_modules core
      where core.organization_id=p_organization_id
        and core.module_key='core'
        and core.status in ('active','trial')
    )
    and (
      p_module_key='core'
      or exists (
        select 1
        from public.organization_modules m
        where m.organization_id=p_organization_id
          and m.module_key=p_module_key
          and m.status in ('active','trial')
      )
    );
$$;

revoke all on function private.has_tenant_data_access(uuid,text)
from public,anon,authenticated;
grant execute on function private.has_tenant_data_access(uuid,text)
to authenticated,service_role;

alter table public.organization_settings
  add column if not exists document_prefix text not null default 'ORG';

update public.organization_settings s
set document_prefix='ARK'
from public.organizations o
where o.id=s.organization_id
  and o.slug='arkan-al-makan';

-- Wave 1: central business roots.
alter table public.employees
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.entities
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.projects
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.quotations
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.documents
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.treasury_accounts
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.cash_voucher_books
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.cash_vouchers
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.number_sequences
  add column if not exists organization_id uuid references public.organizations(id);

-- Existing Arkan production data becomes tenant #1.
update public.employees set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.entities set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.projects set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.quotations set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.documents set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.treasury_accounts set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.cash_voucher_books set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.cash_vouchers set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;
update public.number_sequences set organization_id=(select id from public.organizations where slug='arkan-al-makan')
where organization_id is null;

do $$
declare t text; v_count bigint;
begin
  foreach t in array array[
    'employees','entities','projects','quotations','documents',
    'treasury_accounts','cash_voucher_books','cash_vouchers','number_sequences'
  ]
  loop
    execute format('select count(*) from public.%I where organization_id is null',t) into v_count;
    if v_count<>0 then
      raise exception 'tenant backfill failed for %, % rows remain unowned',t,v_count;
    end if;
  end loop;
end $$;

alter table public.employees alter column organization_id set not null;
alter table public.entities alter column organization_id set not null;
alter table public.projects alter column organization_id set not null;
alter table public.quotations alter column organization_id set not null;
alter table public.documents alter column organization_id set not null;
alter table public.treasury_accounts alter column organization_id set not null;
alter table public.cash_voucher_books alter column organization_id set not null;
alter table public.cash_vouchers alter column organization_id set not null;
alter table public.number_sequences alter column organization_id set not null;

alter table public.employees alter column organization_id set default public.current_organization_id();
alter table public.entities alter column organization_id set default public.current_organization_id();
alter table public.projects alter column organization_id set default public.current_organization_id();
alter table public.quotations alter column organization_id set default public.current_organization_id();
alter table public.documents alter column organization_id set default public.current_organization_id();
alter table public.treasury_accounts alter column organization_id set default public.current_organization_id();
alter table public.cash_voucher_books alter column organization_id set default public.current_organization_id();
alter table public.cash_vouchers alter column organization_id set default public.current_organization_id();
alter table public.number_sequences alter column organization_id set default public.current_organization_id();

-- Composite identity keys let foreign keys prove that both rows belong to the
-- same tenant instead of merely checking globally unique UUIDs.
alter table public.employees drop constraint if exists employees_organization_id_id_key;
alter table public.employees add constraint employees_organization_id_id_key unique(organization_id,id);
alter table public.entities drop constraint if exists entities_organization_id_id_key;
alter table public.entities add constraint entities_organization_id_id_key unique(organization_id,id);
alter table public.projects drop constraint if exists projects_organization_id_id_key;
alter table public.projects add constraint projects_organization_id_id_key unique(organization_id,id);
alter table public.quotations drop constraint if exists quotations_organization_id_id_key;
alter table public.quotations add constraint quotations_organization_id_id_key unique(organization_id,id);
alter table public.documents drop constraint if exists documents_organization_id_id_key;
alter table public.documents add constraint documents_organization_id_id_key unique(organization_id,id);
alter table public.treasury_accounts drop constraint if exists treasury_accounts_organization_id_id_key;
alter table public.treasury_accounts add constraint treasury_accounts_organization_id_id_key unique(organization_id,id);
alter table public.cash_voucher_books drop constraint if exists cash_voucher_books_organization_id_id_key;
alter table public.cash_voucher_books add constraint cash_voucher_books_organization_id_id_key unique(organization_id,id);
alter table public.cash_vouchers drop constraint if exists cash_vouchers_organization_id_id_key;
alter table public.cash_vouchers add constraint cash_vouchers_organization_id_id_key unique(organization_id,id);

-- Business identifiers become unique within a tenant, not across the SaaS.
alter table public.employees drop constraint if exists employees_employee_no_key;
alter table public.employees drop constraint if exists employees_org_employee_no_key;
alter table public.employees add constraint employees_org_employee_no_key unique(organization_id,employee_no);

alter table public.entities drop constraint if exists entities_entity_code_key;
alter table public.entities drop constraint if exists entities_org_entity_code_key;
alter table public.entities add constraint entities_org_entity_code_key unique(organization_id,entity_code);

alter table public.projects drop constraint if exists projects_project_no_key;
alter table public.projects drop constraint if exists projects_org_project_no_key;
alter table public.projects add constraint projects_org_project_no_key unique(organization_id,project_no);

alter table public.quotations drop constraint if exists quotations_quote_no_key;
alter table public.quotations drop constraint if exists quotations_org_quote_no_key;
alter table public.quotations add constraint quotations_org_quote_no_key unique(organization_id,quote_no);

alter table public.documents drop constraint if exists documents_doc_number_key;
alter table public.documents drop constraint if exists documents_org_doc_number_key;
alter table public.documents add constraint documents_org_doc_number_key unique(organization_id,doc_number);

alter table public.treasury_accounts drop constraint if exists treasury_accounts_account_code_key;
alter table public.treasury_accounts drop constraint if exists treasury_accounts_org_account_code_key;
alter table public.treasury_accounts add constraint treasury_accounts_org_account_code_key unique(organization_id,account_code);

alter table public.cash_voucher_books drop constraint if exists cash_voucher_books_voucher_type_book_no_key;
alter table public.cash_voucher_books drop constraint if exists cash_voucher_books_org_type_book_key;
alter table public.cash_voucher_books add constraint cash_voucher_books_org_type_book_key
  unique(organization_id,voucher_type,book_no);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_voucher_no_key;
alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_voucher_no_key;
alter table public.cash_vouchers add constraint cash_vouchers_org_voucher_no_key
  unique(organization_id,voucher_no);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_voucher_type_book_no_page_no_key;
alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_type_book_page_key;
alter table public.cash_vouchers add constraint cash_vouchers_org_type_book_page_key
  unique(organization_id,voucher_type,book_no,page_no);

alter table public.number_sequences drop constraint if exists number_sequences_pkey;
alter table public.number_sequences
  add constraint number_sequences_pkey primary key(organization_id,doc_type,year);

-- Same-tenant relational integrity for the Wave 1 graph.
alter table public.projects drop constraint if exists projects_org_entity_fk;
alter table public.projects add constraint projects_org_entity_fk
  foreign key(organization_id,entity_id)
  references public.entities(organization_id,id);

alter table public.projects drop constraint if exists projects_org_originator_fk;
alter table public.projects add constraint projects_org_originator_fk
  foreign key(organization_id,originator_id)
  references public.employees(organization_id,id);

alter table public.projects drop constraint if exists projects_org_supervisor_fk;
alter table public.projects add constraint projects_org_supervisor_fk
  foreign key(organization_id,supervisor_id)
  references public.employees(organization_id,id);

alter table public.projects drop constraint if exists projects_org_quotation_fk;
alter table public.projects add constraint projects_org_quotation_fk
  foreign key(organization_id,quotation_id)
  references public.quotations(organization_id,id);

alter table public.quotations drop constraint if exists quotations_org_entity_fk;
alter table public.quotations add constraint quotations_org_entity_fk
  foreign key(organization_id,entity_id)
  references public.entities(organization_id,id);

alter table public.quotations drop constraint if exists quotations_org_project_fk;
alter table public.quotations add constraint quotations_org_project_fk
  foreign key(organization_id,project_id)
  references public.projects(organization_id,id);

alter table public.quotations drop constraint if exists quotations_org_signatory_fk;
alter table public.quotations add constraint quotations_org_signatory_fk
  foreign key(organization_id,arkan_signatory_employee_id)
  references public.employees(organization_id,id);

alter table public.documents drop constraint if exists documents_org_employee_fk;
alter table public.documents add constraint documents_org_employee_fk
  foreign key(organization_id,employee_id)
  references public.employees(organization_id,id);

alter table public.documents drop constraint if exists documents_org_project_fk;
alter table public.documents add constraint documents_org_project_fk
  foreign key(organization_id,project_id)
  references public.projects(organization_id,id);

alter table public.documents drop constraint if exists documents_org_issuer_employee_fk;
alter table public.documents add constraint documents_org_issuer_employee_fk
  foreign key(organization_id,issuer_employee_id)
  references public.employees(organization_id,id);

alter table public.documents drop constraint if exists documents_org_signatory_employee_fk;
alter table public.documents add constraint documents_org_signatory_employee_fk
  foreign key(organization_id,signatory_employee_id)
  references public.employees(organization_id,id);

alter table public.treasury_accounts drop constraint if exists treasury_accounts_org_entity_fk;
alter table public.treasury_accounts add constraint treasury_accounts_org_entity_fk
  foreign key(organization_id,entity_id)
  references public.entities(organization_id,id);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_book_fk;
alter table public.cash_vouchers add constraint cash_vouchers_org_book_fk
  foreign key(organization_id,book_id)
  references public.cash_voucher_books(organization_id,id);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_account_fk;
alter table public.cash_vouchers add constraint cash_vouchers_org_account_fk
  foreign key(organization_id,account_id)
  references public.treasury_accounts(organization_id,id);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_project_fk;
alter table public.cash_vouchers add constraint cash_vouchers_org_project_fk
  foreign key(organization_id,project_id)
  references public.projects(organization_id,id);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_issuer_employee_fk;
alter table public.cash_vouchers add constraint cash_vouchers_org_issuer_employee_fk
  foreign key(organization_id,issuer_employee_id)
  references public.employees(organization_id,id);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_approved_employee_fk;
alter table public.cash_vouchers add constraint cash_vouchers_org_approved_employee_fk
  foreign key(organization_id,approved_by_employee_id)
  references public.employees(organization_id,id);

alter table public.cash_vouchers drop constraint if exists cash_vouchers_org_accountant_employee_fk;
alter table public.cash_vouchers add constraint cash_vouchers_org_accountant_employee_fk
  foreign key(organization_id,accountant_employee_id)
  references public.employees(organization_id,id);

create index if not exists idx_employees_organization on public.employees(organization_id);
create index if not exists idx_entities_organization on public.entities(organization_id);
create index if not exists idx_projects_organization on public.projects(organization_id);
create index if not exists idx_quotations_organization on public.quotations(organization_id);
create index if not exists idx_documents_organization on public.documents(organization_id);
create index if not exists idx_treasury_accounts_organization on public.treasury_accounts(organization_id);
create index if not exists idx_cash_voucher_books_organization on public.cash_voucher_books(organization_id);
create index if not exists idx_cash_vouchers_organization on public.cash_vouchers(organization_id);
create index if not exists idx_number_sequences_organization on public.number_sequences(organization_id);

-- Restrictive RLS boundaries: old capability policies continue to decide what
-- a member can do; this layer decides whose data can ever be considered.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('employees','hr'),
      ('entities','core'),
      ('projects','projects'),
      ('quotations','projects'),
      ('documents','core'),
      ('treasury_accounts','finance_ops'),
      ('cash_voucher_books','finance_ops'),
      ('cash_vouchers','finance_ops'),
      ('number_sequences','core')
    ) as x(table_name,module_key)
  loop
    execute format('alter table public.%I enable row level security',r.table_name);
    execute format('drop policy if exists tenant_boundary on public.%I',r.table_name);
    execute format(
      'create policy tenant_boundary on public.%I as restrictive for all to authenticated using (private.has_tenant_data_access(organization_id,%L)) with check (private.has_tenant_data_access(organization_id,%L))',
      r.table_name,r.module_key,r.module_key
    );
  end loop;
end $$;

-- Numbering must be tenant scoped and keep Arkan's current ARK-* format.
create or replace function private.next_document_number_core(
  p_organization_id uuid,
  p_doc_type text,
  p_prefix text default null::text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_year integer := extract(year from current_date)::int;
  v_doc_prefix text := coalesce(p_prefix, upper(left(p_doc_type,3)));
  v_org_prefix text;
  v_num integer;
begin
  if p_organization_id is null
     or p_organization_id<>private.resolve_current_organization_id()
     or not private.has_tenant_data_access(p_organization_id,'core') then
    raise exception 'active organization is required'
      using errcode='42501';
  end if;

  select nullif(trim(s.document_prefix),'')
    into v_org_prefix
  from public.organization_settings s
  where s.organization_id=p_organization_id;

  v_org_prefix := coalesce(v_org_prefix,'ORG');

  insert into public.number_sequences(
    organization_id,doc_type,year,prefix,last_number
  )
  values (p_organization_id,p_doc_type,v_year,v_doc_prefix,1)
  on conflict (organization_id,doc_type,year)
  do update set
    last_number=public.number_sequences.last_number+1,
    prefix=excluded.prefix
  returning last_number,prefix into v_num,v_doc_prefix;

  return v_org_prefix || '-' || v_doc_prefix || '-' || v_year || '-' || lpad(v_num::text,4,'0');
end;
$$;

revoke all on function private.next_document_number_core(uuid,text,text)
from public,anon,authenticated;
grant execute on function private.next_document_number_core(uuid,text,text)
to authenticated,service_role;

create or replace function public.next_document_number(
  p_doc_type text,
  p_prefix text default null::text
)
returns text
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.next_document_number_core(
    private.resolve_current_organization_id(),
    p_doc_type,
    p_prefix
  );
$$;

revoke all on function public.next_document_number(text,text)
from public,anon;
grant execute on function public.next_document_number(text,text)
to authenticated;

commit;
