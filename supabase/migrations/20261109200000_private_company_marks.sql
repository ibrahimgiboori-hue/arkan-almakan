-- Company stamp and CEO signature: a private vault, readable only by whoever may apply them.
-- STATUS: PROPOSED — apply only after the owner approves it.
--
-- Today the stamp and signature images live in the public «brand» bucket: anyone who has (or guesses) the
-- link can download them, and every user who opens a print page receives them. The owner's rule: the
-- electronic stamp is added only by the person who holds that authority.
--
-- 1) New PRIVATE bucket «company-marks» (not public; images only; 2 MB max).
-- 2) Read / upload / replace / delete there only for the primary user or the CEO — the same people who may
--    already change the company identity. Printing a stamped page therefore needs that authority: the app asks
--    for a short-lived signed link, and the database refuses it to everyone else.
-- 3) Nothing is moved automatically. After deploy the CEO re-uploads the stamp and signature once from
--    Settings; the app then stores «company-marks/…» paths and deletes the old public copies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-marks', 'company-marks', false, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_marks_read on storage.objects;
create policy company_marks_read on storage.objects for select to authenticated
  using (bucket_id = 'company-marks' and (public.fn_is_primary_user() or public.current_app_role() = 'ceo'::public.user_role));

drop policy if exists company_marks_insert on storage.objects;
create policy company_marks_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-marks' and (public.fn_is_primary_user() or public.current_app_role() = 'ceo'::public.user_role));

drop policy if exists company_marks_update on storage.objects;
create policy company_marks_update on storage.objects for update to authenticated
  using (bucket_id = 'company-marks' and (public.fn_is_primary_user() or public.current_app_role() = 'ceo'::public.user_role))
  with check (bucket_id = 'company-marks' and (public.fn_is_primary_user() or public.current_app_role() = 'ceo'::public.user_role));

drop policy if exists company_marks_delete on storage.objects;
create policy company_marks_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-marks' and (public.fn_is_primary_user() or public.current_app_role() = 'ceo'::public.user_role));
