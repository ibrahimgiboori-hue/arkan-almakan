-- STATUS: APPLIED to the live database on 2026-11-05 as version 20261105101954 (owner approved).
--   Verified (rolled-back test): a supervisor account is refused writing or overwriting the stamp;
--   the CEO account can. Rollback: restore p_brand_write (for all to authenticated using bucket_id='brand').
--
-- Lock writes on the `brand` storage bucket.
--
-- Before: policy p_brand_write let ANY signed-in user (including contractor
-- portal accounts) upload, overwrite or delete any file in `brand`, which holds
-- the company stamp, the CEO signature, the logo and the letterhead.
--
-- After:
--   * Identity files (everything outside external-payroll/): primary user or the
--     CEO role only — the same people app_settings already lets save these paths
--     (settings page and settings/visual-identity).
--   * external-payroll/<client>/...: client letterheads uploaded from the external
--     payroll screen; same rule as writing hr_external_payroll_batches
--     (primary user or hr.attendance.payroll).
--
-- Reading is unchanged (the bucket is still public so existing prints keep
-- working). Making stamp/signature private needs the print code to switch to
-- signed URLs; that is planned with the governed-images step.

drop policy if exists p_brand_write on storage.objects;

create policy brand_identity_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'brand'
    and coalesce((storage.foldername(name))[1], '') <> 'external-payroll'
    and (public.fn_is_primary_user() or public.current_app_role() = 'ceo'::public.user_role)
  )
  with check (
    bucket_id = 'brand'
    and coalesce((storage.foldername(name))[1], '') <> 'external-payroll'
    and (public.fn_is_primary_user() or public.current_app_role() = 'ceo'::public.user_role)
  );

create policy brand_external_payroll_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'brand'
    and (storage.foldername(name))[1] = 'external-payroll'
    and (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'))
  )
  with check (
    bucket_id = 'brand'
    and (storage.foldername(name))[1] = 'external-payroll'
    and (public.fn_is_primary_user() or public.has_any_capability('hr.attendance.payroll'))
  );
