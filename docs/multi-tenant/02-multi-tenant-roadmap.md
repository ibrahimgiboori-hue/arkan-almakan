# Arkan Multi-Tenant Foundation — 70-Step Roadmap

## Guardrails
- Production remains untouched until isolation tests pass.
- Arkan Al-Makan becomes tenant #1 without losing existing behavior.
- No destructive bulk migration without a verified rollback.
- Tenant isolation is enforced in PostgreSQL RLS, not only in frontend filters.
- Authorization is organization membership + capability + scope.
- Never trust user-editable metadata for authorization.
- Every exposed tenant-owned table must have RLS.
- Every sensitive tenant write must be auditable.
- Shared/global reference data must be explicitly marked as platform-owned.

## Phase A — Product and domain framing
1. Freeze the current production behavior as the baseline.
2. Inventory all current modules and submodules.
3. Inventory all current tables, views, functions and storage buckets.
4. Map each table to Core / HR / Projects / Finance / Procurement / Inventory / Documents / Workflow.
5. List all hard-coded assumptions specific to Arkan Al-Makan.
6. Build the customer-demand matrix for HR.
7. Build the customer-demand matrix for finance operations.
8. Build the customer-demand matrix for projects.
9. Build the customer-demand matrix for procurement/inventory.
10. Build the customer-demand matrix for general administration.
11. Classify each feature as Core / Module / Optional / Industry / Custom.
12. Identify reusable engines hidden inside existing features.
13. Define the smallest sellable Core.
14. Define initial commercial module packages.
15. Define what remains explicitly out of scope for v1.

## Phase B — Tenant domain model
16. Create the organizations domain model.
17. Create organization statuses and lifecycle states.
18. Create organization memberships.
19. Define organization-level roles.
20. Define organization-level capability assignments.
21. Define branch ownership under organizations.
22. Define module subscriptions / entitlements per organization.
23. Define organization settings and feature flags.
24. Define organization branding and document identity.
25. Define organization numbering/sequence policies.
26. Define organization locale, timezone and currency settings.
27. Define organization fiscal/settings boundaries.
28. Define global platform admin vs tenant admin separation.
29. Define cross-organization support access rules.
30. Define safe impersonation/support-session rules with audit.

## Phase C — Database isolation strategy
31. Identify every tenant-owned table.
32. Identify every global/reference table.
33. Add organization_id to root tenant-owned tables.
34. Propagate organization_id to high-risk child tables where direct RLS needs it.
35. Backfill organization_id for all existing Arkan records using tenant #1.
36. Add NOT NULL only after complete backfill verification.
37. Add foreign keys from organization_id to organizations.
38. Add tenant-aware indexes.
39. Convert unique constraints to tenant-scoped uniqueness where necessary.
40. Make document numbers tenant-scoped.
41. Make employee numbers tenant-scoped.
42. Make voucher numbers tenant-scoped.
43. Make quote/reference numbers tenant-scoped.
44. Make project codes tenant-scoped.
45. Audit polymorphic references and attachment ownership.
46. Audit views for security_invoker behavior or restrict exposure.
47. Audit functions for SECURITY DEFINER risks.
48. Audit storage object paths for tenant prefixes.
49. Create tenant-aware helper functions for RLS.
50. Ensure helper functions cannot be abused to cross tenant boundaries.

## Phase D — Row Level Security and authorization
51. Create organization membership lookup policies.
52. Require active membership for tenant data SELECT.
53. Require active membership plus capability for INSERT.
54. Require active membership plus capability for UPDATE.
55. Require active membership plus capability for DELETE.
56. Add WITH CHECK to all UPDATE/INSERT policies where required.
57. Eliminate policies that authorize merely by authenticated role.
58. Ensure project-scoped access also checks organization ownership.
59. Ensure employee-scoped access also checks organization ownership.
60. Ensure finance access also checks organization ownership.
61. Ensure workflow approvals cannot point to another tenant's entities.
62. Ensure attachments cannot be linked across tenants.
63. Ensure notification recipients belong to the same organization where appropriate.
64. Ensure audit events capture organization_id.
65. Create explicit platform-admin exceptions only where necessary.
66. Test malicious ID substitution across organizations.
67. Test URL manipulation across organizations.
68. Test API query manipulation across organizations.
69. Test RPC/function calls for tenant leakage.
70. Run Supabase security advisors and fix all relevant findings.

