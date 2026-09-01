-- رحلة المستخلص الواحدة: القياس -> الاعتماد الداخلي -> التقديم للعميل -> اعتماد العميل -> التحصيل -> الفاتورة
-- هذا الملف يطابق migration: unify_progress_claim_journey المطبق على Supabase.

alter table public.progress_claims add column if not exists client_submitted_at date;
alter table public.progress_claims add column if not exists client_submission_ref text;
alter table public.progress_claims add column if not exists client_submission_recorded_by uuid;

-- PostgREST لا يتعامل بأمان مع overload يحمل نفس الاسم وعدداً قابلاً للالتباس من المعاملات.
drop function if exists private.fn_approval_start(text,text,uuid,text,uuid,numeric,jsonb,text);

create or replace function public.fn_submit_progress_claim_for_approval(p_claim_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare c public.progress_claims; v_snapshot jsonb; v_project_name text;
begin
 select * into c from public.progress_claims where id=p_claim_id;
 if c.id is null then raise exception 'المستخلص غير موجود'; end if;
 if not public.has_project_capability('projects.claims.submit',c.project_id,c.net_payable) then raise exception 'لا تملك صلاحية إرسال هذا المستخلص'; end if;
 if c.status<>'draft' then raise exception 'يمكن إرسال المستخلصات المسودة فقط للاعتماد الداخلي'; end if;
 select p.name_ar into v_project_name from public.projects p where p.id=c.project_id;
 select jsonb_build_object(
   'claim_id',c.id,'claim_no',c.claim_no,'project_id',c.project_id,'project_name',v_project_name,
   'period_from',c.period_from,'period_to',c.period_to,'gross_amount',c.gross_amount,
   'retention_amount',c.retention_amount,'advance_recovery',c.advance_recovery,'other_deductions',c.other_deductions,
   'vat_amount',c.vat_amount,'net_payable',c.net_payable,
   'lines',coalesce(jsonb_agg(jsonb_build_object('project_item_id',cl.project_item_id,'description',pi.description_ar,'qty_previous',cl.qty_previous,'qty_this',cl.qty_this,'unit_price',cl.unit_price,'amount',cl.amount) order by pi.sort_order) filter(where cl.project_item_id is not null),'[]'::jsonb)
 ) into v_snapshot
 from public.claim_lines cl left join public.project_items pi on pi.id=cl.project_item_id where cl.claim_id=c.id;
 return private.fn_approval_start('progress_claim','progress_claims',c.id,'مستخلص / مقايسة',c.project_id,c.net_payable,v_snapshot,p_note,null,null);
end;$function$;

create or replace function public.record_claim_client_submission(
  p_claim uuid,
  p_submission_date date default current_date,
  p_ref text default null
) returns date
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare v_row public.progress_claims; v_date date:=coalesce(p_submission_date,current_date); v_ref text:=nullif(trim(p_ref),'');
begin
 if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
 select * into v_row from public.progress_claims where id=p_claim for update;
 if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;
 if v_row.status<>'submitted' then raise exception 'لا يمكن تسجيل تقديم العميل قبل اكتمال الاعتماد الداخلي'; end if;
 if not public.has_project_capability('projects.claims.edit',v_row.project_id,v_row.net_payable)
    and not public.has_project_capability('projects.claims.submit',v_row.project_id,v_row.net_payable) then
   raise exception 'لا تملك صلاحية تسجيل تقديم المطالبة للعميل';
 end if;
 update public.progress_claims
 set client_submitted_at=v_date,
     client_submission_ref=coalesce(v_ref,client_submission_ref),
     client_submission_recorded_by=auth.uid()
 where id=p_claim;
 if not exists(select 1 from public.op_attachments where entity_type='claim' and entity_id=p_claim and stage='submitted' and doc_code='cover_letter') then
   insert into public.op_attachments(entity_type,entity_id,stage,doc_code,direction,title,ref_no,notes)
   values('claim',p_claim,'submitted','cover_letter','out','المطالبة المالية',v_ref,'تم توثيق تقديم المطالبة للعميل من رحلة المستخلص');
 end if;
 return v_date;
end;$function$;

create or replace function public.advance_claim(p_claim uuid, p_to claim_status, p_ref text default null, p_amount numeric default null)
returns claim_status
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare v_row public.progress_claims; v_workflow uuid; v_ref text:=nullif(trim(p_ref),'');
begin
 if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
 select * into v_row from public.progress_claims where id=p_claim for update;
 if v_row.id is null then raise exception 'المستخلص غير موجود'; end if;
 if p_to='submitted' then
   v_workflow := public.fn_submit_progress_claim_for_approval(p_claim, null);
   return v_row.status;
 end if;
 if p_to='collected' then raise exception 'التحصيل يُسجل من رحلة المستخلص ويُرحّل آليًا إلى الخزينة'; end if;
 if p_to='rejected' then raise exception 'الرفض الداخلي يتم من دورة الاعتماد مع تبرير'; end if;
 if p_to='invoiced' then raise exception 'استخدم إجراء تسجيل الفاتورة المخصص'; end if;
 if p_to='owner_approved' then
   if v_row.status<>'submitted' then raise exception 'لا يمكن تسجيل اعتماد العميل قبل الاعتماد الداخلي'; end if;
   if v_row.client_submitted_at is null then raise exception 'سجّل تقديم المطالبة للعميل أولًا'; end if;
   if not public.has_project_capability('projects.claims.edit',v_row.project_id,v_row.net_payable) then raise exception 'لا تملك صلاحية تسجيل اعتماد العميل لهذا المستخلص'; end if;
   update public.progress_claims set status='owner_approved',owner_approved_at=current_date,owner_ref=coalesce(v_ref,owner_ref) where id=p_claim;
   if not exists(select 1 from public.op_attachments where entity_type='claim' and entity_id=p_claim and stage='owner_approved' and doc_code='owner_ok') then
     insert into public.op_attachments(entity_type,entity_id,stage,doc_code,direction,title,ref_no,notes)
     values('claim',p_claim,'owner_approved','owner_ok','in','اعتماد الجهة أو محضر المراجعة',v_ref,'تم توثيق اعتماد العميل من رحلة المستخلص');
   end if;
   return 'owner_approved';
 end if;
 raise exception 'حالة غير مدعومة';
end;$function$;

create or replace function public.fn_claim_collect_to_treasury(p_claim_id uuid, p_account_id uuid, p_collection_date date default current_date, p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_uid uuid:=auth.uid();v_claim public.progress_claims;v_acc public.treasury_accounts;v_amount numeric;v_movement uuid;v_project_name text;v_scope_type text;v_scope_key text;v_ref text:=nullif(trim(p_reference),'');
begin
 if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
 select * into v_claim from public.progress_claims where id=p_claim_id for update;
 if v_claim.id is null then raise exception 'المستخلص غير موجود'; end if;
 v_amount:=coalesce(v_claim.net_payable,0); v_scope_type:=case when v_claim.project_id is null then 'all' else 'project' end; v_scope_key:=v_claim.project_id::text;
 if not public.has_capability('finance.treasury.collect',v_scope_type,v_scope_key,v_amount) then raise exception 'لا تملك صلاحية تسجيل هذا التحصيل'; end if;
 if v_claim.collected_at is not null or v_claim.status='collected' then raise exception 'تم تسجيل تحصيل هذا المستخلص سابقًا'; end if;
 if v_claim.status not in ('owner_approved','invoiced') then raise exception 'المستخلص ليس جاهزًا للتحصيل'; end if;
 select * into v_acc from public.treasury_accounts where id=p_account_id and is_active=true for update;
 if v_acc.id is null then raise exception 'حساب الخزينة غير موجود أو غير نشط'; end if;
 if v_amount<=0 then raise exception 'قيمة التحصيل غير صحيحة'; end if;
 update public.progress_claims set status='collected',collected_at=coalesce(p_collection_date,current_date),collected_amount=v_amount,collect_ref=coalesce(v_ref,collect_ref),collection_recorded_by_user_id=v_uid where id=p_claim_id;
 update public.projects set advance_recovered=coalesce(advance_recovered,0)+coalesce(v_claim.advance_recovery,0) where id=v_claim.project_id;
 select p.name_ar into v_project_name from public.projects p where p.id=v_claim.project_id;
 insert into public.treasury_movements(account_id,movement_date,direction,amount,movement_type,source_type,source_id,source_ref,project_id,counterparty_type,counterparty_name,reference,recorded_by)
 values(p_account_id,coalesce(p_collection_date,current_date),'inflow',v_amount,'claim_collection','progress_claim',p_claim_id,v_claim.claim_no,v_claim.project_id,'client',v_project_name,v_ref,v_uid)
 returning id into v_movement;
 if not exists(select 1 from public.op_attachments where entity_type='claim' and entity_id=p_claim_id and stage='collected' and doc_code='payment_proof') then
   insert into public.op_attachments(entity_type,entity_id,stage,doc_code,direction,title,ref_no,notes)
   values('claim',p_claim_id,'collected','payment_proof','in','إشعار التحويل أو سند القبض',v_ref,'أُنشئ تلقائيًا عند تسجيل التحصيل من رحلة المستخلص');
 end if;
 if not exists(select 1 from public.op_attachments where entity_type='claim' and entity_id=p_claim_id and stage='collected' and doc_code='inv_request') then
   insert into public.op_attachments(entity_type,entity_id,stage,doc_code,direction,title,notes)
   values('claim',p_claim_id,'collected','inv_request','out','مذكرة داخلية لطلب إصدار فاتورة ضريبية','أُنشئت تلقائيًا بعد التحصيل');
 end if;
 return v_movement;
end;$function$;

create or replace function public.fn_claim_journey_context(p_claim_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare c public.progress_claims; w public.approval_workflows; v_approval jsonb; v_accounts jsonb:='[]'::jsonb; v_can_collect boolean:=false; v_can_submit boolean:=false; v_can_edit boolean:=false;
begin
 if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
 select * into c from public.progress_claims where id=p_claim_id;
 if c.id is null then raise exception 'المستخلص غير موجود'; end if;
 v_can_submit:=public.has_project_capability('projects.claims.submit',c.project_id,c.net_payable);
 v_can_edit:=public.has_project_capability('projects.claims.edit',c.project_id,c.net_payable);
 v_can_collect:=public.has_capability('finance.treasury.collect','project',c.project_id::text,c.net_payable) or public.has_capability('finance.treasury.collect','all',null,c.net_payable);
 select * into w from public.approval_workflows where transaction_type='progress_claim' and source_table='progress_claims' and source_id=c.id order by created_at desc limit 1;
 if w.id is not null then
   begin v_approval:=public.fn_approval_get(w.id); exception when others then v_approval:=jsonb_build_object('workflow',to_jsonb(w),'can_act',false,'can_route',false,'steps','[]'::jsonb,'events','[]'::jsonb); end;
 end if;
 if v_can_collect then
   select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name_ar',b.name_ar,'account_type',b.account_type,'bank_name',b.bank_name,'current_balance',b.current_balance) order by b.name_ar),'[]'::jsonb)
   into v_accounts from public.v_treasury_balances b where b.is_active=true;
 end if;
 return jsonb_build_object('approval',v_approval,'can_submit',v_can_submit,'can_edit',v_can_edit,'can_collect',v_can_collect,'treasury_accounts',v_accounts);
end;$function$;

-- لا تُترك RPCs الخاصة بالرحلة مفتوحة لدور anon؛ التنفيذ للمستخدم المسجل فقط.
revoke execute on function public.fn_submit_progress_claim_for_approval(uuid,text) from anon;
revoke execute on function public.record_claim_client_submission(uuid,date,text) from anon;
revoke execute on function public.advance_claim(uuid,public.claim_status,text,numeric) from anon;
revoke execute on function public.fn_claim_collect_to_treasury(uuid,uuid,date,text) from anon;
revoke execute on function public.fn_claim_journey_context(uuid) from anon;
revoke execute on function public.record_claim_invoice(uuid,text,date) from anon;

grant execute on function public.fn_submit_progress_claim_for_approval(uuid,text) to authenticated;
grant execute on function public.record_claim_client_submission(uuid,date,text) to authenticated;
grant execute on function public.advance_claim(uuid,public.claim_status,text,numeric) to authenticated;
grant execute on function public.fn_claim_collect_to_treasury(uuid,uuid,date,text) to authenticated;
grant execute on function public.fn_claim_journey_context(uuid) to authenticated;
grant execute on function public.record_claim_invoice(uuid,text,date) to authenticated;
