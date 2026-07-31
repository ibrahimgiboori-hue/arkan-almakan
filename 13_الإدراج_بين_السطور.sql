-- ============================================================
--  الملف 13 : الإدراج بين السطور
--  يزيح ما بعد الموضع سطراً واحداً ثم يُدرج — بلا تعارض
-- ============================================================

-- ------------------------------------------------------------
--  ١. إدراج سطر في عرض سعر بعد ترتيب معيّن
-- ------------------------------------------------------------
create or replace function quote_line_insert_after(
  p_quotation uuid,
  p_after_order integer,
  p_kind line_kind default 'item'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if current_app_role() not in ('ceo','hr','accountant') then
    raise exception 'لا تملك صلاحية التعديل';
  end if;

  -- إزاحة على مرحلتين لتفادي تعارض الفهرس الفريد
  update quotation_lines set sort_order = -(sort_order + 1)
    where quotation_id = p_quotation and sort_order > p_after_order;
  update quotation_lines set sort_order = -sort_order
    where quotation_id = p_quotation and sort_order < 0;

  insert into quotation_lines (quotation_id, sort_order, kind, description_ar, unit, qty, unit_price)
  values (p_quotation, p_after_order + 1, p_kind,
          case when p_kind = 'title' then 'عنوان قسم' else '' end,
          case when p_kind = 'item' then 'م2' else null end, 1, 0)
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------
--  ٢. إدراج بند في مشروع بعد ترتيب معيّن
-- ------------------------------------------------------------
create or replace function project_item_insert_after(
  p_project uuid,
  p_after_order integer,
  p_kind line_kind default 'item'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if current_app_role() not in ('ceo','hr','accountant') then
    raise exception 'لا تملك صلاحية التعديل';
  end if;

  update project_items set sort_order = -(sort_order + 1)
    where project_id = p_project and sort_order > p_after_order;
  update project_items set sort_order = -sort_order
    where project_id = p_project and sort_order < 0;

  insert into project_items (project_id, sort_order, kind, description_ar, unit,
                             contract_qty, sell_price, budget_cost)
  values (p_project, p_after_order + 1, p_kind,
          case when p_kind = 'title' then 'عنوان قسم' else '' end,
          case when p_kind = 'item' then 'م2' else null end, 1, 0, 0)
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------
--  ٣. إعادة ترتيب نظيفة (١، ٢، ٣ …) عند الحاجة
-- ------------------------------------------------------------
create or replace function renumber_quote_lines(p_quotation uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer := 0; r record; i integer := 0;
begin
  update quotation_lines set sort_order = -sort_order where quotation_id = p_quotation;
  for r in select id from quotation_lines where quotation_id = p_quotation
           order by sort_order desc
  loop
    i := i + 1;
    update quotation_lines set sort_order = i where id = r.id;
    v_count := i;
  end loop;
  return v_count;
end $$;

notify pgrst, 'reload schema';

select count(*) as الدوال from information_schema.routines
where routine_name in ('quote_line_insert_after','project_item_insert_after','renumber_quote_lines');
