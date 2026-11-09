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

/** Workers on the project roster for a set of resolved assignments (one per laborer). */
function rosterWorkers(assignments=[],laborers=[]){
  const assignmentByWorker=new Map((assignments||[]).map((assignment)=>[assignment.laborer_id,assignment]));
  return (laborers||[]).map((worker)=>{
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
}

/** The project roster on one day: who can be marked present, with the contractor and rate of that day. */
export function projectAttendanceRosterForDate({date,assignmentRows=[],laborers=[]}={}){
  if(!date)return Object.freeze([]);
  return Object.freeze(rosterWorkers(selectRosterAssignmentsForDate(assignmentRows,date),laborers));
}

export function buildProjectAttendanceWorkspace({date,assignmentRows=[],projectContractorRows=[],contractors=[],laborers=[],attendanceRows=[]}={}){
  const assignments=selectRosterAssignmentsForDate(assignmentRows,date);
  const contractorRows=(contractors||[]).map((contractor)=>{
    const link=(projectContractorRows||[]).find((row)=>row.contractor_id===contractor.id);
    return Object.freeze({...contractor,project_basis:link?.basis||null});
  }).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar));

  const workers=rosterWorkers(assignments,laborers);

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

/* ---------- the attendance ledger: one continuous sheet for the whole project ---------- */

/** One attendance record = one worker on one day. */
export const projectAttendanceLedgerKey=(date,laborerId)=>`${date}|${laborerId}`;

export const PROJECT_ATTENDANCE_MAX_DAYS=92;

/** Days between from and to, inclusive (0 when the range is invalid). */
export function projectAttendanceRangeDays(from,to){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(from||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(to||''))||to<from)return 0;
  const [fy,fm,fd]=from.split('-').map(Number);
  const [ty,tm,td]=to.split('-').map(Number);
  return Math.round((Date.UTC(ty,tm-1,td)-Date.UTC(fy,fm-1,fd))/86400000)+1;
}

/** Ids needed to read a period: contractors linked in the period or assigning labor in it, and every worker involved. */
export function projectAttendanceRangeSourceIds({assignmentRows=[],projectContractorRows=[],attendanceRows=[]}={}){
  return Object.freeze({
    contractorIds:Object.freeze([...new Set([
      ...(projectContractorRows||[]).map((row)=>row.contractor_id),
      ...(assignmentRows||[]).map((row)=>row.contractor_id),
    ].filter(Boolean))]),
    laborerIds:Object.freeze([...new Set([
      ...(assignmentRows||[]).map((row)=>row.laborer_id),
      ...(attendanceRows||[]).map((row)=>row.laborer_id),
    ].filter(Boolean))]),
  });
}

/**
 * Everything the ledger needs for a period. Marks are keyed by date|worker; each record carries the
 * contractor whose assignment covered the worker on that day (falling back to the latest assignment).
 */
export function buildProjectAttendanceLedger({days=[],assignmentRows=[],projectContractorRows=[],contractors=[],laborers=[],attendanceRows=[]}={}){
  const dateByDay=new Map((days||[]).map((day)=>[day.id,day.work_date]));
  const contractorRows=(contractors||[]).map((contractor)=>{
    const link=(projectContractorRows||[]).find((row)=>row.contractor_id===contractor.id);
    return Object.freeze({...contractor,project_basis:link?.basis||null});
  }).sort((a,b)=>naturalCompare(a.name_ar,b.name_ar));
  const laborerById=new Map((laborers||[]).map((worker)=>[worker.id,worker]));
  const marks={};
  for(const row of attendanceRows||[]){
    const date=dateByDay.get(row?.day_id);
    if(!date||!row?.laborer_id||!PROJECT_ATTENDANCE_STATUS[row.status])continue;
    const assignment=selectRosterAssignmentsForDate((assignmentRows||[]).filter((item)=>item.laborer_id===row.laborer_id),date)[0]
      ||[...(assignmentRows||[])].filter((item)=>item.laborer_id===row.laborer_id).sort((a,b)=>String(b.valid_from||'').localeCompare(String(a.valid_from||'')))[0];
    marks[projectAttendanceLedgerKey(date,row.laborer_id)]=Object.freeze({
      ...row,
      work_date:date,
      contractor_id:assignment?.contractor_id||null,
      labor_class:assignment?.labor_class||null,
      trade:assignment?.trade||null,
      pending:false,
      protected:protectedSet.has(row.status),
    });
  }
  return Object.freeze({
    contractors:Object.freeze(contractorRows),
    laborers:Object.freeze([...laborerById.values()].sort((a,b)=>naturalCompare(a.full_name,b.full_name))),
    assignmentRows:Object.freeze([...(assignmentRows||[])]),
    marks:Object.freeze(marks),
  });
}

