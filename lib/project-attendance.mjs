import { selectRosterAssignmentsForDate } from './site-operation-roster.mjs';

export const PROJECT_ATTENDANCE_STATUS=Object.freeze({
  full:Object.freeze({label:'كامل'}),
  half:Object.freeze({label:'نصف يوم'}),
  stopped:Object.freeze({label:'متوقف — حالة محفوظة',protected:true}),
  leave:Object.freeze({label:'إجازة — حالة محفوظة',protected:true}),
});

export const PROJECT_ATTENDANCE_PROTECTED_STATUSES=Object.freeze(['stopped','leave']);
export const PROJECT_ATTENDANCE_LABOR_CLASS=Object.freeze({worker:'عامل',technician:'صنايعي',foreman:'فورمان'});

const protectedSet=new Set(PROJECT_ATTENDANCE_PROTECTED_STATUSES);
const naturalCompare=(a='',b='')=>String(a).localeCompare(String(b),'ar',{numeric:true,sensitivity:'base'});

export function projectAttendanceSourceIds({date,assignmentRows=[],projectContractorRows=[]}={}){
  const assignments=selectRosterAssignmentsForDate(assignmentRows,date);
  return Object.freeze({
    assignments:Object.freeze(assignments),
    contractorIds:Object.freeze([...new Set([
      ...(projectContractorRows||[]).map((row)=>row.contractor_id),
      ...assignments.map((row)=>row.contractor_id),
    ].filter(Boolean))]),
    laborerIds:Object.freeze([...new Set(assignments.map((row)=>row.laborer_id).filter(Boolean))]),
  });
}

export function buildProjectAttendanceWorkspace({date,assignmentRows=[],projectContractorRows=[],contractors=[],laborers=[],attendanceRows=[]}={}){
  const assignments=selectRosterAssignmentsForDate(assignmentRows,date);
  const contractorRows=(contractors||[]).map((contractor)=>{
    const link=(projectContractorRows||[]).find((row)=>row.contractor_id===contractor.id);
    return Object.freeze({...contractor,project_basis:link?.basis||null});
  }).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar));

  const assignmentByWorker=new Map(assignments.map((assignment)=>[assignment.laborer_id,assignment]));
  const workers=(laborers||[]).map((worker)=>{
    const assignment=assignmentByWorker.get(worker.id);
    return Object.freeze({
      ...worker,
      contractor_id:assignment?.contractor_id||null,
      labor_class:assignment?.labor_class||worker.labor_class,
      trade:assignment?.trade||worker.trade,
      daily_rate:assignment?.daily_rate??worker.daily_rate,
      assignment_id:assignment?.id||null,
    });
  }).filter((worker)=>worker.assignment_id).sort((a,b)=>naturalCompare(a.full_name,b.full_name));

  const marks=(attendanceRows||[])
    .filter((row)=>PROJECT_ATTENDANCE_STATUS[row?.status])
    .map((row)=>Object.freeze({
      ...row,
      work_date:date,
      pending:false,
      protected:protectedSet.has(row.status),
    }));

  return Object.freeze({
    contractors:Object.freeze(contractorRows),
    workers:Object.freeze(workers),
    marks:Object.freeze(Object.fromEntries(marks.map((row)=>[row.laborer_id,row]))),
  });
}

export function buildProjectAttendanceWriteRows(entries=[]){
  return Object.freeze((entries||[]).map(({worker,status})=>{
    if(!worker?.id)throw new Error('العامل غير محدد.');
    if(!['full','half'].includes(status))throw new Error('الإدخال السريع يقبل حضور كامل أو نصف يوم فقط.');
    return Object.freeze({
      laborer_id:worker.id,
      status,
      rate_used:Number(worker.daily_rate||0),
    });
  }));
}

export function verifiedProjectAttendanceMarks(snapshot=[],date=''){
  return Object.freeze(Object.fromEntries((Array.isArray(snapshot)?snapshot:[]).map((row)=>[row.laborer_id,Object.freeze({
    ...row,
    work_date:date,
    pending:false,
    protected:protectedSet.has(row.status),
  })])));
}

export function optimisticProjectAttendanceMarks(entries=[],date='',requestId=''){
  return Object.freeze(Object.fromEntries((entries||[]).map(({worker,status})=>[worker.id,Object.freeze({
    id:null,
    laborer_id:worker.id,
    status,
    work_date:date,
    pending:true,
    request_id:requestId,
    protected:false,
  })])));
}

export function groupProjectAttendanceByContractor(contractors=[],workers=[]){
  return (contractors||[]).map((contractor)=>Object.freeze({
    ...contractor,
    workers:Object.freeze((workers||[]).filter((worker)=>worker.contractor_id===contractor.id)),
  }));
}

export function filterProjectAttendanceWorkers(workers=[],contractorId='',search=''){
  const query=String(search||'').trim().toLowerCase();
  return (workers||[])
    .filter((worker)=>!contractorId||worker.contractor_id===contractorId)
    .filter((worker)=>!query||[worker.full_name,worker.trade,PROJECT_ATTENDANCE_LABOR_CLASS[worker.labor_class]].filter(Boolean).some((value)=>String(value).toLowerCase().includes(query)));
}

export function summarizeProjectAttendance(workers=[],marks={}){
  const full=(workers||[]).filter((worker)=>marks?.[worker.id]?.status==='full').length;
  const half=(workers||[]).filter((worker)=>marks?.[worker.id]?.status==='half').length;
  const protectedCount=(workers||[]).filter((worker)=>marks?.[worker.id]?.protected).length;
  return Object.freeze({
    total:(workers||[]).length,
    full,
    half,
    protected:protectedCount,
    absent:Math.max(0,(workers||[]).length-full-half-protectedCount),
  });
}

export function assertProjectAttendanceRemoval(mark,date=''){
  if(!mark?.id)throw new Error('لا يوجد سجل حضور مثبت يمكن إلغاؤه.');
  if(mark.protected)throw new Error('الحالة الحالية حالة تاريخية محفوظة ولا تُلغى من الإدخال السريع.');
  if(mark.pending)throw new Error('الحركة ما زالت بانتظار المزامنة؛ لا يمكن إلغاؤها قبل أن يثبتها الخادم.');
  if(mark.work_date&&date&&mark.work_date!==date)throw new Error('تغيّر اليوم المعروض. أعد فتح اليوم قبل تعديل هذا السجل.');
  return true;
}

export function projectAttendanceCanOverwrite(mark){
  return !mark?.protected&&!mark?.pending;
}
