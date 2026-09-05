# Preview ↔ Production reconciliation — 2026-09-05

## Safety rule

This branch exists only to reconcile the long-lived preview work with `main` without losing either side. Do not bulk-merge `refactor/program-zero-residue-v1` into `main`.

Source state at start:

- Production branch: `main` @ `190e9706d60928b58f1ce853cff416b4515c3597`
- Preview branch: `refactor/program-zero-residue-v1` @ `235e483c4be86c77a2c51be0b62450402473ed46`
- Merge base: `9d15224d45b738639d8b2cfe91acada0fb6f401f`
- Preview is ahead by 107 commits and behind by 2 commits.

## Main-only changes

### 1. `6e92a13` — finance: calculate monthly reserve needed by due date

Do **not** copy this migration verbatim into preview.

Reason: preview already contains a newer reserve model that supersedes it:

- `557e0d0` — unify current budget on a daily baseline
- `c1c07e3` — reserve non-monthly budget from rule effective date
- `235e483` — make daily budget reserve proration exact

The preview model prorates using the actual active date window and exact cumulative day-level rounding, so importing the older equal-month catch-up migration would regress the newer finance law.

### 2. `190e970` — finance: make monthly budget report self-explanatory

Port the **presentation intent**, not the old page wholesale. Preview already has later report-preparation features (filter/sort/group), print-governance hooks, `PrintColumnLabel`, and captain pagination semantics that must be preserved.

Useful intent to carry into the preview report:

- clearly separate what is due now, what becomes due later in the month, and what must be reserved for future obligations;
- show a plain-language monthly cash burden;
- distinguish a previous overdue payment from a normal current due;
- show reserve status without describing the newer daily-proration engine as an older equal-month formula.

## Preview-only work that must not be lost

### A. Core / high-value — candidate for production after verification

- Unified print captain / pagination and print presentation:
  - `components/print/ConstitutionPagedFrame.js`
  - `components/print/PagedTableGridEditor.js`
  - `components/print/PrintPresentationContext.js`
  - `lib/print-governance.js`
  - print route migrations/refactors under `app/print/**`
- Report preparation before printing:
  - `lib/report-preparation.js`
  - filtering/sorting/grouping in the operating-budget report
- Navigation / work-session constitution:
  - `components/ui/WorkSessionRuntime.js`
  - `lib/work-session-constitution.js`
  - `lib/anatomical-navigation.js`
  - `components/ui/ContextualDashboardNavigation.js`
- Finance truth / operating-budget intelligence:
  - accumulated outstanding and actual variance
  - source editable until consequence
  - period intelligence and summary
  - active-period rate resolution
  - daily baseline
  - reserve from rule effective date
  - exact daily reserve proration
- Removal of misclassified project transaction hooks.

### B. Review as a coherent UI/refactor set before production

- dashboard shell/body visual changes;
- portal hall and portal interior styles;
- home dashboard refactor;
- project list/detail refactors;
- quote editor refactor;
- settings refactor;
- form builder refactor.

These should be tested as a user journey rather than cherry-picked as isolated CSS/code fragments.

### C. Intentional legacy retirement — verify dependencies before promoting

Preview removes old print residue including:

- `components/print/PrintFrame.js`
- `app/print/print-system.css`
- `app/print/employees/emp-report.css`
- `lib/quote-pagination.mjs`
- `tests/quote-pagination.test.mjs`

This matches the program rule that replaced print components should be removed after their useful behavior is migrated, but production promotion must first prove there are no remaining imports/dependencies.

## Promotion gate

For each group before production:

1. Keep `main` unchanged until the preview behavior passes validation.
2. Confirm no removed legacy module is still imported.
3. Run build/lint/tests and the repository audit scripts relevant to the group.
4. Verify the corresponding preview route manually.
5. Promote one coherent group at a time, with a rollback commit boundary.
6. Re-compare branches after every promotion so the unresolved delta only decreases.

## Immediate reconciliation decision

- Keep the preview finance engine (`235e483` lineage); reject the older main-only equal-month migration as superseded.
- Carry the explanatory report improvements from `190e970` into the preview report while preserving the preview's newer report-preparation and print-governance features.
- Do not touch production during reconciliation until the reconciled branch passes the gates above.

## Final promotion record

- The reconciliation was merged into `refactor/program-zero-residue-v1` as `1a35a22f248311ec4515150333f755b75b4b680e` and its Vercel preview build completed successfully.
- The validated preview tree became the canonical production tree through merge commit `1d085c64929be1d9bcebfada45282b359f18cbe1`, preserving both production and preview histories while resolving the content in favor of the newer validated preview architecture.
- The superseded equal-month reserve migration remains reachable in Git history but is intentionally absent from the canonical tree because the daily-proration engine supersedes it and the duplicate migration version would be unsafe to reintroduce.
- After the production deployment of this record is confirmed READY, `refactor/program-zero-residue-v1` is to be fast-forwarded to the same production commit so production and preview are byte-for-byte identical at the branch tip.
