// Temporary direct-infrastructure debt in attendance presentation.
// These files are grandfathered only so the product can keep running while they are strangled behind adapters/services.
// New direct Supabase access in attendance presentation is forbidden.

export const ATTENDANCE_PRESENTATION_INFRASTRUCTURE_DEBT = Object.freeze([
  Object.freeze({
    path:'app/dashboard/attendance/page.js',
    scope:'lab-shell',
    retirement:'move-import-loading-schedule-writes-and-lab-actions-behind-application-services',
  }),
  Object.freeze({
    path:'components/attendance/AttendanceJustificationDialog.js',
    scope:'legacy-internal-review',
    retirement:'delegate-justification-use-case-to-the-attendance-review-application-layer',
  }),
  Object.freeze({
    path:'components/attendance/AttendanceProcessingTable.js',
    scope:'legacy-processing-table',
    retirement:'replace-storage-knowledge-with-stable-processing-read-model-and-actions',
  }),
  Object.freeze({
    path:'components/attendance/ExternalPayrollWorkspace.js',
    scope:'external-payroll',
    retirement:'move-payroll-persistence-and-file-orchestration-behind-payroll-adapters-and-services',
  }),
]);

export const ATTENDANCE_PRESENTATION_DEBT_POLICY = Object.freeze({
  principle:'strangle-existing-direct-infrastructure-never-add-new-direct-access',
  newDirectSupabaseFilesAllowed:false,
  retirementOrder:Object.freeze([
    'external-payroll',
    'lab-shell',
    'legacy-internal-review',
    'legacy-processing-table',
  ]),
});

export function attendancePresentationDebtByPath(path){
  return ATTENDANCE_PRESENTATION_INFRASTRUCTURE_DEBT.find((item)=>item.path===path)||null;
}
