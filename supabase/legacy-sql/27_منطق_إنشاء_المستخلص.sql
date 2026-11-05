-- المستخلص ينشأ من الإنجاز المسجل حتى تاريخ قياس محدد.
-- gross_amount = قيمة أعمال المستخلص الحالي.
-- prev_cumulative = مجموع أعمال المستخلصات السابقة للعرض والمراجعة فقط.

alter table progress_claims add column if not exists measurement_date date;
alter table progress_claims add column if not exists measurement_recorded_by_user_id uuid;
alter table progress_claims add column if not exists collect_ref text;
alter table progress_claims add column if not exists collection_recorded_by_user_id uuid;
alter table progress_claims add column if not exists invoice_recorded_by_user_id uuid;

update progress_claims
set measurement_date = coalesce(measurement_date, period_to)
where measurement_date is null;

alter table progress_claims drop constraint if exists progress_claims_period_order_check;
alter table progress_claims add constraint progress_claims_period_order_check
check (period_from is null or period_to is null or period_from <= period_to);

create or replace function calc_claim_vat()
returns trigger
language plpgsql
as $$
declare
  v_rate numeric;
  v_base numeric;
begin
  v_rate := coalesce(new.vat_rate,(select vat_rate from projects where id=new.project_id),0.15);
  new.vat_rate := v_rate;

  v_base := greatest(coalesce(new.gross_amount,0),0);
  new.taxable_base := round(v_base,2);
  new.vat_amount := round(v_base*v_rate,2);
  new.net_payable := round(
      v_base + new.vat_amount
    - coalesce(new.retention_amount,0)
    - coalesce(new.advance_recovery,0)
    - coalesce(new.other_deductions,0)
  ,2);
  return new;
end $$;

create or replace function create_progress_claim(
  p_project uuid,
  p_measurement_date date default current_date
)
returns table (
  claim_id uuid,
  claim_no text,
  period_from date,
  period_to date,
  gross_amount numeric
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_project projects;
  v_prev progress_claims;
  v_from date;
  v_first_execution date;
  v_seq integer;
  v_no text;
  v_claim uuid;
  v_gross numeric(14,2);
  v_prev_cum numeric(14,2);
  v_retention numeric(14,2);
  v_old_unclaimed integer;
  v_entries integer;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول لإنشاء المستخلص'; end if;
  if p_measurement_date is null then raise exception 'تاريخ القياس مطلوب'; end if;
  if p_measurement_date > current_date then raise exception 'تاريخ القياس لا يمكن أن يكون في المستقبل'; end if;

  select * into v_project from projects where id=p_project;
  if v_project.id is null then raise exception 'المشروع غير موجود'; end if;

  select * into v_prev
  from progress_claims
  where project_id=p_project and status<>'rejected'
  order by seq_no desc
  limit 1;

  if v_prev.id is null then
    select min(pe.entry_date) into v_first_execution
    from progress_entries pe
    join project_items pi on pi.id=pe.project_item_id
    where pi.project_id=p_project
      and pe.claimed=false
      and pe.entry_date<=p_measurement_date;

    if v_first_execution is null then raise exception 'لا يوجد إنجاز مسجل حتى تاريخ القياس المحدد'; end if;
    v_from := v_first_execution;
  else
    if p_measurement_date <= coalesce(v_prev.measurement_date,v_prev.period_to) then
      raise exception 'تاريخ القياس يجب أن يكون بعد تاريخ قياس المستخلص السابق';
    end if;
    v_from := coalesce(v_prev.measurement_date,v_prev.period_to)+1;
  end if;

  select count(*) into v_old_unclaimed
  from progress_entries pe
  join project_items pi on pi.id=pe.project_item_id
  where pi.project_id=p_project
    and pe.claimed=false
    and pe.entry_date<v_from;

  if v_old_unclaimed>0 then
    raise exception 'يوجد إنجاز غير مطالب به يسبق بداية الفترة الحالية؛ راجعه قبل إنشاء المستخلص';
  end if;

  select count(*),round(coalesce(sum(pe.qty_done*pi.sell_price),0),2)
  into v_entries,v_gross
  from progress_entries pe
  join project_items pi on pi.id=pe.project_item_id
  where pi.project_id=p_project
    and pe.claimed=false
    and pe.entry_date between v_from and p_measurement_date;

  if v_entries=0 or v_gross<=0 then
    raise exception 'لا يوجد إنجاز غير مطالب به ضمن فترة القياس المحددة';
  end if;

  select coalesce(max(seq_no),0)+1,
         round(coalesce(sum(gross_amount) filter(where status<>'rejected'),0),2)
  into v_seq,v_prev_cum
  from progress_claims
  where project_id=p_project;

  v_no := next_document_number('CLAIM','CLM');
  v_retention := round(v_gross*coalesce(v_project.retention_pct,0),2);

  insert into progress_claims(
    project_id,claim_no,seq_no,period_from,period_to,measurement_date,
    gross_amount,prev_cumulative,retention_amount,vat_rate,status,
    created_by,measurement_recorded_by_user_id
  ) values(
    p_project,v_no,v_seq,v_from,p_measurement_date,p_measurement_date,
    v_gross,v_prev_cum,v_retention,coalesce(v_project.vat_rate,0.15),'draft',
    auth.uid(),auth.uid()
  ) returning id into v_claim;

  insert into claim_lines(claim_id,project_item_id,qty_previous,qty_this,unit_price,amount)
  select
    v_claim,
    pi.id,
    coalesce((
      select sum(cl.qty_this)
      from claim_lines cl
      join progress_claims pc on pc.id=cl.claim_id
      where cl.project_item_id=pi.id
        and pc.status<>'rejected'
        and pc.id<>v_claim
    ),0),
    sum(pe.qty_done),
    pi.sell_price,
    round(sum(pe.qty_done)*pi.sell_price,2)
  from progress_entries pe
  join project_items pi on pi.id=pe.project_item_id
  where pi.project_id=p_project
    and pe.claimed=false
    and pe.entry_date between v_from and p_measurement_date
  group by pi.id,pi.sell_price;

  update progress_entries pe
  set claimed=true,claim_id=v_claim
  from project_items pi
  where pi.id=pe.project_item_id
    and pi.project_id=p_project
    and pe.claimed=false
    and pe.entry_date between v_from and p_measurement_date;

  return query select v_claim,v_no,v_from,p_measurement_date,v_gross;
end $$;

revoke all on function create_progress_claim(uuid,date) from public;
grant execute on function create_progress_claim(uuid,date) to authenticated;
