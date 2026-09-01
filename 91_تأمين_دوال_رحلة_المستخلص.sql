-- تشديد صلاحيات RPC لرحلة المستخلص.
-- PostgreSQL يمنح EXECUTE إلى PUBLIC افتراضياً، لذلك سحب anon وحده لا يكفي.

revoke execute on function public.fn_submit_progress_claim_for_approval(uuid,text) from public;
revoke execute on function public.record_claim_client_submission(uuid,date,text) from public;
revoke execute on function public.advance_claim(uuid,public.claim_status,text,numeric) from public;
revoke execute on function public.fn_claim_collect_to_treasury(uuid,uuid,date,text) from public;
revoke execute on function public.fn_claim_journey_context(uuid) from public;
revoke execute on function public.record_claim_invoice(uuid,text,date) from public;

grant execute on function public.fn_submit_progress_claim_for_approval(uuid,text) to authenticated;
grant execute on function public.record_claim_client_submission(uuid,date,text) to authenticated;
grant execute on function public.advance_claim(uuid,public.claim_status,text,numeric) to authenticated;
grant execute on function public.fn_claim_collect_to_treasury(uuid,uuid,date,text) to authenticated;
grant execute on function public.fn_claim_journey_context(uuid) to authenticated;
grant execute on function public.record_claim_invoice(uuid,text,date) to authenticated;
