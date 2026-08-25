# Arkan Al‑Makan — Project Handover to Claude

## 1. Read this first
This is the active handover for the Arkan Al‑Makan administrative/contracting system. Do not restart the architecture from scratch. Continue from the current constitutional branch and preserve the approved UI/data/print principles below.

Repository: `ibrahimgiboori-hue/arkan-almakan`
Active branch: `v2-system-constitution`
Vercel branch alias: `arkan-almakan-git-v2-system-constitution-arkan4.vercel.app`
Stack: Next.js + Supabase + Vercel.

The current user-approved direction is: one constitution, one source of truth, one unified shell, one print engine, and shared transaction logic. Avoid page-specific patches whenever a central rule can solve the class of problem.

---

## 2. Product goal
Arkan Al‑Makan is intended to operate a contracting company through a unified administrative system covering projects, contractors, labor/timesheets, expenses, custody, advances/payments, financial effects, documents/prints, HR and related workflows.

The system must behave like a single governed product, not a collection of unrelated screens. A change to a shared UI shell, print rule, terminology, accounting rule or data relation should propagate everywhere that uses that concept.

---

## 3. Non-negotiable constitution

### UI constitution
- Current visual shell is approved by the user. Do not redesign it wholesale without explicit request.
- Workspaces must use the full available screen width. Do not constrain business workspaces to half-screen or arbitrary centered max-width containers.
- Avoid duplicate actions. One function should have one obvious primary entry point. Example: the redundant red `التشغيل اليومي` button in the project header was removed because the project tab already provides that route.
- Prefer common, professional Arabic terminology over invented wording.
- High contrast is mandatory; do not place low-contrast text on backgrounds.
- Components should be replaceable shells around stable data/logic. UI skin should not be intertwined with business logic.

### Data/transaction constitution
- Every business fact must have one source of truth.
- A saved transaction must automatically affect every dependent view/report/summary that is supposed to reflect it.
- Do not duplicate financial effect to make it visible in another module.
- Distinguish clearly between payer, beneficiary, cost bearer and reimbursement liability.
- Preserve auditability for edits/corrections.
- Avoid duplicate saves by design; bulk writes should be idempotent where possible.

### Print constitution
- All formal reports/documents must use the unified print governance and `ConstitutionPagedFrame` family.
- A4 printable output must honor top/bottom/side safe areas.
- Footer space is reserved; table content must never collide with footer/letterhead.
- Rows should not split across pages unless the document explicitly allows it.
- Long tables must paginate; do not send an arbitrarily long HTML table as one page.
- Repeated page content must be intentional. Identity/summary information should not be duplicated on every page if a compact continuation header is enough.
- Print quality, uploaded letterheads, signatures, seals and background assets must not be intentionally degraded.

---

## 4. Current project shell
Important source:
- `app/dashboard/projects/[id]/layout.js`
- `app/dashboard/projects/[id]/project-workspace-shell.module.css`

Project workspace tabs currently include:
- ملخص المشروع
- التشغيل اليومي
- المستندات
- المواد

Recent change: the redundant red `التشغيل اليومي` header button was removed. Commit: `ca5751d6c2290a2a6e454487fd46f592953f9c94`.

Full-width workspace rule was introduced earlier. Commit: `2cf9aa0a4ad5dece172d51197f0fbb4d425a3ee4`.

---

## 5. Contractors and project assignment
Historic bug encountered: a contractor could be genuinely assigned to a project from a given start date yet an operations screen said no contractor was linked because different screens were reading different relationship paths.

Required direction:
- Contractor/project assignment must be resolved from one canonical source.
- Labor belongs to contractor; project assignment determines availability in project operations.
- Avoid creating parallel relationships merely for individual screens.
- Assignment validity dates matter for historical reporting and timesheet availability.

This area should be regression-tested end-to-end before adding more assignment features.

---

## 6. Labor and timesheets
Core rules:
- Attendance statuses: full day or half day; missing means absence.
- Full day = `1.0` workday, half day = `0.5`.
- Contractor labor classes must remain financially distinct.
- `technician` = صنايعي; `worker` = عامل; foreman/other classes must not silently disappear into either class.
- User specifically requires separate totals because daily rates differ.

Key logic:
- `lib/timesheet-report.mjs`
- `lib/labor-class-summary.mjs`
- `app/print/timesheet/page.js`
- `app/print/timesheet/timesheet-report.css`
- `app/dashboard/site-operations/reports/page.js`

Recent timesheet commits:
- `3e4c6805753703191790d04b034e5585df34e2f6` — central split of workday totals by labor class.
- `db67f779354e279a478b301548e7bd44d7c2d577` — report shows separate worker/craftsman totals.
- `dd02907ae69c4fb0d32183541b1250b6b144b420` — test for separate workday totals.
- `d8f65410375b3aca2ed7eb1c8ba411e5c3cc8eda` — report center simplified to direct actions.