/**
 * Ledger keys for marks returned by a write on one day (verified snapshot or optimistic).
 * placementOf(laborerId, date) → {contractor_id, labor_class, trade} of that day's assignment.
 */
export function projectAttendanceMarksForLedger(marksByWorker={},date='',placementOf=()=>({})){
  return Object.freeze(Object.fromEntries(Object.values(marksByWorker||{}).map((mark)=>[
    projectAttendanceLedgerKey(date,mark.laborer_id),
    Object.freeze({...mark,work_date:date,...(placementOf(mark.laborer_id,date)||{})}),
  ])));
}

/** Saved records inside the filter, sorted like an Excel log: by date, then contractor, then name. */
export function projectAttendanceLedgerRows({marks={},laborers=[],contractors=[],from='',to='',contractorId='',search=''}={}){
  const workerById=new Map((laborers||[]).map((worker)=>[worker.id,worker]));
  const contractorById=new Map((contractors||[]).map((contractor)=>[contractor.id,contractor]));
  const query=String(search||'').trim().toLowerCase();
  return Object.values(marks||{})
    .filter((mark)=>(!from||mark.work_date>=from)&&(!to||mark.work_date<=to))
    .filter((mark)=>!contractorId||mark.contractor_id===contractorId)
    .map((mark)=>{
      const worker=workerById.get(mark.laborer_id)||{id:mark.laborer_id,full_name:'عامل غير معروف'};
      const contractor=contractorById.get(mark.contractor_id);
      return Object.freeze({
        _id:projectAttendanceLedgerKey(mark.work_date,mark.laborer_id),
        persisted:true,
        date:mark.work_date,
        laborer_id:mark.laborer_id,
        contractor_id:mark.contractor_id||'',
        worker_name:worker.full_name,
        contractor_name:contractor?.operation_alias||contractor?.name_ar||'',
        labor_class:mark.labor_class||worker.labor_class,
        trade:mark.trade||worker.trade,
        mark,
      });
    })
    .filter((row)=>!query||[row.worker_name,row.contractor_name,row.trade,PROJECT_ATTENDANCE_LABOR_CLASS[row.labor_class]].filter(Boolean).some((value)=>String(value).toLowerCase().includes(query)))
    .sort((a,b)=>a.date.localeCompare(b.date)||naturalCompare(a.contractor_name,b.contractor_name)||naturalCompare(a.worker_name,b.worker_name));
}

let ledgerDraftSeq=0;
/** A new ledger row typed or pasted at the bottom of the sheet. */
export function createProjectAttendanceDraft(patch={},makeId=()=>`att-draft-${++ledgerDraftSeq}`){
  return Object.freeze({_id:makeId(),persisted:false,date:'',laborer_id:'',status:'',...patch});
}

/** Totals for what the sheet shows: records, full, half, protected and worked days (full = 1, half = ½). */
export function summarizeProjectAttendanceLedger(rows=[],valueOf=(row)=>row.mark?.status||''){
  let full=0;let half=0;let protectedCount=0;
  for(const row of rows||[]){
    const status=valueOf(row);
    if(status==='full')full+=1;
    else if(status==='half')half+=1;
    else if(PROJECT_ATTENDANCE_STATUS[status]?.protected)protectedCount+=1;
  }
  return Object.freeze({records:full+half+protectedCount,full,half,protected:protectedCount,workedDays:full+half/2});
}

