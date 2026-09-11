import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTERNAL_ATTENDANCE_SEQUENCE,
  EXTERNAL_ATTENDANCE_STATUS,
  canTransitionExternalAttendance,
  externalAttendanceTransitionsFrom,
  isExternalAttendanceTerminal,
} from '../lib/core/external-attendance-state.js';
import {
  EXTERNAL_ATTENDANCE_ACTION_OWNER,
  EXTERNAL_ATTENDANCE_NAV,
  EXTERNAL_ATTENDANCE_STAGE,
  externalAttendanceActionOwner,
  externalAttendanceStageAcceptsStatus,
  primaryExternalAttendanceStageForStatus,
} from '../lib/application/external-attendance-workflow.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('external attendance state sequence is explicit and stable', () => {
  assert.deepEqual(EXTERNAL_ATTENDANCE_SEQUENCE, [
    'uploaded','parsed','calibrated','analyzed','justifications','recalculated','ready_to_post','closed',
  ]);
  assert.equal(canTransitionExternalAttendance('parsed','calibrated'), true);
  assert.equal(canTransitionExternalAttendance('calibrated','analyzed'), true);
  assert.equal(canTransitionExternalAttendance('analyzed','justifications'), true);
  assert.equal(canTransitionExternalAttendance('analyzed','recalculated'), true);
  assert.equal(canTransitionExternalAttendance('justifications','recalculated'), true);
  assert.equal(canTransitionExternalAttendance('recalculated','ready_to_post'), true);
  assert.equal(canTransitionExternalAttendance('ready_to_post','closed'), true);
  assert.equal(canTransitionExternalAttendance('parsed','payroll'), false);
  assert.equal(canTransitionExternalAttendance('ready_to_post','analyzed'), false);
});

test('terminal states cannot silently reopen', () => {
  for (const status of [EXTERNAL_ATTENDANCE_STATUS.CLOSED,EXTERNAL_ATTENDANCE_STATUS.FAILED,EXTERNAL_ATTENDANCE_STATUS.SUPERSEDED]) {
    assert.equal(isExternalAttendanceTerminal(status), true);
    assert.deepEqual(externalAttendanceTransitionsFrom(status), []);
  }
});

test('workflow navigation has one canonical route for each user stage', () => {
  assert.deepEqual(EXTERNAL_ATTENDANCE_NAV.map((item)=>item.key), ['lab','review','payroll']);
  assert.deepEqual(EXTERNAL_ATTENDANCE_NAV.map((item)=>item.href), [
    '/dashboard/attendance',
    '/dashboard/attendance/external-review',
    '/dashboard/attendance/payroll',
  ]);
});

test('one executable action has exactly one owner', () => {
  const actions=Object.keys(EXTERNAL_ATTENDANCE_ACTION_OWNER);
  assert.equal(new Set(actions).size,actions.length);
  assert.equal(externalAttendanceActionOwner('analyze'),EXTERNAL_ATTENDANCE_STAGE.LAB);
  assert.equal(externalAttendanceActionOwner('submit_justification'),EXTERNAL_ATTENDANCE_STAGE.REVIEW);
  assert.equal(externalAttendanceActionOwner('approve_review_result'),EXTERNAL_ATTENDANCE_STAGE.REVIEW);
  assert.equal(externalAttendanceActionOwner('calculate_payroll'),EXTERNAL_ATTENDANCE_STAGE.PAYROLL);
  assert.equal(externalAttendanceActionOwner('delete_batch'),EXTERNAL_ATTENDANCE_STAGE.SHELL);
  assert.equal(externalAttendanceActionOwner('unknown'),null);
});

test('status visibility follows the workflow without duplicating execution ownership', () => {
  assert.equal(externalAttendanceStageAcceptsStatus('lab','calibrated'),true);
  assert.equal(externalAttendanceStageAcceptsStatus('review','analyzed'),true);
  assert.equal(externalAttendanceStageAcceptsStatus('review','justifications'),true);
  assert.equal(externalAttendanceStageAcceptsStatus('payroll','recalculated'),true);
  assert.equal(externalAttendanceStageAcceptsStatus('payroll','ready_to_post'),true);
  assert.equal(primaryExternalAttendanceStageForStatus('calibrated'),'lab');
  assert.equal(primaryExternalAttendanceStageForStatus('analyzed'),'review');
  assert.equal(primaryExternalAttendanceStageForStatus('justifications'),'review');
  assert.equal(primaryExternalAttendanceStageForStatus('recalculated'),'payroll');
  assert.equal(primaryExternalAttendanceStageForStatus('ready_to_post'),'payroll');
});

test('batch delete presentation delegates persistence to an adapter', () => {
  const component=read('components/attendance/DeleteExternalAttendanceBatchButton.js');
  const adapter=read('lib/adapters/external-attendance-supabase.js');
  assert.match(component,/from '@\/lib\/adapters\/external-attendance-supabase'/);
  assert.equal(component.includes("from '@/lib/supabase'"),false);
  assert.equal(component.includes(".rpc('hr_delete_external_attendance_import'"),false);
  assert.match(adapter,/deleteExternalAttendanceImport/);
  assert.match(adapter,/hr_delete_external_attendance_import/);
  assert.match(adapter,/getExternalAttendanceImportById/);
  assert.match(adapter,/listRecentExternalAttendanceImports/);
});
