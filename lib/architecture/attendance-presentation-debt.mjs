// Direct infrastructure access is forbidden in attendance presentation.
// All historical presentation-level Supabase debt has been retired.

export const ATTENDANCE_PRESENTATION_INFRASTRUCTURE_DEBT = Object.freeze([]);

export const ATTENDANCE_PRESENTATION_DEBT_POLICY = Object.freeze({
  principle:'presentation-depends-on-application-services-and-adapters-never-direct-infrastructure',
  newDirectSupabaseFilesAllowed:false,
  retirementOrder:Object.freeze([]),
});

export function attendancePresentationDebtByPath(path){
  return ATTENDANCE_PRESENTATION_INFRASTRUCTURE_DEBT.find((item)=>item.path===path)||null;
}