/**
 * Unsaved ledger edits → per-day writes and removals.
 * - changes: { ledgerKey: 'full' | 'half' | '' } on saved records ('' cancels the record → automatic absence).
 * - drafts: new rows {date, laborer_id, status}; a draft without a status is an absence: it writes nothing and clears on save.
 * Protected (stopped/leave) and still-pending records are never overwritten or removed.
 * A worker can be recorded only on a day his project assignment covers.
 */
export function planProjectAttendanceLedger({marks={},changes={},drafts=[],rosterFor=()=>[],from='',to=''}={}){
  const days=new Map();
  const blocked=[];
  const errors=[];
  const planned=new Set();
  const settledDrafts=[];
  const settledChanges=[];
  const dayPlan=(date)=>{if(!days.has(date))days.set(date,{date,entries:[],removals:[]});return days.get(date);};
  const rosterCache=new Map();
  const roster=(date)=>{if(!rosterCache.has(date))rosterCache.set(date,new Map((rosterFor(date)||[]).map((worker)=>[worker.id,worker])));return rosterCache.get(date);};
  const nameOf=(laborerId,date)=>roster(date).get(laborerId)?.full_name||'العامل';

  for(const [key,raw] of Object.entries(changes||{})){
    const mark=marks?.[key];
    if(!mark)continue;
    const wanted=raw||'';
    if((mark.status||'')===wanted){settledChanges.push(key);continue;}
    const date=mark.work_date;
    if(!projectAttendanceCanOverwrite(mark)){
      blocked.push(`${nameOf(mark.laborer_id,date)} (${date}): ${mark.protected?'حالة محفوظة تاريخيًا':'بانتظار المزامنة'}`);
      continue;
    }
    planned.add(key);
    if(wanted==='full'||wanted==='half'){
      const worker=roster(date).get(mark.laborer_id)||{id:mark.laborer_id,daily_rate:mark.rate_used};
      dayPlan(date).entries.push({worker,status:wanted,key,draftId:null});
      continue;
    }
    try{assertProjectAttendanceRemoval(mark,date);dayPlan(date).removals.push({key,mark});}
    catch(error){blocked.push(`${nameOf(mark.laborer_id,date)} (${date}): ${error.message}`);}
  }

  (drafts||[]).forEach((draft,index)=>{
    const label=`الصف الجديد ${index+1}`;
    const status=draft?.status||'';
    if(!status){settledDrafts.push(draft?._id);return;}
    if(!draft.date){errors.push(`${label}: اكتب التاريخ.`);return;}
    if((from&&draft.date<from)||(to&&draft.date>to)){errors.push(`${label}: التاريخ ${draft.date} خارج فترة العرض — وسّع الفلترة لتشمله.`);return;}
    if(!draft.laborer_id){errors.push(`${label}: اختر العامل.`);return;}
    if(status!=='full'&&status!=='half'){errors.push(`${label}: الحضور كامل أو نصف يوم فقط.`);return;}
    const worker=roster(draft.date).get(draft.laborer_id);
    if(!worker){errors.push(`${label}: العامل غير مسند للمشروع في ${draft.date}.`);return;}
    const key=projectAttendanceLedgerKey(draft.date,draft.laborer_id);
    if(planned.has(key)){errors.push(`${label}: ${worker.full_name} مكرر في ${draft.date}.`);return;}
    const mark=marks?.[key];
    if(mark&&!projectAttendanceCanOverwrite(mark)){blocked.push(`${worker.full_name} (${draft.date}): ${mark.protected?'حالة محفوظة تاريخيًا':'بانتظار المزامنة'}`);return;}
    planned.add(key);
    if(mark?.status===status){settledDrafts.push(draft._id);return;}
    dayPlan(draft.date).entries.push({worker,status,key,draftId:draft._id});
  });

  return Object.freeze({
    days:Object.freeze([...days.values()].sort((a,b)=>a.date.localeCompare(b.date))),
    blocked:Object.freeze(blocked),
    errors:Object.freeze(errors),
    settledDrafts:Object.freeze(settledDrafts.filter(Boolean)),
    settledChanges:Object.freeze(settledChanges),
  });
}
