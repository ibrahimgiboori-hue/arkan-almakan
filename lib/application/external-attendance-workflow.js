import { EXTERNAL_ATTENDANCE_STATUS } from '../core/external-attendance-state.js';

export const EXTERNAL_ATTENDANCE_STAGE = Object.freeze({
  LAB:'lab',
  REVIEW:'review',
  PAYROLL:'payroll',
  SHELL:'shell',
});

export const EXTERNAL_ATTENDANCE_NAV = Object.freeze([
  Object.freeze({key:EXTERNAL_ATTENDANCE_STAGE.LAB,label:'الحضور',href:'/dashboard/attendance'}),
  Object.freeze({key:EXTERNAL_ATTENDANCE_STAGE.REVIEW,label:'المراجعة',href:'/dashboard/attendance/external-review'}),
  Object.freeze({key:EXTERNAL_ATTENDANCE_STAGE.PAYROLL,label:'الرواتب',href:'/dashboard/attendance/payroll'}),
]);

export const EXTERNAL_ATTENDANCE_STAGE_STATUSES = Object.freeze({
  [EXTERNAL_ATTENDANCE_STAGE.LAB]:Object.freeze([
    EXTERNAL_ATTENDANCE_STATUS.UPLOADED,
    EXTERNAL_ATTENDANCE_STATUS.PARSED,
    EXTERNAL_ATTENDANCE_STATUS.CALIBRATED,
    EXTERNAL_ATTENDANCE_STATUS.ANALYZED,
  ]),
  [EXTERNAL_ATTENDANCE_STAGE.REVIEW]:Object.freeze([
    EXTERNAL_ATTENDANCE_STATUS.ANALYZED,
    EXTERNAL_ATTENDANCE_STATUS.JUSTIFICATIONS,
    EXTERNAL_ATTENDANCE_STATUS.RECALCULATED,
    EXTERNAL_ATTENDANCE_STATUS.READY_TO_POST,
  ]),
  [EXTERNAL_ATTENDANCE_STAGE.PAYROLL]:Object.freeze([
    EXTERNAL_ATTENDANCE_STATUS.RECALCULATED,
    EXTERNAL_ATTENDANCE_STATUS.READY_TO_POST,
  ]),
});

// Every executable action has exactly one owner. Other screens may display its result read-only.
export const EXTERNAL_ATTENDANCE_ACTION_OWNER = Object.freeze({
  create_import:EXTERNAL_ATTENDANCE_STAGE.LAB,
  edit_schedule:EXTERNAL_ATTENDANCE_STAGE.LAB,
  calibrate:EXTERNAL_ATTENDANCE_STAGE.LAB,
  analyze:EXTERNAL_ATTENDANCE_STAGE.LAB,

  start_review:EXTERNAL_ATTENDANCE_STAGE.REVIEW,
  submit_justification:EXTERNAL_ATTENDANCE_STAGE.REVIEW,
  edit_justification:EXTERNAL_ATTENDANCE_STAGE.REVIEW,
  export_client_review:EXTERNAL_ATTENDANCE_STAGE.REVIEW,
  import_client_decisions:EXTERNAL_ATTENDANCE_STAGE.REVIEW,
  approve_review_result:EXTERNAL_ATTENDANCE_STAGE.REVIEW,

  edit_payroll_inputs:EXTERNAL_ATTENDANCE_STAGE.PAYROLL,
  calculate_payroll:EXTERNAL_ATTENDANCE_STAGE.PAYROLL,
  issue_payslip:EXTERNAL_ATTENDANCE_STAGE.PAYROLL,

  delete_batch:EXTERNAL_ATTENDANCE_STAGE.SHELL,
});

export function externalAttendanceActionOwner(action) {
  return EXTERNAL_ATTENDANCE_ACTION_OWNER[String(action || '')] || null;
}

export function externalAttendanceStageAcceptsStatus(stage,status) {
  return (EXTERNAL_ATTENDANCE_STAGE_STATUSES[String(stage || '')] || []).includes(String(status || ''));
}

export function primaryExternalAttendanceStageForStatus(status) {
  const value=String(status || '');
  if ([EXTERNAL_ATTENDANCE_STATUS.RECALCULATED,EXTERNAL_ATTENDANCE_STATUS.READY_TO_POST].includes(value)) {
    return EXTERNAL_ATTENDANCE_STAGE.PAYROLL;
  }
  if ([EXTERNAL_ATTENDANCE_STATUS.ANALYZED,EXTERNAL_ATTENDANCE_STATUS.JUSTIFICATIONS].includes(value)) {
    return EXTERNAL_ATTENDANCE_STAGE.REVIEW;
  }
  return EXTERNAL_ATTENDANCE_STAGE.LAB;
}

export function externalAttendanceStageRoute(stage) {
  return EXTERNAL_ATTENDANCE_NAV.find((item)=>item.key===stage)?.href || EXTERNAL_ATTENDANCE_NAV[0].href;
}
