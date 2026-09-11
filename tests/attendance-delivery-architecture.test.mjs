import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const component=read('components/attendance/AttendanceDeliveryFiles.js');
const adapter=read('lib/adapters/attendance-delivery-supabase.js');

test('delivery presentation delegates persistence to its adapter',()=>{
  assert.match(component,/from '@\/lib\/adapters\/attendance-delivery-supabase'/);
  assert.equal(component.includes("from '@/lib/supabase'"),false);
  assert.equal(component.includes("hr_attendance_delivery_files"),false);
  assert.equal(component.includes('.storage.from('),false);
  assert.equal(component.includes('.from('),false);
});

test('delivery date rendering explicitly keeps Latin digits and Gregorian calendar',()=>{
  assert.match(component,/ar-SA-u-ca-gregory-nu-latn/);
  assert.equal(component.includes("new Intl.DateTimeFormat('ar-SA',"),false);
});

test('delivery persistence details live in the adapter',()=>{
  for(const required of [
    'hr_attendance_delivery_files',
    'listAttendanceDeliveryFiles',
    'createAttendanceDeliveryDownloadUrl',
    'deleteAttendanceDeliveryFile',
  ])assert.match(adapter,new RegExp(required));
});
