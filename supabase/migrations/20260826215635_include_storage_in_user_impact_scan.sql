create or replace function public.admin_user_data_impact(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_count bigint;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  for r in
    select n.nspname as schema_name,
           t.relname as table_name,
           a.attname as column_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join unnest(c.conkey) with ordinality ck(attnum, ord) on true
    join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
    where c.contype = 'f'
      and n.nspname = 'public'
      and c.confrelid in ('public.app_users'::regclass, 'auth.users'::regclass)
      and not (t.relname = 'app_users' and a.attname = 'id')
      and not (t.relname = 'user_permission_bundles' and a.attname = 'user_id')
      and not (t.relname = 'user_permission_overrides' and a.attname = 'user_id')
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.schema_name, r.table_name, r.column_name)
      into v_count using p_user_id;

    if v_count > 0 then
      v_total := v_total + v_count;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'table', r.table_name,
        'column', r.column_name,
        'count', v_count
      ));
    end if;
  end loop;

  select count(*) into v_count
  from storage.objects
  where owner = p_user_id or owner_id = p_user_id::text;

  if v_count > 0 then
    v_total := v_total + v_count;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'table', 'storage.objects',
      'column', 'owner',
      'count', v_count
    ));
  end if;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

revoke all on function public.admin_user_data_impact(uuid) from public;
revoke all on function public.admin_user_data_impact(uuid) from anon;
revoke all on function public.admin_user_data_impact(uuid) from authenticated;
grant execute on function public.admin_user_data_impact(uuid) to service_role;
