import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const report=read('components/attendance/AttendanceClientExcelReport.js');
const adapter=read('lib/adapters/attendance-report-supabase.js');

test('attendance client report consumes one read model instead of storage tables',()=>{
  assert.match(report,/from '@\/lib\/adapters\/attendance-report-supabase'/);
  assert.match(report,/loadAttendanceReportReadModel\(activeImport\.id\)/);
  for(const forbidden of ["from '@/lib/supabase'",'.from(','.rpc(','v_hr_attendance_processing_days','hr_attendance_punches']){
    assert.equal(report.includes(forbidden),false,`report presentation must not contain ${forbidden}`);
  }
});

test('attendance report storage knowledge stays in its adapter',()=>{
  assert.match(adapter,/loadAttendanceReportReadModel/);
  assert.match(adapter,/v_hr_attendance_processing_days/);
  assert.match(adapter,/hr_attendance_punches/);
  assert.match(adapter,/from '@\/lib\/supabase'/);
});
