# Current Architecture Audit — Pre Multi-Tenant

Date: 2026-09-20
Scope: Production Supabase schema read-only inspection + current GitHub/Vercel architecture.

## Executive finding
The current Arkan database is mature and modular, but its authorization model is fundamentally single-organization. The platform already has rich HR, projects, finance, approvals, permissions, attendance, payroll, documents and workflow data, so the correct strategy is evolutionary migration — not a rewrite.

## Confirmed current strengths
- RLS is enabled across the operational tables inspected.
- A capability-based permission engine already exists.
- Project-scoped and employee-scoped authorization helpers already exist.
- Rich audit, approval, workflow and transaction infrastructure already exists.
- HR, attendance, payroll, project operations, quotations, treasury, vouchers and documents are separated into dedicated domains.
- Existing production behavior can be preserved as tenant #1.

## Confirmed multi-tenant gaps

### 1. No universal tenant owner
There is currently no general organization_id / tenant_id column across operational tables.

Examples of root records currently globally scoped:
- employees
- app_users
- projects
- quotations
- documents
- cash_voucher_books
- cash_vouchers
- payroll_runs
- approval_workflows
- treasury_accounts
- permission bundles and assignments

### 2. Global unique constraints
Many identifiers are unique across the whole database today, but should generally become unique per organization.

Confirmed examples:
- employees.employee_no
- projects.project_no
- quotations.quote_no
- documents.doc_number
- cash_vouchers.voucher_no
- cash_voucher_books(voucher_type, book_no)
- payroll_runs.run_month
- advances.request_no
- leave_requests.request_no
- progress_claims.claim_no
- treasury_accounts.account_code
- treasury_movements.movement_no
- approval_workflows.workflow_no
- many other business sequence fields

The migration must change these carefully to composite organization-scoped constraints.

### 3. Current authorization helpers are global
Examples:
- current_app_role() reads app_users by auth.uid() only.
- current_employee_id() reads app_users by auth.uid() only.
- fn_is_primary_user() uses a singleton system_access_settings record.
- has_capability() evaluates global user permission bundles/overrides.
- has_employee_capability() does not currently establish organization context.
- has_project_capability() does not currently establish organization context.

These concepts must evolve to:
user identity -> active organization membership -> tenant role/capability -> resource scope.

### 4. Primary user concept is single-company
system_access_settings currently contains a singleton primary user concept. In a commercial product there must be:
- platform administrator
- organization owner/admin
- organization members
- optional support access

No customer administrator should gain platform-wide privilege.

## Security advisor findings to address before production multi-tenancy

### High priority
- 23 security-definer views were reported by the Supabase advisor.
- 89 public-callable SECURITY DEFINER functions were reported.
- Some functions are exposed through RPC while running with elevated privileges.
- These must be classified as intentional or unsafe, and either:
  - moved to a private schema,
  - changed to SECURITY INVOKER,
  - or have EXECUTE revoked from inappropriate roles and explicit tenant checks added.

### Other findings
- 16 RLS-enabled tables currently have no policies.
- 2 functions have mutable search_path.
- btree_gist is installed in public.
- Multiple permissive policy overlaps exist.
- Duplicate indexes exist on attendance and item_execution.

These findings are not all necessarily exploitable defects, but they are mandatory review items before tenant isolation can be certified.

## Existing architecture that can be reused
The current capability engine is valuable. We should not replace it blindly.

Target model:
1. auth.users = human identity.
2. organizations = customer accounts / tenants.
3. organization_memberships = identity membership in a tenant.
4. membership role + bundle assignments = authorization inside that tenant.
5. active organization context = required for tenant data.
6. existing capabilities continue to express business action permissions.
7. existing project/employee scopes operate inside the active organization only.

## Recommended migration order
1. Add organizations and memberships first.
2. Add Arkan Al-Makan as organization #1.
3. Attach current users to organization #1.
4. Create tenant-context helper functions.
5. Add organization_id to root records.
6. Backfill root records.
7. Add tenant constraints and indexes.
8. Update permission engine.
9. Update RLS root by root.
10. Propagate tenant isolation into child tables and views.
11. Update application context.
12. Create synthetic tenant #2.
13. Attempt deliberate cross-tenant attacks.
14. Only then promote to production.

## Important design decision
Do not put organization_id on every table mechanically.

Use it directly when:
- the table is a tenant root,
- it is frequently queried independently,
- direct RLS enforcement benefits from it,
- it contains sensitive data,
- or joining to resolve tenant ownership would be expensive or fragile.

For tightly owned child tables, tenant ownership can sometimes be derived through a guaranteed parent FK, but the security and performance tradeoff must be reviewed table-by-table.

## No-production-change rule
Until the isolated database branch passes:
- schema migration tests,
- RLS attack tests,
- existing regression checks,
- financial reconciliation checks,
- document/print checks,

production remains unchanged.
