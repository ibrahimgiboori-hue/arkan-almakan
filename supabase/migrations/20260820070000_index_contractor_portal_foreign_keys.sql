-- فهارس المفاتيح الأجنبية لبوابة المقاول، حتى تظل الاستعلامات والحذف المرجعي سريعة مع نمو السجل.

create index if not exists contractor_edit_permits_project_id_idx
  on public.contractor_edit_permits (project_id);

create index if not exists contractor_portal_submissions_project_id_idx
  on public.contractor_portal_submissions (project_id);

create index if not exists contractor_portal_submissions_permit_id_idx
  on public.contractor_portal_submissions (permit_id)
  where permit_id is not null;

create index if not exists contractor_portal_audit_project_id_idx
  on public.contractor_portal_audit (project_id)
  where project_id is not null;

create index if not exists contractor_portal_audit_permit_id_idx
  on public.contractor_portal_audit (permit_id)
  where permit_id is not null;

create index if not exists contractor_portal_audit_submission_id_idx
  on public.contractor_portal_audit (submission_id)
  where submission_id is not null;
