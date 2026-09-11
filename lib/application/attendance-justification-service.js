function requireRepository(repository){
  if(!repository)throw new Error('Attendance justification repository is required.');
  for(const method of ['submit','decide']){
    if(typeof repository[method]!=='function')throw new Error(`Attendance justification repository is missing ${method}.`);
  }
  return repository;
}

export function createAttendanceJustificationService(repository){
  const repo=requireRepository(repository);

  async function submit({attendanceDayId,type,text=null,reference=null,approvedOn=null}){
    if(!attendanceDayId)throw new Error('حالة الحضور غير محددة.');
    if(!type)throw new Error('اختر نوع التبرير.');
    if(type==='other'&&!String(text||'').trim())throw new Error('اكتب تفاصيل التبرير عند اختيار «أخرى».');
    return repo.submit({attendanceDayId,type,text:String(text||'').trim()||null,reference:String(reference||'').trim()||null,approvedOn:approvedOn||null});
  }

  async function decide({justificationId,decision,note=null,reference=null,approvedOn=null}){
    if(!justificationId)throw new Error('التبرير غير محدد.');
    if(!['accepted','rejected'].includes(String(decision||'')))throw new Error('قرار التبرير غير معتمد.');
    return repo.decide({justificationId,decision,note:String(note||'').trim()||null,reference:String(reference||'').trim()||null,approvedOn:approvedOn||null});
  }

  return Object.freeze({submit,decide});
}

let browserServicePromise=null;
async function browserService(){
  if(!browserServicePromise){
    browserServicePromise=import('../adapters/attendance-review-supabase.js').then((adapter)=>createAttendanceJustificationService({
      submit:adapter.submitAttendanceJustification,
      decide:adapter.decideAttendanceJustification,
    }));
  }
  return browserServicePromise;
}

export const attendanceJustificationService=Object.freeze({
  submit:(...args)=>browserService().then((service)=>service.submit(...args)),
  decide:(...args)=>browserService().then((service)=>service.decide(...args)),
});
