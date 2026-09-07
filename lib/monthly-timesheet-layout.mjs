export const MONTHLY_TIMESHEET_FIXED_COLUMNS = Object.freeze({
  index:2.1,
  name:14.6,
  identity:8.3,
  total:4.2,
});

export function monthlyTimesheetColumnPlan(dayCount) {
  const count = Math.max(1,Math.trunc(Number(dayCount) || 31));
  const fixed = Object.values(MONTHLY_TIMESHEET_FIXED_COLUMNS).reduce((sum,value)=>sum+value,0);
  const dayArea = 100 - fixed;
  return Object.freeze({
    ...MONTHLY_TIMESHEET_FIXED_COLUMNS,
    fixed,
    dayArea,
    day:dayArea / count,
    dayCount:count,
  });
}
