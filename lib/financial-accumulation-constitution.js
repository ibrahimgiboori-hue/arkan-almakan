// قانون الذكاء المالي للالتزامات المتكررة والميزانية التشغيلية.
// لا يجوز اختزال البند في «قيمة هذا الشهر» إذا كانت له استحقاقات سابقة لم تُسدّد.

export const FINANCIAL_ACCUMULATION_POLICY = Object.freeze({
  id: 'expected-due-paid-variance-v1',

  expectedLaw: 'planned-value-remains-distinct-from-confirmed-and-paid-actuals',
  obligationLaw: 'every-due-cycle-remains-an-independent-traceable-obligation-until-settled',
  accumulationLaw: 'outstanding-is-the-sum-of-all-due-unpaid-obligations-not-only-the-oldest-cycle',
  periodIndependenceLaw: 'historical-obligations-exist-from-source-schedule-even-if-a-month-screen-was-never-opened',

  paymentLaw: 'actual-treasury-payment-reduces-outstanding-only-after-a-posted-treasury-movement',
  allocationLaw: 'payments-apply-oldest-due-first-unless-an-explicit-governed-allocation-says-otherwise',
  partialPaymentLaw: 'partial-payments-preserve-the-unpaid-remainder-on-the-same-obligation',
  noPhantomPaymentLaw: 'absence-of-a-posted-payment-means-the-obligation-remains-outstanding',

  analyticsLaw: 'monthly-analysis-compares-plan-confirmed-liability-actual-cash-and-closing-outstanding-separately',
  varianceLaw: 'variance-is-derived-from-governed-truth-and-must-identify-the-items-driving-the-difference',
  driverLaw: 'rank-material-variance-drivers-by-absolute-financial-effect',

  reportLaw: 'reports-expose-expected-due-paid-outstanding-and-variance-without-mutating-the-ledger',
  sourceEditLaw: 'uncommitted-source-edits-restate-derived-expectations-everywhere-before-consequential-action',

  bodyMustNotTreatCurrentCycleAsWholeBalance: true,
  bodyMustNotMarkPaidWithoutTreasuryEvidence: true,
  bodyMustNotEraseHistoricalArrearsWhenA-New-CycleAppears: true,
});