## Phase E — Application architecture
71. Introduce a server-side organization context resolver.
72. Resolve active organization from authenticated membership, never from arbitrary client input alone.
73. Add organization switcher for users with multiple memberships.
74. Add organization-aware navigation.
75. Add module-aware navigation from entitlements.
76. Add organization-aware data access helpers.
77. Replace global settings reads with organization settings.
78. Replace global branding reads with organization branding.
79. Replace global sequences with organization sequences.
80. Remove hard-coded Arkan Al-Makan identity from reusable UI.
81. Preserve Arkan identity inside tenant #1 configuration.
82. Add onboarding wizard for a new organization.
83. Add business-type presets.
84. Add module activation/deactivation.
85. Add branch setup.
86. Add user invitation and membership assignment.
87. Add role/bundle assignment per organization.
88. Add organization-level audit viewer.
89. Add organization-level export/backup capability design.
90. Add organization deletion/offboarding policy design.

## Phase F — Module productization
91. Convert HR rules to configurable organization policies.
92. Convert attendance rules to configurable policies.
93. Convert leave rules to configurable policies.
94. Convert payroll preparation settings to configurable policies.
95. Convert project workflows to configurable policies.
96. Convert contractor/timesheet behavior into Contracting Industry Pack where appropriate.
97. Convert procurement flow into reusable workflow definitions.
98. Convert inventory/custody behavior into reusable module behavior.
99. Convert financial operations into tenant-safe reusable workflows.
100. Separate accounting-ready data structures from accounting claims.
101. Add integration points for external accounting software.
102. Add document template packs per organization.
103. Add permission bundle templates per organization.
104. Add workflow policy templates per organization.
105. Add dashboard widgets based on enabled modules.

## Phase G — Captain / AI architecture
106. Make Captain tenant-context aware.
107. Prevent Captain from querying data outside active organization.
108. Require permission checks before Captain executes actions.
109. Make Captain understand enabled modules.
110. Make Captain respect configurable policies rather than hard-coded Arkan rules.
111. Add preview-before-apply for destructive or financial actions.
112. Log Captain-initiated writes separately.
113. Add organization-specific vocabulary and aliases.
114. Add industry-pack vocabulary.
115. Add safe import/extraction workflows for documents and spreadsheets.

## Phase H — Migration and validation
116. Create Arkan Al-Makan as tenant #1.
117. Backfill all existing root data to tenant #1.
118. Validate row counts before/after backfill.
119. Validate money totals before/after backfill.
120. Validate payroll totals before/after backfill.
121. Validate attendance totals before/after backfill.
122. Validate project totals before/after backfill.
123. Validate quotations and voucher numbering.
124. Validate permissions for all existing users.
125. Validate contractor portal access.
126. Validate all existing print outputs.
127. Validate Excel/PDF exports.
128. Validate old URLs and deep links.
129. Validate existing automated calculations.
130. Validate audit history remains readable.

## Phase I — Second-tenant proof
131. Create a clean synthetic tenant #2.
132. Enable only HR for tenant #2.
133. Create users who belong only to tenant #2.
134. Import test employees into tenant #2.
135. Prove tenant #1 users cannot read tenant #2 data.
136. Prove tenant #2 users cannot read tenant #1 data.
137. Prove IDs leaked from another tenant return no accessible rows.
138. Prove exports include only active-tenant data.
139. Prove search includes only active-tenant data.
140. Prove notifications are tenant-safe.
141. Prove audit logs are tenant-safe.
142. Prove Captain is tenant-safe.
143. Create tenant #3 with Projects only.
144. Prove module entitlements hide and reject disabled modules.
145. Test one user belonging to two organizations and switching safely.

## Phase J — Operational readiness
146. Add tenant-aware error diagnostics.
147. Add backup and restore strategy.
148. Add data retention policy hooks.
149. Add organization suspension without deletion.
150. Add billing/subscription model interfaces without coupling core logic to one payment provider.
151. Add usage metering hooks.
152. Add module entitlement audit.
153. Add rate-limit strategy for sensitive endpoints.
154. Add monitoring for authorization failures and unusual tenant-crossing attempts.
155. Add production migration runbook.
156. Add rollback runbook.
157. Create a pre-production staging verification.
158. Run full regression suite.
159. Run security advisor checks.
160. Promote only after tenant isolation and regression gates pass.

## Definition of done
The platform is considered genuinely multi-tenant only when:
- Arkan Al-Makan functions normally as tenant #1.
- At least two additional test tenants can operate independently.
- Database RLS blocks tenant crossing even when client-side filters are bypassed.
- Module entitlements are organization-specific.
- Permissions are organization-specific.
- Branding/settings/sequences are organization-specific.
- Audit events identify the tenant.
- Exports/search/AI respect the active tenant.
- No production-critical feature depends on a hard-coded Arkan Al-Makan assumption.
