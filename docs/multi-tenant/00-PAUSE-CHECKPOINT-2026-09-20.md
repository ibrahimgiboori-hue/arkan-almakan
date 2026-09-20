# Multi-Tenant Commercialization Checkpoint

Date: 2026-09-20
Status: PAUSED BY OWNER DUE TO BUDGET / CASH-FLOW CONSTRAINT
Resume instruction: Continue from this checkpoint. Do not restart discovery from zero.

## Production safety status
- GitHub production branch: main
- Vercel production project: arkan-almakan
- Production Supabase project: vkpbriueztwlxmqndphj
- Production has NOT received the multi-tenant migrations.
- Existing production behavior remains unchanged.

## Development branch
- GitHub branch: multi-tenant-foundation
- Purpose: all multi-tenant productization work
- Do not merge into main until the migration gates below pass.

## Disposable test database
- Supabase project: arkan-al-makan-dev
- Project ref: qqyoqshbyblrtzqxkfye
- This old dev project was restored and repurposed as a disposable multi-tenant laboratory.
- Old prototype tables were removed.
- The new tenant foundation and Wave 1 migrations were applied here only.

## Commercial/product framing completed
Created:
- docs/multi-tenant/01-customer-demand-matrix.md
- docs/multi-tenant/02-multi-tenant-roadmap.md
- docs/multi-tenant/03-current-architecture-audit.md

Roadmap contains 160 concrete steps covering:
- product/customer demand
- tenant domain model
- database isolation
- RLS and authorization
- application context
- module productization
- Captain/AI
- migration validation
- second-tenant proof
- operational readiness

## Tenant architecture implemented
Foundation includes:
- organizations
- organization_memberships
- platform_modules
- organization_modules
- organization_settings
- organization_feature_flags
- private.platform_admins
- tenant context resolver
- platform admin separation
- active organization context
- organization module entitlements
- tenant-aware settings
- organization-scoped numbering prefix

## Application-side implementation completed
Added:
- lib/core/tenant-context.js
- lib/tenant-context.js
- tenant-aware Supabase fetch header: x-organization-id
- dashboard bootstrap with legacy fallback
- tenant-aware dashboard session
- organization switcher
- module entitlement intersection with user permissions
- fullAdmin no longer bypasses disabled tenant modules
- legacy production mode continues to work while production lacks tenant tables

## Tenant governance implemented
- Organization creation restricted to platform admins.
- Owner/admin membership rules.
- Admin cannot promote to Owner.
- Last active Owner cannot be revoked/demoted.
- Tenant administration writes are bound to the active organization.
- Tenant data access requires:
  1. active authenticated membership
  2. requested organization = active organization
  3. Core enabled
  4. target module enabled when applicable

## Wave 1 tenantized roots implemented in dev
Representative/current migration covers:
- employees
- entities
- projects
- quotations
- documents
- treasury_accounts
- cash_voucher_books
- cash_vouchers
- number_sequences

Behavior implemented:
- organization_id ownership
- backfill to Arkan tenant #1
- tenant-scoped business unique keys
- same-tenant composite foreign keys
- restrictive tenant RLS boundary layered over old capability policies
- module-aware visibility
- tenant-scoped document numbering
- Arkan keeps ARK prefix
- other tenants can use their own prefix

## Important migration finding resolved
A recursion defect was discovered and fixed:
- current_organization_id() originally read organization_memberships under RLS
- membership RLS also depended on current_organization_id()
- this caused stack recursion
- resolution moved current tenant lookup to private.resolve_current_organization_id() with explicit auth.uid() verification and controlled SECURITY DEFINER execution

## Numbering security hardening
- public.next_document_number is now SECURITY INVOKER
- privileged mutation logic moved to private.next_document_number_core
- private core validates the active tenant before sequence mutation
- no public elevated RPC should be used for numbering

## Automated guards added
- config/tenant-table-manifest.json
- scripts/multi-tenant-architecture-audit.mjs
- npm script: multi-tenant:audit
- tenant architecture guard runs in prebuild
- all 178 production tables were classified into tenant/global/legacy categories

Tests added:
- tests/tenant-context.test.mjs
- tests/dashboard-tenant-session.test.mjs
- tests/tenant-module-access-ui.test.mjs
- supabase/tests/multi_tenant_foundation_phase1.sql
- supabase/tests/organization_membership_governance.sql
- supabase/tests/multi_tenant_wave1_core_roots.sql

## Verified adversarial test results
Wave 1 isolation test: 12/12 passed.

Confirmed:
- default context resolves tenant A
- tenant A sees only tenant A employees
- tenant B sees only tenant B employees
- tenant B sees only tenant B projects
- active tenant A cannot write tenant B data
- active tenant A cannot edit tenant B settings
- same employee number may exist in different tenants
- same project number may exist in different tenants
- cross-tenant FK references are rejected
- Arkan numbering keeps ARK prefix
- tenant B has an independent numbering prefix/sequence
- disabling Projects for tenant B hides Projects even from the Owner

## Supabase Advisor status
Security:
- tenant foundation itself passed RLS/security checks after hardening
- public elevated numbering RPC warning was addressed by moving privileged work into private schema
- leaked-password protection remains a project Auth setting warning, not a multi-tenant schema defect

Performance:
- tenant composite FK indexes were added for Wave 1
- broader production schema optimization remains a later task

## Vercel status
- Vercel production remains untouched.
- Preview builds on multi-tenant-foundation were working, but owner reported Vercel invoice/cash-flow constraint.
- Decision: stop depending on Vercel for active development until budget is available.
- Do NOT intentionally trigger unnecessary Vercel preview deployments during the pause.

## Lovable handoff status
Owner chose Lovable as the preferred temporary build/preview environment.
Lovable workspace:
- Ibrahim's Lovable
- plan: free
- workspace id: 2920dbd0b986373dda83

Existing old projects:
- Arkan UI Lab
- Rukan Admin

Important:
- These are old UI experiments, not the current production app.
- Do not overwrite either blindly.

GitHub connector status:
- Lovable GitHub connector was NOT connected yet.
- Connection page supplied:
  https://lovable.dev/dashboard?connectors
- Required user action before resume:
  Connect GitHub API inside Lovable.

## Exact resume point
When owner returns and says to continue:

1. Verify Lovable GitHub connector is connected.
2. Prefer keeping GitHub repository as the canonical code source.
3. Do NOT rebuild Arkan from scratch in Lovable.
4. Decide the safest Lovable path to work from the current GitHub branch multi-tenant-foundation.
5. Keep arkan-al-makan-dev Supabase as the disposable database.
6. Keep Vercel production/main isolated.
7. Re-run:
   - tenant tests
   - architecture audit
   - Supabase security advisor
8. Continue tenantization in waves, not all 178 tables at once.
9. Next recommended wave: HR operational roots and their child graphs, then Projects, then Finance/Procurement/Inventory.
10. Before each wave, inspect dependent functions/RPCs, unique constraints, cross-table FKs, views, and storage paths.

## Resume phrase
Owner may simply say:
"واصل من نقطة الـMulti-Tenant"

That should mean: use this checkpoint and continue from the exact state above.
