import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const page=read('app/dashboard/attendance/manual-resolution/page.js');
const adapter=read('lib/adapters/attendance-manual-resolution-supabase.js');

test('manual resolution screen delegates storage and mutation to its adapter',()=>{
  assert.match(page,/from '@\/lib\/adapters\/attendance-manual-resolution-supabase'/);
  assert.match(page,/loadAttendanceManualResolutionQueue\(/);
  assert.match(page,/loadAttendanceDayPunches\(/);
  assert.match(page,/resolveAttendanceDayManually\(/);
  for(const forbidden of ["from '@/lib/supabase'",'.from(','.rpc(','hr_resolve_attendance_day_manual','hr_attendance_punches']){
    assert.equal(page.includes(forbidden),false,`manual resolution presentation must not contain ${forbidden}`);
  }
});

test('manual resolution persistence vocabulary stays inside the adapter',()=>{
  assert.match(adapter,/v_hr_attendance_processing_days/);
  assert.match(adapter,/hr_attendance_imports/);
  assert.match(adapter,/hr_attendance_punches/);
  assert.match(adapter,/hr_resolve_attendance_day_manual/);
  assert.match(adapter,/from '@\/lib\/supabase'/);
});
