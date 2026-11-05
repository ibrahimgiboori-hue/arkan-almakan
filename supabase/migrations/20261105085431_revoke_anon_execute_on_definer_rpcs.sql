-- STATUS: APPLIED to the live database on 2026-11-05 as version 20261105085431 (owner approved).
--   Verified: anon can no longer call e.g. next_document_number / laborer_daily_rate;
--   anon can still call get_public_vacancy / get_public_job_offer / get_public_contract_draft;
--   signed-in users still call the revoked functions.
-- Rollback script: docs/rollback/20261105085431_revoke_anon_execute_on_definer_rpcs.rollback.sql
--
-- Close anonymous (not-signed-in) access to SECURITY DEFINER RPCs.
--
-- Why: the Supabase security advisor reported 90 SECURITY DEFINER functions
-- in `public` that the `anon` role could call over /rest/v1/rpc/*, several of
-- which write data without checking the caller (e.g.
-- activate_due_temporary_replacements, next_document_number) or leak internal
-- data (laborer_daily_rate, fn_next_higher_authority, employee_has_records ...).
--
-- What stays public (needed by pages that work without login):
--   * Candidate portal  /jobs/[token], /careers/[token]:
--       get_public_vacancy, submit_candidate_application_v3
--   * Job offer         /offers/[token]:   get_public_job_offer, respond_to_job_offer
--   * Contract draft    /contracts/[token]: get_public_contract_draft, respond_to_contract_draft
--   * RLS helpers referenced by row policies (must stay callable so anonymous
--     reads keep resolving to "no rows" instead of a permission error):
--       current_app_role, current_employee_id
--
-- Signed-in users keep exactly the access they had: before revoking from
-- PUBLIC we grant EXECUTE explicitly to `authenticated` wherever it already
-- had it (often only through PUBLIC). Trigger functions are not touched
-- (they cannot be called as RPCs and EXECUTE is not checked when a trigger fires).
--
-- Idempotent: re-running finds nothing left to revoke.

do $$
declare
  r record;
  keep_public text[] := array[
    'get_public_vacancy',
    'submit_candidate_application_v3',
    'get_public_job_offer',
    'respond_to_job_offer',
    'get_public_contract_draft',
    'respond_to_contract_draft',
    'current_app_role',
    'current_employee_id'
  ];
begin
  for r in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_had_it
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not (p.proname = any (keep_public))
  loop
    if r.authenticated_had_it then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    execute format('grant execute on function %s to service_role', r.sig);
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end
$$;

-- Advisor: function_search_path_mutable
alter function public.hr_attendance_anchor_minute(numeric, integer, integer, integer) set search_path = public, pg_temp;
alter function public.hr_attendance_identity_key(text, text) set search_path = public, pg_temp;