### Report center terminology
Do not use the old UX language `العامل هو المحور / اليوم هو المحور / الفترة هي المحور`.
Approved direct actions:
1. `استعراض وطباعة التايم شيت`
2. `طباعة نموذج تايم شيت لمقاول متعاقد`
3. `طباعة نموذج فارغ`

### Timesheet report layout — latest approved concept
The user explicitly approved a no-repetition structure:
- First page: report identity + project + contractor + site + period.
- Body pages: attendance matrix only, with a compact continuation header on subsequent pages.
- Remove `أيام الفترة` from the attendance matrix.
- Do not repeat the four-cell summary and the three total rows on every page.
- Final report section only: period summary + per-worker period total.
- Final summary must show at minimum:
  - number of workers by class
  - full attendance count
  - half-day count
  - `إجمالي يوميات الصنايعية`
  - `إجمالي يوميات العمال`
  - overall workdays (optional but useful)
- Per-worker final section: name, class, trade, total workdays for full period.

Latest implementation commit for this refactor: `7738d07f5a999431ad0523c3832e6fc0d2ffcaf6`. Verify deployment/build and visual output before considering it finished.

### Blank weekly timesheet
The blank paper form is now intended as a weekly Saturday–Thursday sheet.
Top info: project, contractor, location/site, week from/to.
Columns: No. | worker name | class | Saturday | Sunday | Monday | Tuesday | Wednesday | Thursday | notes.
Each day header should have a small date blank.
Bottom manual totals: craftsmen workdays, workers workdays, total workdays.
Sources:
- `app/print/timesheet/blank/page.js`
- `app/print/timesheet/blank/blank-timesheet.css`
Recent commits:
- `5c076ec125d78d969d0bef1a1bb2ca8612601497`
- `ee4befff0650391430cf1b4e132493a1af94c20f`

---

## 7. Daily expenses
The user found single-record entry too slow. Current approved direction is spreadsheet-like rapid entry.

Key UI source:
- `app/dashboard/projects/[id]/operations/direct-expense-panel.js`

Required behavior:
- When date changes, saved expenses for that exact date must populate the same rapid-entry grid as persisted rows.
- Persisted rows are editable in place.
- Blank rows remain below for new expenses.
- One bulk save action updates existing rows and inserts new rows.
- Item/project-item link is optional; `مصروف عام — بدون بند` must be supported.
- The grid should use full available width.

Recent commit for showing saved day expenses inside the grid:
- `8a9cfc20bb80c2b5143ff3e8bdb0f46119403d79`

### Professional terminology
Avoid `دفع من ماله` or `موظف من ماله الخاص` in user-facing financial language.
Approved wording:
- Short label: `مدفوع من الحساب الشخصي`
- Explanatory wording: `تم السداد من الحساب الشخصي للموظف نيابةً عن المنشأة، ويُسجل المبلغ كمستحق له.`

Expense report terminology was updated in commit:
- `070329340602d60bb4df049522dd5f3a3f141cad`

Audit the rapid-entry screen itself for any remaining old wording; do not assume every occurrence was replaced.

---

## 8. Employee-paid project expenses / reimbursement logic
Important business case: employee Mمدوح paid money to a contractor from his own account on behalf of Arkan.

Correct accounting behavior:
- Project expense is recorded once.
- Contractor receipt/beneficiary context remains visible.
- Employee becomes creditor / reimbursement due for the same amount.
- Do NOT create a second project expense.
- Do NOT create a duplicate contractor payment merely to make the employee liability visible.
- When Arkan reimburses the employee, reduce the employee liability only; do not increase project expense again.

Conceptual example:
`500 project expense → paid from employee personal account → employee due 500 → reimburse 200 → due 300 → reimburse 300 → due 0`.

The user wants this reflected consistently in project cost, employee balance, reports and financial summaries.

---

## 9. Expenses and project costs
Historic defect: daily expenses were saved but did not reflect in the project `التكاليف` overview.

Required invariant:
A saved/edited expense must flow automatically to the central project financial view and every dependent summary.

Do not double count expenses generated from custody or another already-accounted financial movement.
Employee-paid expense is one project cost plus one employee liability — not two costs.

Relevant historical commits:
- `09dadbf2a8e5422f7195d57dbaad720aac9650bb` — persist expense-to-project-cost linkage.

Project overview reads central financial views (`v_project_financials`, `v_project_totals`). Keep the overview as a consumer of central financial truth, not a place for bespoke arithmetic.

---

## 10. Expense printing
User requirement: print action belongs beside the date/navigation controls because it is a period report, not an action inside one expense card.

User selects `from` and `to`; report reads saved `contractor_expenses` from database for project + contractor + range.

Key source:
- `app/print/expenses/page.js`
- print governance files below.

