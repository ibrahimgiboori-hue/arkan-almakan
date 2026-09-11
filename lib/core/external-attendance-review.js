export const EXTERNAL_ATTENDANCE_REVIEW_GROUP = Object.freeze({
  ABSENCE:'absence',
  MISSING_PUNCH:'missing_punch',
  TECHNICAL:'technical',
});

export const EXTERNAL_ATTENDANCE_REVIEWABLE_STATUSES = Object.freeze([
  'absent','missing_in','missing_out',
]);

export const EXTERNAL_ATTENDANCE_JUSTIFICATION_TYPES = Object.freeze([
  Object.freeze(['sick_leave','إجازة مرضية']),
  Object.freeze(['approved_leave','إجازة معتمدة']),
  Object.freeze(['non_working_day','يوم غير مجدول']),
  Object.freeze(['outside_work','مهمة خارجية']),
  Object.freeze(['biometric_device_issue','عطل جهاز البصمة']),
  Object.freeze(['forgot_punch','نسيان البصمة']),
  Object.freeze(['approved_shift_change','تعديل دوام معتمد']),
  Object.freeze(['approved_late_early_permission','إذن تأخير / خروج']),
  Object.freeze(['training_meeting_assignment','تكليف / تدريب / اجتماع']),
  Object.freeze(['other_site_branch','عمل في موقع آخر']),
  Object.freeze(['other','أخرى']),
]);

export const EXTERNAL_ATTENDANCE_JUSTIFICATION_ALLOWLIST = Object.freeze({
  [EXTERNAL_ATTENDANCE_REVIEW_GROUP.ABSENCE]:Object.freeze([
    'sick_leave','approved_leave','non_working_day','outside_work','approved_shift_change',
    'training_meeting_assignment','other_site_branch','other',
  ]),
  [EXTERNAL_ATTENDANCE_REVIEW_GROUP.MISSING_PUNCH]:Object.freeze([
    'biometric_device_issue','forgot_punch','outside_work','approved_late_early_permission',
    'approved_shift_change','training_meeting_assignment','other_site_branch','other',
  ]),
});

export function externalAttendanceReviewGroupForStatus(status) {
  const value=String(status || '');
  if(value==='absent')return EXTERNAL_ATTENDANCE_REVIEW_GROUP.ABSENCE;
  if(value==='missing_in'||value==='missing_out')return EXTERNAL_ATTENDANCE_REVIEW_GROUP.MISSING_PUNCH;
  if(value==='needs_review')return EXTERNAL_ATTENDANCE_REVIEW_GROUP.TECHNICAL;
  return null;
}

export function externalAttendanceJustificationDecision(day) {
  return String(day?.justification_decision || 'pending');
}

export function externalAttendanceReviewCaseState(day) {
  if(!EXTERNAL_ATTENDANCE_REVIEWABLE_STATUSES.includes(String(day?.day_status || '')))return 'not_reviewable';
  if(!day?.justification_id)return 'unjustified';
  const decision=externalAttendanceJustificationDecision(day);
  if(decision==='accepted')return 'accepted';
  if(decision==='rejected')return 'rejected';
  return 'pending';
}

export function isExternalAttendanceJustificationAllowed(group,type) {
  return (EXTERNAL_ATTENDANCE_JUSTIFICATION_ALLOWLIST[String(group || '')] || []).includes(String(type || ''));
}

export function summarizeExternalAttendanceReview(days=[]) {
  const summary={
    total:Number(days.length || 0),
    technical:0,
    reviewable:0,
    unjustified:0,
    clientPending:0,
    accepted:0,
    rejected:0,
    readyForFinal:false,
  };

  for(const day of days){
    if(day?.day_status==='needs_review')summary.technical+=1;
    const state=externalAttendanceReviewCaseState(day);
    if(state==='not_reviewable')continue;
    summary.reviewable+=1;
    if(state==='unjustified')summary.unjustified+=1;
    else if(state==='pending')summary.clientPending+=1;
    else if(state==='accepted')summary.accepted+=1;
    else if(state==='rejected')summary.rejected+=1;
  }

  summary.readyForFinal=summary.technical===0&&summary.unjustified===0&&summary.clientPending===0;
  return Object.freeze(summary);
}
