import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const panel=read('components/attendance/AttendanceCalibrationPanel.js');
const adapter=read('lib/adapters/attendance-lab-supabase.js');

test('calibration presentation no longer knows Supabase tables or RPC names',()=>{
  assert.match(panel,/from '@\/lib\/adapters\/attendance-lab-supabase'/);
  assert.equal(panel.includes("from '@/lib/supabase'"),false);
  for(const forbidden of [
    'hr_attendance_calibration_proposals',
    'hr_attendance_external_schedules',
    'hr_employee_work_schedules',
    'hr_calibrate_attendance_import',
    'hr_apply_attendance_calibration',
    'hr_analyze_attendance_import',
    '.from(',
    '.rpc(',
  ]){
    assert.equal(panel.includes(forbidden),false,`calibration presentation leaked persistence detail: ${forbidden}`);
  }
});

test('calibration persistence details are owned by the lab adapter',()=>{
  for(const required of [
    'loadAttendanceCalibrationSnapshot',
    'calibrateAttendanceImport',
    'applyAttendanceCalibration',
    'analyzeAttendanceImport',
    'hr_attendance_calibration_proposals',
    'hr_calibrate_attendance_import',
    'hr_apply_attendance_calibration',
    'hr_analyze_attendance_import',
  ]){
    assert.match(adapter,new RegExp(required));
  }
});
