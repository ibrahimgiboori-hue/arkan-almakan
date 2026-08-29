-- contractor_settlements.net_payable is a generated column.
-- The Financial Clock writer owns the component facts only and reads the generated net back from the table.

create or replace function public.fn_build_period_settlement(
  p_project_id uuid,
  p_contractor_id uuid,
  p_from date,
  p_to date,
  p_basis text default 'item',
  p_penalty numeric default 0,
  p_other numeric default 0,
  p_settlement_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid := p_settlement_id;
  v_existing public.contractor_settlements;
  v_base numeric := 0;
  v_open_adv numeric := 0;
  v_adv_apply numeric := 0;
  v_left numeric := 0;
  v_take numeric := 0;
  adv record;
  oldded record;
  v_case public.financial_cases;
  v_case_id uuid;
  v_next integer;
  v_snapshot jsonb;
  v_contractor_name text;
  v_source_owner uuid;
  v_net numeric;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  select au.role::text into v_role
  from public.app_users au
  where au.id=v_uid and au.is_active=true;
  if v_role is null then raise exception 'حساب المستخدم غير نشط'; end if;

  if not public.has_capability('finance.projects.review','project',p_project_id::text,null) then
    raise exception 'لا تملك صلاحية المراجعة المالية لهذا المشروع.';
  end if;
  if p_from is null or p_to is null or p_to<p_from then
    raise exception 'مدة التسوية غير صحيحة';
  end if;

  if exists(
    select 1
    from public.contractor_settlements s
    where s.project_id=p_project_id
      and s.contractor_id=p_contractor_id
      and s.id is distinct from v_id
      and s.period_from<=p_to
      and s.period_to>=p_from
      and coalesce(s.status::text,'draft') not in('rejected','cancelled')
  ) then
    raise exception 'توجد تسوية أخرى لهذا المقاول تتداخل مع الفترة المطلوبة';
  end if;

  if v_id is not null then
    select * into v_existing
    from public.contractor_settlements
    where id=v_id
    for update;
    if v_existing.id is null then raise exception 'التسوية غير موجودة'; end if;
    if v_existing.project_id is distinct from p_project_id
       or v_existing.contractor_id is distinct from p_contractor_id then
      raise exception 'لا يمكن نقل التسوية إلى مشروع أو مقاول آخر.';
    end if;
    if v_existing.status::text in ('accountant_approved','ceo_approved') then
      raise exception 'التسوية المعتمدة لا يعاد بناؤها مباشرة؛ أعدها للمصدر أو استخدم تصحيحًا محكومًا.';
    end if;
    if v_existing.status::text in ('rejected','cancelled') then
      raise exception 'التسوية الملغاة/المرفوضة لا يعاد استخدامها؛ أنشئ تسوية جديدة.';
    end if;

    update public.contractor_expenses
    set is_settled=false, settlement_id=null
    where settlement_id=v_id;

    for oldded in
      select advance_id,sum(amount) amount
      from public.contractor_advance_deductions
      where settlement_id=v_id
      group by advance_id
    loop
      update public.contractor_advances
      set deducted=greatest(coalesce(deducted,0)-oldded.amount,0),
          is_closed=false
      where id=oldded.advance_id;
    end loop;
    delete from public.contractor_advance_deductions where settlement_id=v_id;
  end if;

  select * into r
  from public.fn_settlement_preview(p_project_id,p_contractor_id,p_from,p_to,p_basis);

  v_base:=coalesce(r.works_amount,0)
        + coalesce(r.reimbursable_amount,0)
        - coalesce(r.charged_amount,0)
        - coalesce(p_penalty,0)
        + coalesce(p_other,0);

  select coalesce(sum(remaining),0) into v_open_adv
  from public.contractor_advances
  where project_id=p_project_id
    and contractor_id=p_contractor_id
    and coalesce(is_closed,false)=false
    and advance_date<=p_to;

  v_adv_apply:=least(v_open_adv,greatest(v_base,0));

  if v_id is null then
    insert into public.contractor_settlements(
      settlement_no,project_id,contractor_id,period_from,period_to,
      works_amount,reimbursable_amount,charged_amount,advances_amount,
      penalty_amount,other_additions,status,created_by
    )
    values(
      public.fn_next_settlement_no(),p_project_id,p_contractor_id,p_from,p_to,
      r.works_amount,r.reimbursable_amount,r.charged_amount,v_adv_apply,
      coalesce(p_penalty,0),coalesce(p_other,0),'draft',v_uid
    )
    returning id,net_payable into v_id,v_net;
  else
    update public.contractor_settlements
    set period_from=p_from,
        period_to=p_to,
        works_amount=r.works_amount,
        reimbursable_amount=r.reimbursable_amount,
        charged_amount=r.charged_amount,
        advances_amount=v_adv_apply,
        penalty_amount=coalesce(p_penalty,0),
        other_additions=coalesce(p_other,0),
        status='draft'
    where id=v_id
    returning net_payable into v_net;
  end if;

  update public.contractor_expenses ce
  set is_settled=true,
      settlement_id=v_id
  where ce.project_id=p_project_id
    and ce.contractor_id=p_contractor_id
    and ce.expense_date between p_from and p_to
    and coalesce(ce.is_settled,false)=false
    and (
      (ce.payer::text='contractor' and ce.charge_to::text in ('owner','arkan'))
      or
      (ce.payer::text in ('arkan_custody','arkan_direct') and ce.charge_to::text='contractor')
    );

  v_left:=v_adv_apply;
  for adv in
    select id,remaining
    from public.contractor_advances
    where project_id=p_project_id
      and contractor_id=p_contractor_id
      and coalesce(is_closed,false)=false
      and advance_date<=p_to
      and remaining>0
    order by advance_date,id
  loop
    exit when v_left<=0;
    v_take:=least(v_left,adv.remaining);
    insert into public.contractor_advance_deductions(settlement_id,advance_id,amount)
    values(v_id,adv.id,v_take);
    update public.contractor_advances
    set deducted=coalesce(deducted,0)+v_take,
        is_closed=(amount-(coalesce(deducted,0)+v_take)<=0)
    where id=adv.id;
    v_left:=v_left-v_take;
  end loop;

  select name_ar into v_contractor_name
  from public.contractors
  where id=p_contractor_id;

  select au.id into v_source_owner
  from public.projects p
  join public.app_users au
    on au.employee_id=p.supervisor_id and au.is_active=true
  where p.id=p_project_id
  order by au.created_at
  limit 1;

  select case_id into v_case_id
  from public.contractor_settlements
  where id=v_id;

  v_snapshot:=private.fn_contractor_settlement_snapshot(v_id);

  if v_case_id is null then
    insert into public.financial_cases(
      source_type,source_ref,source_department,source_label,
      project_id,counterparty_type,counterparty_id,counterparty_name,
      status,current_owner,current_version_no,created_by,source_owner_user_id
    )
    values(
      'contractor_settlement','contractor_settlement:'||v_id::text,
      'projects','تسوية مستحقات مقاول',
      p_project_id,'contractor',p_contractor_id,coalesce(v_contractor_name,'مقاول'),
      'in_review','finance',1,v_uid,v_source_owner
    )
    returning id into v_case_id;

    insert into public.financial_case_versions(
      case_id,version_no,source_snapshot,requested_amount,submitted_by,source_note
    )
    values(
      v_case_id,1,v_snapshot,v_net,v_uid,
      'لقطة من تسوية محددة الفترة؛ التسوية هي سلطة مبلغ الاستحقاق.'
    );

    update public.contractor_settlements
    set case_id=v_case_id
    where id=v_id;

    insert into public.financial_case_events(
      case_id,version_no,event_type,from_status,to_status,
      actor_user_id,actor_role,note,payload,amount
    )
    values(
      v_case_id,1,'settlement_opened',null,'in_review',
      v_uid,v_role,'فتح الساعة المالية من تسوية المقاول',
      jsonb_build_object('settlement_id',v_id,'period_from',p_from,'period_to',p_to),
      v_net
    );
  else
    select * into v_case
    from public.financial_cases
    where id=v_case_id
    for update;

    if v_case.id is null or v_case.source_type<>'contractor_settlement' then
      raise exception 'ربط الساعة المالية لهذه التسوية غير صالح.';
    end if;
    if v_case.status in ('finance_approved','final_approved','paid','closed','cancelled') then
      raise exception 'المعاملة المالية تجاوزت مرحلة التصحيح المباشر.';
    end if;

    v_next:=v_case.current_version_no+1;
    insert into public.financial_case_versions(
      case_id,version_no,source_snapshot,requested_amount,submitted_by,source_note
    )
    values(
      v_case_id,v_next,v_snapshot,v_net,v_uid,
      'إعادة احتساب تسوية قبل الاعتماد النهائي.'
    );

    update public.financial_cases
    set current_version_no=v_next,
        status='in_review',
        current_owner='finance',
        updated_at=now()
    where id=v_case_id;

    insert into public.financial_case_events(
      case_id,version_no,event_type,from_status,to_status,
      actor_user_id,actor_role,note,payload,amount
    )
    values(
      v_case_id,v_next,'settlement_recalculated',v_case.status,'in_review',
      v_uid,v_role,'إعادة احتساب التسوية قبل الاعتماد',
      jsonb_build_object('settlement_id',v_id,'period_from',p_from,'period_to',p_to),
      v_net
    );
  end if;

  return v_id;
end
$$;

revoke execute on function public.fn_build_period_settlement(uuid,uuid,date,date,text,numeric,numeric,uuid) from public, anon;
grant execute on function public.fn_build_period_settlement(uuid,uuid,date,date,text,numeric,numeric,uuid) to authenticated;