Historic issues:
- report route once threw a client-side exception;
- report was initially registered but incorrectly used timesheet policy;
- long table collided with footer because it was treated as one page;
- print button was initially hidden-looking text in wrong location.

Relevant commits:
- `4a4e3d9003758b27836980464091cb4eac3b5b20` — report entry point/range flow.
- `04c8d7456d7cb60c91fe9340584a028b4ecefb5d` — register expense report in print constitution.
- `18a59b57b5556355110464f6c1be5ea409c74450` — govern expense report safe-area pagination.
- `3f4758766c43611e99c3f76ad477fe43178156c8` — paginate expense report.
- `527583531d7a7cdd05089f9059c8fc0b89b1f46c` — retire legacy inline print link.

Expense report should clearly show actual payer, including employee name for personal-account payments, and make clear employee liability is included within total project expenses rather than added on top.

---

## 11. Print governance sources
Inspect these before changing any print screen:
- `lib/print-governance.js` (or current equivalent in repo)
- `components/print/ConstitutionPagedFrame.*`
- print family CSS / constitution content CSS

Principle: fix pagination/safe-area problems centrally when possible. A report-specific workaround is acceptable only when the document has genuinely different pagination semantics.

---

## 12. Known architectural risks / hardening backlog
The user approved correcting these under the constitution, not as isolated patches:

1. Multiple relationship paths can disagree on contractor/project assignment.
2. Duplicate/legacy components can implement the same feature differently.
3. Financial movements need one central movement/ledger model rather than separate arithmetic per screen.
4. Employee financial ledger needs clear custody vs employee receivable/reimbursement distinction.
5. Contractor ledger should eventually unify advances, payments, claims, recoverables and balances.
6. Schema/code version drift must be prevented; frontend should not silently depend on unapplied migrations.
7. Bulk operations need idempotency protection.
8. Every transaction needs a defined propagation contract: source record → dependent balance → report → audit log.
9. Legacy SQL/components are numerous; audit and retire unused paths deliberately rather than deleting blindly.
10. Build success is not enough. Create end-to-end regression journeys for real workflows.

Recommended hardening journeys:
- create/open project → assign contractor → add labor → attendance → report
- full/half attendance → separate craftsman/worker totals
- expense → edit → project cost reflection → expense report
- employee personal-account expense → employee due → partial reimbursement → final reimbursement
- custody expense → project cost without double count
- contractor advance/payment → ledger/balance/report
- print long expense report → no footer collision
- multi-page timesheet → no repeated summary; final summary correct

---

## 13. UX rules learned from the user
- Prefer direct action names over abstract architecture jargon.
- Do not make common high-volume data entry one record at a time when a grid/bulk workflow fits.
- When changing date, the screen should visibly reflect that date's saved data.
- Do not hide important actions as plain text.
- Avoid duplicate buttons/links for the same route.
- Use full screen width for operational grids.
- Printed reports should be readable by an external recipient without needing insider knowledge.
- Separate `عامل` and `صنايعي` totals wherever day rates/costs differ.

---

## 14. Current status at handover
The current UI is generally approved by the user.
Most recent active changes include:
- full-width project workspace;
- rapid daily expense grid;
- expense-to-project-cost reflection;
- professional personal-account expense wording in report;
- expense report pagination under print constitution;
- simplified timesheet report center;
- separate craftsman/worker workday totals;
- weekly blank timesheet Saturday–Thursday;
- timesheet report de-duplication/final-summary refactor;
- removal of redundant red project `التشغيل اليومي` button.

Before continuing feature work, verify the most recent deployments visually, especially:
1. multi-page timesheet report after commit `7738d07f5a999431ad0523c3832e6fc0d2ffcaf6`;
2. weekly blank timesheet width/print fit;
3. expense report footer-safe pagination;
4. rapid expense grid terminology and saved-row editing;
5. project overview cost updates after expense edits.

---

## 15. How Claude should work on this repo
1. Checkout/read `v2-system-constitution` first.
2. Read this handover before making architectural changes.
3. Inspect the actual current component before editing; legacy duplicates exist.
4. Trace data source → write path → dependent views before patching UI.
5. Prefer central rules/services/views/components over page-specific fixes.
6. For each change: state files touched, invariant being protected, commit SHA, deployment/build status, and any unverified behavior.
7. Do not claim a database migration or deployment succeeded unless verified.
8. Do not delete legacy code until usage is proven absent.
9. Keep current approved visual identity unless explicitly asked to redesign.
10. Test real user journeys, not only compilation.

---

## 16. Immediate next recommended task
Verify and finish the newly refactored timesheet print output visually. The intended final report is:
- Page 1 identity only once.
- Middle pages attendance only with compact continuation header.
- No `أيام الفترة` column in body.
- No repeated summary blocks/totals on each page.
- Final section with per-worker period totals and class-separated aggregate workdays.

Then resume the broader hardening backlog above.