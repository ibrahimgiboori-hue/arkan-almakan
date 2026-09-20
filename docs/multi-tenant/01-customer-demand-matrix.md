# Arkan Commercialization — Customer Demand Matrix

## Purpose
This document starts from the customer's "greedy" point of view before architecture. It defines what a paying organization is likely to expect now, next month, and after growth.

## Product principle
Arkan is not sold as one rigid ERP. It is a modular business operating platform with a shared core and optional modules.

## Customer lenses

### 1. HR customer
A demanding HR customer will expect:
- Employee master records and document archive.
- Contracts, offers, onboarding, probation and offboarding.
- Leave policies, balances, approvals and substitutions.
- Attendance import, schedules, justifications and exceptions.
- Payroll preparation and payroll approval workflow.
- Advances, deductions, reimbursements and end-of-service.
- Recruitment pipeline, interviews, offers and onboarding.
- Organization structure, departments, positions and job titles.
- Employee self-service requests.
- Branch-specific policies.
- Alerts for expiring documents and contracts.
- Bulk import/export through Excel.
- Role-based access by branch, department, employee group and transaction type.
- Audit trail for every sensitive change.
- Reusable letters, certificates and document templates.
- Arabic/English documents and print layouts.
- Dashboard and management reports.
- Integration-ready architecture for government and payroll services.

### 2. Finance operations customer
A demanding finance customer will expect:
- Cash receipt/payment vouchers.
- Treasury accounts and movements.
- Supplier/customer balances.
- Employee reimbursements, advances and settlements.
- Project cost allocation and cost centers.
- Approval workflows and spend limits.
- Attachments and invoice evidence.
- Period controls and locking.
- Bank statement import and reconciliation.
- Budget obligations and planned cash flow.
- Financial snapshots and traceability.
- Export to Excel/PDF.
- Integration with a full accounting system if the customer already uses one.
- Upgrade path toward full accounting without rebuilding the product.

### 3. Projects customer
A demanding project customer will expect:
- Project master data and clients.
- Project scope and items.
- Contractors, labor and assignments.
- Daily attendance and timesheets.
- Quantities, measurements and progress.
- Claims, retentions, guarantees and change orders.
- Direct expenses and procurement links.
- Materials, custody and site documents.
- Budget vs actual and project margin.
- Cash-flow timing.
- Project-specific approvals.
- Portal access for contractor/site users.
- Project dashboard and alerts.
- Project archive and audit history.

### 4. Procurement / inventory customer
A demanding procurement customer will expect:
- Request of need.
- Approval.
- RFQ / quotations.
- Purchase order.
- Receiving and inspection.
- Invoice matching.
- Inventory receipt and issue.
- Asset/custody assignment.
- Returns.
- Supplier history.
- Project/job cost allocation.
- Approval thresholds.
- Multi-branch inventory.
- Consumable vs asset treatment.
- Attachments and audit.

### 5. General administration customer
A demanding general admin customer will expect:
- Organization profile and branches.
- Users, roles and permissions.
- Number sequences.
- Document templates.
- Correspondence register.
- Tasks and approvals.
- Notifications.
- Files and attachments.
- Search across modules.
- Audit log.
- Custom fields.
- Custom statuses.
- Custom workflows.
- Custom print layouts.
- Import/export.
- Arabic/English.
- Organization branding.

## Classification rule
Every requested feature must be classified before implementation:

- CORE: reusable across almost every organization.
- MODULE: belongs to a major business domain such as HR, Projects or Finance.
- OPTIONAL: useful but not required for all customers.
- INDUSTRY: specific to contracting, clinics, manufacturing, logistics, etc.
- CUSTOM: a one-off request that should not contaminate the product core.

## Mandatory product questions before any feature is built
1. Which paying customer persona asks for this?
2. What problem are they actually trying to solve?
3. What will they ask immediately after this feature exists?
4. Does the request reveal a missing reusable engine?
5. Is it Core, Module, Optional, Industry or Custom?
6. Can it be configured instead of hard-coded?
7. Does it require branch-level variation?
8. Does it require role/scope restrictions?
9. Does it require approval?
10. Does it require audit history?
11. Does it affect money?
12. Does it affect HR-sensitive data?
13. Does it require document generation?
14. Does it require import/export?
15. Does it require future integration?
16. Can one organization enable it while another disables it?
17. Can the organization rename or configure it?
18. Can it scale from 5 to 500+ users?
19. Does it introduce tenant-crossing risk?
20. What is the rollback path?

## Commercial packaging hypothesis
- Arkan Core
- Arkan HR
- Arkan Projects
- Arkan Financial Operations
- Arkan Procurement
- Arkan Inventory & Custody
- Arkan Documents & Workflow
- Arkan AI Captain
- Industry Packs: Contracting, Medical, Manufacturing, Services, Logistics

## Non-negotiable commercial behavior
- One codebase.
- Multiple isolated organizations.
- Modules enabled per organization.
- Organization-specific branding, numbering, settings and workflows.
- Branch-aware permissions.
- No data visibility across organizations.
- No feature assumes "Arkan Al-Makan" as a global company.
- Existing Arkan Al-Makan behavior is preserved as the first tenant configuration, not as platform law.
