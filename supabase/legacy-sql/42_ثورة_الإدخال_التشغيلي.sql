-- 42_ثورة_الإدخال_التشغيلي.sql
-- إدخال جماعي للعمالة + نقل تاريخي آمن + ربط المقاول بالمشروع مرة واحدة.

alter table public.contractors
  add column if not exists operation_alias text;

alter table public.project_contractors
  add column if not exists tools_charge_to public.charge_to not null default 'contractor';

update public.project_contractors pc
   set tools_charge_to = coalesce(c.tools_charge_to, 'contractor'::public.charge_to)
  from public.contractors c
 where c.id = pc.contractor_id;

create index if not exists ix_contractors_operation_alias
  on public.contractors (lower(operation_alias))
  where operation_alias is not null;

create or replace function public.fn_attach_contractor_to_project(
  p_project_id uuid,
  p_contractor_id uuid,
  p_start_date date default current_date
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text := coalesce(public.current_app_role()::text,'');
  c public.contractors;
  v_id uuid;
  v_basis public.pay_basis;
begin
  if v_role not in ('ceo','hr','accountant','supervisor') then
    raise exception 'غير مصرح بإدارة تشغيل المشروع';
  end if;
  select * into c from public.contractors where id=p_contractor_id and is_active=true;
  if c.id is null then raise exception 'المقاول غير موجود أو غير نشط'; end if;
  if not exists(select 1 from public.projects where id=p_project_id) then raise exception 'المشروع غير موجود'; end if;

  v_basis := case coalesce(c.default_basis,'')
    when 'بالراتب' then 'salary'::public.pay_basis
    when 'بالمتر' then 'piecework'::public.pay_basis
    when 'مقطوعية' then 'piecework'::public.pay_basis
    else 'daily'::public.pay_basis end;

  insert into public.project_contractors(
    project_id,contractor_id,basis,worker_daily,tech_daily,piece_rate,piece_unit,
    transport_charge_to,meals_charge_to,housing_charge_to,tools_charge_to,start_date,is_active
  ) values (
    p_project_id,p_contractor_id,v_basis,c.worker_daily,c.tech_daily,null,null,
    c.transport_charge_to,c.meals_charge_to,c.housing_charge_to,c.tools_charge_to,
    coalesce(p_start_date,current_date),true
  )
  on conflict(project_id,contractor_id) do update
    set is_active=true,
        end_date=null,
        start_date=least(project_contractors.start_date,excluded.start_date),
        worker_daily=coalesce(project_contractors.worker_daily,excluded.worker_daily),
        tech_daily=coalesce(project_contractors.tech_daily,excluded.tech_daily),
        transport_charge_to=coalesce(project_contractors.transport_charge_to,excluded.transport_charge_to),
        meals_charge_to=coalesce(project_contractors.meals_charge_to,excluded.meals_charge_to),
        housing_charge_to=coalesce(project_contractors.housing_charge_to,excluded.housing_charge_to),
        tools_charge_to=coalesce(project_contractors.tools_charge_to,excluded.tools_charge_to)
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.fn_attach_contractor_to_project(uuid,uuid,date) to authenticated;

create or replace function public.fn_move_laborer(
  p_laborer_id uuid,
  p_project_id uuid,
  p_contractor_id uuid,
  p_effective_from date,
  p_labor_class public.labor_class default null,
  p_trade text default null,
  p_pay_basis public.pay_basis default null,
  p_daily_rate numeric default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text := coalesce(public.current_app_role()::text,'');
  l public.laborers;
  pc public.project_contractors;
  v_class public.labor_class;
  v_basis public.pay_basis;
  v_rate numeric;
  v_next date;
  v_id uuid;
  cur public.labor_project_assignments;
begin
  if v_role not in ('ceo','hr','accountant','supervisor') then
    raise exception 'غير مصرح بنقل العمالة';
  end if;
  if p_effective_from is null then raise exception 'تاريخ السريان مطلوب'; end if;
  select * into l from public.laborers where id=p_laborer_id and is_active=true;
  if l.id is null then raise exception 'العامل غير موجود أو غير نشط'; end if;
  perform public.fn_attach_contractor_to_project(p_project_id,p_contractor_id,p_effective_from);
  select * into pc from public.project_contractors where project_id=p_project_id and contractor_id=p_contractor_id;

  v_class := coalesce(p_labor_class,l.labor_class,'worker'::public.labor_class);
  v_basis := coalesce(p_pay_basis,l.pay_basis,'daily'::public.pay_basis);
  v_rate := coalesce(p_daily_rate,
    case when v_class='technician'::public.labor_class then pc.tech_daily else pc.worker_daily end,
    l.daily_rate,
    case when l.monthly_salary is not null and coalesce(l.salary_days,30)>0 then l.monthly_salary/coalesce(l.salary_days,30) end,
    0);

  update public.labor_project_assignments
     set valid_to=p_effective_from-1,
         is_active=false,
         notes=concat_ws(' | ',notes,'أُغلق عند نقل العامل بتاريخ '||p_effective_from::text)
   where laborer_id=p_laborer_id
     and valid_from < p_effective_from
     and (valid_to is null or valid_to >= p_effective_from);

  select min(valid_from) into v_next
    from public.labor_project_assignments
   where laborer_id=p_laborer_id and valid_from>p_effective_from;

  select id into v_id
    from public.labor_project_assignments
   where laborer_id=p_laborer_id
     and project_id=p_project_id
     and contractor_id=p_contractor_id
     and valid_from=p_effective_from
   order by created_at desc limit 1;

  if v_id is null then
    insert into public.labor_project_assignments(
      laborer_id,project_id,contractor_id,valid_from,valid_to,labor_class,trade,pay_basis,daily_rate,source,is_active,notes,created_by
    ) values (
      p_laborer_id,p_project_id,p_contractor_id,p_effective_from,
      case when v_next is null then null else v_next-1 end,
      v_class,coalesce(p_trade,l.trade),v_basis,v_rate,'site_operations',true,p_notes,auth.uid()
    ) returning id into v_id;
  else
    update public.labor_project_assignments
       set valid_to=case when v_next is null then null else v_next-1 end,
           labor_class=v_class,
           trade=coalesce(p_trade,l.trade),
           pay_basis=v_basis,
           daily_rate=v_rate,
           source='site_operations',is_active=true,
           notes=coalesce(p_notes,notes)
     where id=v_id;
  end if;

  select * into cur
    from public.labor_project_assignments x
   where x.laborer_id=p_laborer_id
     and x.valid_from<=current_date
     and (x.valid_to is null or x.valid_to>=current_date)
   order by x.valid_from desc,x.created_at desc limit 1;
  if cur.id is not null then
    update public.laborers
       set project_id=cur.project_id,
           contractor_id=cur.contractor_id,
           labor_class=coalesce(cur.labor_class,labor_class),
           trade=coalesce(cur.trade,trade),
           pay_basis=coalesce(cur.pay_basis,pay_basis),
           daily_rate=case when coalesce(cur.pay_basis,pay_basis)='daily'::public.pay_basis then coalesce(cur.daily_rate,daily_rate) else daily_rate end
     where id=p_laborer_id;
  end if;
  return v_id;
end $$;

grant execute on function public.fn_move_laborer(uuid,uuid,uuid,date,public.labor_class,text,public.pay_basis,numeric,text) to authenticated;

create or replace function public.fn_quick_add_workers(
  p_project_id uuid,
  p_contractor_id uuid,
  p_effective_from date,
  p_names jsonb,
  p_labor_class public.labor_class default 'worker',
  p_trade text default null,
  p_pay_basis public.pay_basis default 'daily',
  p_daily_rate numeric default null,
  p_monthly_salary numeric default null,
  p_salary_days integer default 30,
  p_piece_rate numeric default null,
  p_piece_unit text default 'م2'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text := coalesce(public.current_app_role()::text,'');
  c public.contractors;
  pc public.project_contractors;
  v_name text;
  v_existing public.laborers;
  v_id uuid;
  v_rate numeric;
  v_result jsonb := '[]'::jsonb;
begin
  if v_role not in ('ceo','hr','accountant','supervisor') then
    raise exception 'غير مصرح بإضافة العمالة';
  end if;
  if jsonb_typeof(p_names)<>'array' then raise exception 'قائمة الأسماء غير صحيحة'; end if;
  perform public.fn_attach_contractor_to_project(p_project_id,p_contractor_id,coalesce(p_effective_from,current_date));
  select * into c from public.contractors where id=p_contractor_id;
  select * into pc from public.project_contractors where project_id=p_project_id and contractor_id=p_contractor_id;
  v_rate := coalesce(p_daily_rate,
    case when p_labor_class='technician'::public.labor_class then pc.tech_daily else pc.worker_daily end,
    case when p_labor_class='technician'::public.labor_class then c.tech_daily else c.worker_daily end,
    case when p_pay_basis='salary'::public.pay_basis and p_monthly_salary is not null and coalesce(p_salary_days,30)>0 then p_monthly_salary/coalesce(p_salary_days,30) end,
    0);

  for v_name in select btrim(value) from jsonb_array_elements_text(p_names) where btrim(value)<>'' loop
    v_existing := null;
    select * into v_existing from public.laborers
     where is_active=true and lower(btrim(full_name))=lower(v_name)
     order by created_at desc limit 1;

    if v_existing.id is not null and v_existing.contractor_id is distinct from p_contractor_id then
      v_result := v_result || jsonb_build_array(jsonb_build_object('name',v_name,'status','needs_transfer','laborer_id',v_existing.id));
      continue;
    end if;

    if v_existing.id is null then
      insert into public.laborers(
        full_name,contractor_id,project_id,labor_class,trade,pay_basis,daily_rate,monthly_salary,salary_days,piece_rate,piece_unit,is_active
      ) values (
        v_name,p_contractor_id,p_project_id,p_labor_class,p_trade,p_pay_basis,
        case when p_pay_basis='daily'::public.pay_basis then v_rate else null end,
        case when p_pay_basis='salary'::public.pay_basis then p_monthly_salary else null end,
        coalesce(p_salary_days,30),
        case when p_pay_basis='piecework'::public.pay_basis then p_piece_rate else null end,
        case when p_pay_basis='piecework'::public.pay_basis then p_piece_unit else null end,
        true
      ) returning id into v_id;
      insert into public.labor_project_assignments(
        laborer_id,project_id,contractor_id,valid_from,labor_class,trade,pay_basis,daily_rate,source,is_active,created_by
      ) values (
        v_id,p_project_id,p_contractor_id,coalesce(p_effective_from,current_date),p_labor_class,p_trade,p_pay_basis,v_rate,'quick_add',true,auth.uid()
      );
      v_result := v_result || jsonb_build_array(jsonb_build_object('name',v_name,'status','created','laborer_id',v_id));
    else
      v_id := v_existing.id;
      if not exists(
        select 1 from public.labor_project_assignments x
         where x.laborer_id=v_id and x.project_id=p_project_id and x.contractor_id=p_contractor_id
           and x.valid_from<=coalesce(p_effective_from,current_date)
           and (x.valid_to is null or x.valid_to>=coalesce(p_effective_from,current_date))
      ) then
        insert into public.labor_project_assignments(
          laborer_id,project_id,contractor_id,valid_from,labor_class,trade,pay_basis,daily_rate,source,is_active,created_by
        ) values (
          v_id,p_project_id,p_contractor_id,coalesce(p_effective_from,current_date),
          coalesce(v_existing.labor_class,p_labor_class),coalesce(v_existing.trade,p_trade),coalesce(v_existing.pay_basis,p_pay_basis),
          coalesce(v_existing.daily_rate,v_rate),'quick_add_existing',true,auth.uid()
        );
      end if;
      update public.laborers set project_id=p_project_id,contractor_id=p_contractor_id where id=v_id;
      v_result := v_result || jsonb_build_array(jsonb_build_object('name',v_name,'status','existing','laborer_id',v_id));
    end if;
  end loop;
  return v_result;
end $$;

grant execute on function public.fn_quick_add_workers(uuid,uuid,date,jsonb,public.labor_class,text,public.pay_basis,numeric,numeric,integer,numeric,text) to authenticated;
