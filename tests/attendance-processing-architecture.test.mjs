import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const table=read('components/attendance/AttendanceProcessingTable.js');
const adapter=read('lib/adapters/attendance-processing-supabase.js');

test('processing table delegates submitter reads and review writes',()=>{
  assert.match(table,/from '@\/lib\/adapters\/attendance-processing-supabase'/);
  assert.match(table,/from '@\/lib\/application\/attendance-justification-service'/);
  assert.match(table,/loadAttendanceJustificationSubmitters\(/);
  assert.match(table,/attendanceJustificationService\.submit\(/);
  assert.match(table,/attendanceJustificationService\.decide\(/);
  for(const forbidden of ["from '@/lib/supabase'",'.from(','.rpc(','hr_submit_attendance_justification_v2','hr_decide_attendance_justification','fn_workspace_user_directory']){
    assert.equal(table.includes(forbidden),false,`processing presentation must not contain ${forbidden}`);
  }
});

test('processing submitter storage vocabulary stays inside its adapter',()=>{
  assert.match(adapter,/hr_attendance_justifications/);
  assert.match(adapter,/fn_workspace_user_directory/);
  assert.match(adapter,/from '@\/lib\/supabase'/);
});

test('processing display uses latin digits with gregorian calendar',()=>{
  assert.match(table,/ar-SA-u-ca-gregory-nu-latn/);
  assert.equal(table.includes("new Intl.DateTimeFormat('ar-SA',"),false);
});
