-- Finance is a destination, not a hard-coded person.
-- The accountable user must be resolved dynamically from the organization/capability resolver
-- unless an administrator explicitly configures an exclusive target later.
update public.procedure_destinations
set default_target_user_id = null,
    default_target_exclusive = false,
    updated_at = now()
where destination_key = 'finance';
