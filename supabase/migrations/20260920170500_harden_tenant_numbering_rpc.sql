begin;

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
