begin;

create index if not exists idx_projects_org_entity
  on public.projects(organization_id,entity_id) where entity_id is not null;
create index if not exists idx_projects_org_originator
  on public.projects(organization_id,originator_id) where originator_id is not null;
create index if not exists idx_projects_org_supervisor
  on public.projects(organization_id,supervisor_id) where supervisor_id is not null;
create index if not exists idx_projects_org_quotation
  on public.projects(organization_id,quotation_id) where quotation_id is not null;

create index if not exists idx_quotations_org_entity
  on public.quotations(organization_id,entity_id) where entity_id is not null;
create index if not exists idx_quotations_org_project
  on public.quotations(organization_id,project_id) where project_id is not null;
create index if not exists idx_quotations_org_signatory
  on public.quotations(organization_id,arkan_signatory_employee_id)
  where arkan_signatory_employee_id is not null;

create index if not exists idx_documents_org_employee
  on public.documents(organization_id,employee_id) where employee_id is not null;
create index if not exists idx_documents_org_project
  on public.documents(organization_id,project_id) where project_id is not null;
create index if not exists idx_documents_org_issuer
  on public.documents(organization_id,issuer_employee_id) where issuer_employee_id is not null;
create index if not exists idx_documents_org_signatory
  on public.documents(organization_id,signatory_employee_id)
  where signatory_employee_id is not null;

create index if not exists idx_treasury_accounts_org_entity
  on public.treasury_accounts(organization_id,entity_id) where entity_id is not null;

create index if not exists idx_cash_vouchers_org_book
  on public.cash_vouchers(organization_id,book_id);
create index if not exists idx_cash_vouchers_org_account
  on public.cash_vouchers(organization_id,account_id);
create index if not exists idx_cash_vouchers_org_project
  on public.cash_vouchers(organization_id,project_id) where project_id is not null;
create index if not exists idx_cash_vouchers_org_issuer
  on public.cash_vouchers(organization_id,issuer_employee_id) where issuer_employee_id is not null;
create index if not exists idx_cash_vouchers_org_approver
  on public.cash_vouchers(organization_id,approved_by_employee_id)
  where approved_by_employee_id is not null;
create index if not exists idx_cash_vouchers_org_accountant
  on public.cash_vouchers(organization_id,accountant_employee_id)
  where accountant_employee_id is not null;

commit;
