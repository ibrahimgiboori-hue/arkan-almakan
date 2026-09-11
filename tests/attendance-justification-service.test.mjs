import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAttendanceJustificationService } from '../lib/application/attendance-justification-service.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function fakeRepository(){
  const calls=[];
  return {
    calls,
    repository:{
      async submit(input){calls.push(['submit',input]);return 'j-1';},
      async decide(input){calls.push(['decide',input]);return true;},
    },
  };
}

test('justification service validates and normalizes before persistence',async()=>{
  const fake=fakeRepository();
  const service=createAttendanceJustificationService(fake.repository);
  const id=await service.submit({attendanceDayId:'d-1',type:'other',text:'  مهمة خاصة  ',reference:'  REF-1  '});
  assert.equal(id,'j-1');
  assert.deepEqual(fake.calls[0][1],{attendanceDayId:'d-1',type:'other',text:'مهمة خاصة',reference:'REF-1',approvedOn:null});
  await assert.rejects(()=>service.submit({attendanceDayId:'d-1',type:'other',text:'  '}),/اكتب تفاصيل التبرير/);
});

test('justification service accepts only final review decisions',async()=>{
  const fake=fakeRepository();
  const service=createAttendanceJustificationService(fake.repository);
  await service.decide({justificationId:'j-1',decision:'accepted',note:'  ok  '});
  assert.equal(fake.calls[0][1].note,'ok');
  await assert.rejects(()=>service.decide({justificationId:'j-1',decision:'pending'}),/قرار التبرير غير معتمد/);
});

test('legacy justification dialog no longer knows Supabase or RPC names',()=>{
  const dialog=read('components/attendance/AttendanceJustificationDialog.js');
  assert.match(dialog,/from '@\/lib\/application\/attendance-justification-service'/);
  for(const forbidden of ["from '@/lib/supabase'",'.rpc(','hr_submit_attendance_justification_v2','hr_decide_attendance_justification']){
    assert.equal(dialog.includes(forbidden),false,`dialog must not contain ${forbidden}`);
  }
});
