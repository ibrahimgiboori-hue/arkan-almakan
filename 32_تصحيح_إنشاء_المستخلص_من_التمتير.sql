-- إصلاح إنشاء المستخلص من التمتير: عمود amount في claim_lines محسوب تلقائياً
-- ولا يجوز إرسال قيمة صريحة إليه عند الإدراج.

create or replace function public.create_claim_from_measurements(p_project uuid, p_measurement_ids uuid[])
returns table(claim_id uuid, claim_no text, period_from date, period_to date, gross_amount numeric, measurements_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_project projects;
  v_count integer;
  v_bad integer;
  v_from date;
  v_to date;
  v_gross numeric(14,2);
  v_seq integer;
  v_no text;
  v_claim uuid;
  v_prev_cum numeric(14,2);
  v_retention numeric(14,2);
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if p_project is null then raise exception 'المشروع مطلوب'; end if;
  if p_measurement_ids is null or cardinality(p_measurement_ids)=0 then raise exception 'اختر تمتيراً واحداً على الأقل'; end if;

  select * into v_project from projects where id=p_project;
  if v_project.id is null then raise exception 'المشروع غير موجود'; end if;

  perform 1 from item_measurements m where m.id=any(p_measurement_ids) for update;

  select count(*) into v_count from item_measurements m where m.id=any(p_measurement_ids);
  if v_count <> cardinality(p_measurement_ids) then raise exception 'بعض التمتيرات المحددة غير موجودة'; end if;

  select count(*) into v_bad
  from item_measurements m
  where m.id=any(p_measurement_ids)
    and (m.project_id<>p_project or m.status<>'available' or m.claim_id is not null or m.period_from is null);
  if v_bad>0 then raise exception 'بعض التمتيرات غير متاحة أو لم تكتمل فترة قياسها'; end if;

  select min(m.period_from), max(m.period_to), round(sum(m.amount),2)
  into v_from,v_to,v_gross
  from item_measurements m where m.id=any(p_measurement_ids);

  select coalesce(max(pc.seq_no),0)+1,
         round(coalesce(sum(pc.gross_amount) filter(where pc.status<>'rejected'),0),2)
  into v_seq,v_prev_cum
  from progress_claims pc where pc.project_id=p_project;

  v_no := next_document_number('CLAIM','CLM');
  v_retention := round(v_gross*coalesce(v_project.retention_pct,0),2);

  insert into progress_claims(
    project_id,claim_no,seq_no,period_from,period_to,measurement_date,
    gross_amount,prev_cumulative,retention_amount,vat_rate,status,
    created_by,measurement_recorded_by_user_id
  ) values(
    p_project,v_no,v_seq,v_from,v_to,v_to,
    v_gross,v_prev_cum,v_retention,coalesce(v_project.vat_rate,0.15),'draft',
    auth.uid(),auth.uid()
  ) returning id into v_claim;

  -- amount = round(qty_this * unit_price, 2) is GENERATED ALWAYS.
  insert into claim_lines(
    claim_id,project_item_id,qty_previous,qty_this,unit_price,
    measurement_id,measurement_no_snapshot,measurement_period_from,measurement_period_to,
    description_snapshot,unit_snapshot
  )
  select
    v_claim,m.project_item_id,
    coalesce((select sum(pm.qty_measured)
              from item_measurements pm
              where pm.project_item_id=m.project_item_id
                and pm.measurement_no<m.measurement_no
                and pm.status<>'cancelled'),0),
    m.qty_measured,m.unit_price,
    m.id,m.measurement_no,m.period_from,m.period_to,
    pi.description_ar,coalesce(m.unit_snapshot,pi.unit)
  from item_measurements m
  join project_items pi on pi.id=m.project_item_id
  where m.id=any(p_measurement_ids)
  order by m.period_to,m.project_item_id,m.measurement_no;

  update item_measurements m
  set status='claimed',claim_id=v_claim
  where m.id=any(p_measurement_ids);

  update progress_entries pe
  set claimed=true,claim_id=v_claim
  where pe.id in (
    select m.source_progress_entry_id
    from item_measurements m
    where m.id=any(p_measurement_ids)
      and m.source_progress_entry_id is not null
  );

  return query select v_claim,v_no,v_from,v_to,v_gross,v_count;
end $function$;
