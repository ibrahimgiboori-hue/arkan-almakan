'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AttendanceClientExcelReport from '@/components/attendance/AttendanceClientExcelReport';

const TYPES=[
  ['sick_leave','إجازة مرضية'],['approved_leave','إجازة معتمدة'],['non_working_day','يوم غير مجدول'],
  ['outside_work','مهمة خارجية'],['biometric_device_issue','عطل جهاز البصمة'],['forgot_punch','نسيان البصمة'],
  ['approved_shift_change','تعديل دوام معتمد'],['approved_late_early_permission','إذن تأخير / خروج'],
  ['training_meeting_assignment','تكليف / تدريب / اجتماع'],['other_site_branch','عمل في موقع آخر'],['other','أخرى'],
];
const TYPE_LABEL=Object.fromEntries(TYPES);
const STATUS_LABEL={complete:'مكتمل',missing_in:'دخول مفقود',missing_out:'خروج مفقود',absent:'غياب',day_off:'إجازة',no_schedule:'دوام غير محدد',needs_review:'للمراجعة'};
const GROUPS=[
  {key:'absence',label:'الغياب',statuses:['absent']},
  {key:'missing_punch',label:'البصمات المفقودة',statuses:['missing_in','missing_out']},
];
const TYPE_ALLOWLIST={
  absence:['sick_leave','approved_leave','non_working_day','outside_work','approved_shift_change','training_meeting_assignment','other_site_branch','other'],
  missing_punch:['biometric_device_issue','forgot_punch','outside_work','approved_late_early_permission','approved_shift_change','training_meeting_assignment','other_site_branch','other'],
};
const REVIEW_STATUSES=['analyzed','justifications','recalculated','ready_to_post'];

function subjectKey(day){return day?.external_person_id||day?.employee_id||`${day?.subject_no||''}|${day?.subject_name||''}`;}
function decision(day){return String(day?.justification_decision||'pending');}
function dateOnly(value){
  if(!value)return '';
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  return String(value).slice(0,10);
}
function cellText(cell){
  const value=cell?.value;
  if(value==null)return '';
  if(typeof value==='object'&&value.text!=null)return String(value.text).trim();
  if(typeof value==='object'&&value.result!=null)return String(value.result).trim();
  return String(value).trim();
}
function safeName(value){return String(value||'العميل').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim();}
function downloadBuffer(buffer,filename){
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function peopleList(source=[]){
  const map=new Map();
  source.forEach((day)=>{const key=subjectKey(day);const item=map.get(key);if(item)item.count+=1;else map.set(key,{key,no:day.subject_no||'',name:day.subject_name||'غير معروف',count:1});});
  return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar',{numeric:true,sensitivity:'base'}));
}
function stateOf(day){
  if(day?.justification_id&&decision(day)==='accepted')return 'accepted';
  if(day?.justification_id&&decision(day)==='rejected')return 'rejected';
  if(day?.justification_id)return 'pending';
  return 'unjustified';
}
function stateLabel(day){
  const state=stateOf(day);
  if(state==='accepted')return 'مقبول';if(state==='rejected')return 'مرفوض';if(state==='pending')return 'بانتظار العميل';return 'غير مبرر';
}

export default function ExternalAttendanceReviewPage(){
  const [imports,setImports]=useState([]);
  const [activeId,setActiveId]=useState('');
  const [days,setDays]=useState([]);
  const [group,setGroup]=useState('absence');
  const [view,setView]=useState('unjustified');
  const [person,setPerson]=useState('');
  const [selectedIds,setSelectedIds]=useState([]);
  const [type,setType]=useState('');
  const [details,setDetails]=useState('');
  const [reference,setReference]=useState('');
  const [approvedOn,setApprovedOn]=useState('');
  const [editDay,setEditDay]=useState(null);
  const [editType,setEditType]=useState('');
  const [editDetails,setEditDetails]=useState('');
  const [editReference,setEditReference]=useState('');
  const [editApprovedOn,setEditApprovedOn]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  const clientFileRef=useRef(null);

  const activeImport=useMemo(()=>imports.find((x)=>x.id===activeId)||null,[imports,activeId]);

  async function loadImports(preferred=''){
    const q=await supabase.from('hr_attendance_imports').select('id,source_file_name,period_from,period_to,status,processing_scope,client_name_snapshot,client_reference,review_revision,uploaded_at')
      .eq('processing_scope','external').in('status',REVIEW_STATUSES).order('uploaded_at',{ascending:false}).limit(40);
    if(q.error){setErr(q.error.message);return;}
    const list=q.data||[];setImports(list);
    setActiveId((current)=>preferred&&list.some((x)=>x.id===preferred)?preferred:current&&list.some((x)=>x.id===current)?current:(list[0]?.id||''));
  }
  async function loadDays(id=activeId){
    if(!id){setDays([]);return;}
    const q=await supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id',id).order('subject_name').order('work_date');
    if(q.error){setErr(q.error.message);setDays([]);return;}setDays(q.data||[]);
  }
  async function refresh(){await loadDays(activeId);await loadImports(activeId);}

  useEffect(()=>{loadImports();},[]);
  useEffect(()=>{setPerson('');setSelectedIds([]);setMsg('');setErr('');setEditDay(null);loadDays(activeId);},[activeId]);

  const technical=useMemo(()=>days.filter((d)=>d.day_status==='needs_review'),[days]);
  const reviewable=useMemo(()=>days.filter((d)=>['absent','missing_in','missing_out'].includes(d.day_status)),[days]);
  const needsJustification=useMemo(()=>reviewable.filter((d)=>!d.justification_id),[reviewable]);
  const clientPending=useMemo(()=>reviewable.filter((d)=>d.justification_id&&decision(d)==='pending'),[reviewable]);
  const closed=useMemo(()=>reviewable.filter((d)=>d.justification_id&&['accepted','rejected'].includes(decision(d))),[reviewable]);
  const groupDef=GROUPS.find((g)=>g.key===group)||GROUPS[0];
  const groupOpen=useMemo(()=>needsJustification.filter((d)=>groupDef.statuses.includes(d.day_status)),[needsJustification,groupDef]);
  const pendingPeople=useMemo(()=>peopleList(groupOpen),[groupOpen]);
  const candidates=useMemo(()=>groupOpen.filter((d)=>person&&subjectKey(d)===person),[groupOpen,person]);
  const selected=useMemo(()=>candidates.filter((d)=>selectedIds.includes(d.id)),[candidates,selectedIds]);
  const allowedTypes=useMemo(()=>TYPES.filter(([key])=>TYPE_ALLOWLIST[group]?.includes(key)),[group]);
  const readyForFinal=technical.length===0&&needsJustification.length===0&&clientPending.length===0;
  const resultApproved=readyForFinal&&['recalculated','ready_to_post'].includes(activeImport?.status);

  const displayed=useMemo(()=>reviewable.filter((d)=>{
    if(!groupDef.statuses.includes(d.day_status))return false;
    const state=stateOf(d);
    if(view==='unjustified'&&state!=='unjustified')return false;
    if(view==='pending'&&state!=='pending')return false;
    if(view==='closed'&&!['accepted','rejected'].includes(state))return false;
    if(person&&subjectKey(d)!==person)return false;
    return true;
  }),[reviewable,groupDef,view,person]);

  function chooseGroup(key){setGroup(key);setView('unjustified');setPerson('');setSelectedIds([]);setType('');setErr('');}
  function chooseView(value){setView(value);setPerson('');setSelectedIds([]);setErr('');}
  function choosePerson(value){setPerson(value);setSelectedIds([]);}
  function toggle(id){setSelectedIds((current)=>current.includes(id)?current.filter((x)=>x!==id):[...current,id]);}

  async function ensureReviewStarted(){
    if(activeImport?.status!=='analyzed')return true;
    const q=await supabase.rpc('hr_start_attendance_review',{p_import_id:activeImport.id});
    if(q.error){setErr(q.error.message);return false;}
    return true;
  }

  async function applyGroup(){
    if(!person){setErr('اختر الموظف.');return;}if(!selected.length){setErr('حدد حالة واحدة على الأقل.');return;}if(!type){setErr('اختر التبرير.');return;}
    if(!TYPE_ALLOWLIST[group]?.includes(type)){setErr('هذا التبرير غير متاح لهذه الحالة.');return;}if(type==='other'&&!details.trim()){setErr('أدخل تفاصيل التبرير.');return;}
    setBusy(true);setErr('');setMsg('');
    if(!(await ensureReviewStarted())){setBusy(false);return;}
    let applied=0;const failed=[];
    for(const day of selected){
      const q=await supabase.rpc('hr_submit_attendance_justification_v2',{p_attendance_day_id:day.id,p_justification_type:type,p_justification_text:details.trim()||null,p_paper_reference:reference.trim()||null,p_paper_approved_on:approvedOn||null});
      if(q.error)failed.push(`${day.work_date}: ${q.error.message}`);else applied+=1;
    }
    setPerson('');setSelectedIds([]);setType('');setDetails('');setReference('');setApprovedOn('');await refresh();setBusy(false);
    if(failed.length)setErr(`تم حفظ ${applied} وتعذر ${failed.length}. ${failed.slice(0,2).join(' | ')}`);else setMsg(`تم حفظ ${applied} حالة.`);
  }

  function openEdit(day){setEditDay(day);setEditType(day.justification_type||'');setEditDetails(day.justification_text||'');setEditReference(day.paper_reference||'');setEditApprovedOn(dateOnly(day.paper_approved_on));setErr('');}
  async function saveEdit(){
    if(!editDay||!editType){setErr('اختر التبرير.');return;}if(editType==='other'&&!editDetails.trim()){setErr('أدخل تفاصيل التبرير.');return;}
    setBusy(true);setErr('');setMsg('');
    const q=await supabase.rpc('hr_submit_attendance_justification_v2',{p_attendance_day_id:editDay.id,p_justification_type:editType,p_justification_text:editDetails.trim()||null,p_paper_reference:editReference.trim()||null,p_paper_approved_on:editApprovedOn||null});
    setBusy(false);if(q.error){setErr(q.error.message);return;}setEditDay(null);setMsg('تم تحديث التبرير.');await refresh();
  }

  async function exportClientReview(){
    if(!activeImport||!clientPending.length){setErr('لا توجد حالات بانتظار العميل.');return;}
    setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();
      const lists=wb.addWorksheet('__lists');lists.getCell('A1').value='مقبول';lists.getCell('A2').value='مرفوض';lists.state='veryHidden';
      const ws=wb.addWorksheet('مراجعة العميل',{views:[{rightToLeft:true,state:'frozen',ySplit:1}]});
      ws.columns=[
        {header:'رقم الموظف',key:'no',width:14},{header:'الموظف',key:'name',width:28},{header:'التاريخ',key:'date',width:14},{header:'الحالة',key:'status',width:20},
        {header:'التبرير',key:'type',width:26},{header:'التفاصيل',key:'details',width:34},{header:'المرجع',key:'reference',width:22},{header:'قرار العميل',key:'decision',width:16},{header:'ملاحظة',key:'note',width:30},
        {header:'__batch_id',key:'batch',hidden:true},{header:'__attendance_day_id',key:'day',hidden:true},{header:'__justification_id',key:'justification',hidden:true},{header:'__review_revision',key:'revision',hidden:true},
      ];
      clientPending.forEach((d)=>ws.addRow({no:d.subject_no||'',name:d.subject_name||'',date:dateOnly(d.work_date),status:STATUS_LABEL[d.day_status]||d.day_status||'',type:TYPE_LABEL[d.justification_type]||d.justification_type||'',details:d.justification_text||'',reference:d.paper_reference||'',decision:'',note:'',batch:activeImport.id,day:d.id,justification:d.justification_id,revision:Number(activeImport.review_revision||0)}));
      const header=ws.getRow(1);header.height=28;header.eachCell((cell)=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};});
      for(let r=2;r<=ws.lastRow.number;r++){const row=ws.getRow(r);row.height=24;for(let c=1;c<=9;c++){const cell=row.getCell(c);cell.alignment={vertical:'middle',horizontal:[2,6,7,9].includes(c)?'right':'center',wrapText:true};}row.getCell(8).dataValidation={type:'list',allowBlank:true,formulae:["'__lists'!$A$1:$A$2"]};}
      ws.autoFilter={from:{row:1,column:1},to:{row:1,column:9}};ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
      const info=wb.addWorksheet('تعليمات');info.views=[{rightToLeft:true}];info.getColumn(1).width=100;info.getCell('A1').value='أدخل قرار العميل: مقبول أو مرفوض. لا تعدّل الأعمدة المخفية.';info.getCell('A1').alignment={wrapText:true,horizontal:'right'};
      downloadBuffer(await wb.xlsx.writeBuffer(),`مراجعة_${safeName(activeImport.client_name_snapshot)}_${dateOnly(activeImport.period_from)}.xlsx`);setMsg(`تم تنزيل ${clientPending.length} حالة.`);
    }catch(e){setErr('تعذر إنشاء الملف: '+(e.message||e));}setBusy(false);
  }

  async function importClientReview(file){
    if(!file||!activeImport)return;setBusy(true);setErr('');setMsg('');
    try{
      const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());const ws=wb.getWorksheet('مراجعة العميل');
      if(!ws)throw new Error('ورقة «مراجعة العميل» غير موجودة.');
      const aliases=[['رقم الموظف'],['الموظف'],['التاريخ'],['الحالة','الحالة الأصلية'],['التبرير','نوع التبرير'],['التفاصيل','تفاصيل التبرير'],['المرجع','المرجع / المستند'],['قرار العميل'],['ملاحظة','ملاحظة العميل']];
      aliases.forEach((names,index)=>{if(!names.includes(cellText(ws.getRow(1).getCell(index+1))))throw new Error('بنية الملف غير مطابقة. استخدم الملف الصادر من البرنامج.');});
      const currentById=new Map(days.map((d)=>[String(d.id),d]));let applied=0,unchanged=0,conflicts=0,errors=0;const problems=[];
      for(let r=2;r<=ws.lastRow.number;r++){
        const row=ws.getRow(r);const batchId=cellText(row.getCell(10));const dayId=cellText(row.getCell(11));const justificationId=cellText(row.getCell(12));const revision=Number(cellText(row.getCell(13))||0);const answer=cellText(row.getCell(8));const note=cellText(row.getCell(9));
        if(!dayId)continue;if(!answer){unchanged+=1;continue;}if(!['مقبول','مرفوض'].includes(answer)){errors+=1;problems.push(`صف ${r}: قرار غير صحيح.`);continue;}
        const target=answer==='مقبول'?'accepted':'rejected';const current=currentById.get(dayId);
        if(current&&String(current.justification_id||'')===justificationId&&decision(current)===target){unchanged+=1;continue;}
        if(batchId!==activeImport.id||revision!==Number(activeImport.review_revision||0)){conflicts+=1;problems.push(`صف ${r}: نسخة قديمة.`);continue;}
        if(!current||String(current.justification_id||'')!==justificationId||decision(current)!=='pending'){conflicts+=1;problems.push(`صف ${r}: الحالة تغيرت.`);continue;}
        const q=await supabase.rpc('hr_decide_attendance_justification',{p_justification_id:justificationId,p_decision:target,p_decision_note:note||null,p_paper_reference:current.paper_reference||null,p_paper_approved_on:current.paper_approved_on||null});
        if(q.error){errors+=1;problems.push(`صف ${r}: ${q.error.message}`);}else applied+=1;
      }
      setPerson('');setSelectedIds([]);await refresh();
      const summary=`تم تطبيق ${applied} قرار${unchanged?`، ${unchanged} دون تغيير`:''}${conflicts?`، ${conflicts} تعارض`:''}${errors?`، ${errors} خطأ`:''}.`;
      if(problems.length)setErr(`${summary} ${problems.slice(0,3).join(' | ')}`);else setMsg(summary);
    }catch(e){setErr('تعذر رفع الملف: '+(e.message||e));}
    setBusy(false);if(clientFileRef.current)clientFileRef.current.value='';
  }

  async function approveResult(){
    if(!activeImport||!readyForFinal)return;setBusy(true);setErr('');setMsg('');
    const q=await supabase.rpc('hr_recalculate_attendance_import',{p_import_id:activeImport.id});setBusy(false);
    if(q.error){setErr(q.error.message);return;}setMsg('تم اعتماد النتيجة.');await refresh();
  }

  return <div>
    <div className="page-head"><div><h1>مراجعة الحضور</h1></div><Link className="btn ghost" href="/dashboard/attendance">الحضور</Link></div>
    {err&&<div className="msg err" style={{marginTop:12}}>{err}</div>}{msg&&<div className="msg ok" style={{marginTop:12}}>{msg}</div>}

    <div className="section" style={{marginTop:16}}><header><h2>دفعة العميل</h2></header><div style={{padding:18}}>
      <div className="field"><label>العميل والفترة</label><select value={activeId} onChange={(e)=>setActiveId(e.target.value)}><option value="">اختر</option>{imports.map((item)=><option key={item.id} value={item.id}>{item.client_name_snapshot||'عميل خارجي'} — {item.period_from||''} إلى {item.period_to||''}</option>)}</select></div>
      {activeImport&&<div className="stat-grid" style={{marginTop:14}}><div className="stat"><span>غير مبرر</span><strong>{needsJustification.length}</strong></div><div className="stat"><span>بانتظار العميل</span><strong>{clientPending.length}</strong></div><div className="stat"><span>تمت المراجعة</span><strong>{closed.length}</strong></div></div>}
    </div></div>

    {activeImport&&<>
      {technical.length>0&&<div className="section"><div style={{padding:18,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><strong>{technical.length} حالة تحتاج مراجعة قبل التبريرات.</strong><Link className="btn" href="/dashboard/attendance/manual-resolution">مراجعة الحالات</Link></div></div>}

      <div className="section"><header><h2>التبريرات</h2><div style={{display:'flex',gap:8}}>{GROUPS.map((g)=><button key={g.key} type="button" className={group===g.key?'btn':'btn ghost'} onClick={()=>chooseGroup(g.key)}>{g.label} ({needsJustification.filter((d)=>g.statuses.includes(d.day_status)).length})</button>)}</div></header>
        <div style={{padding:18}}>
          <div className="form-grid"><div className="field"><label>الموظف</label><select value={person} onChange={(e)=>choosePerson(e.target.value)}><option value="">اختر</option>{pendingPeople.map((p)=><option key={p.key} value={p.key}>{p.no?`${p.no} - `:''}{p.name} — {p.count}</option>)}</select></div><div className="field"><label>التبرير</label><select value={type} onChange={(e)=>setType(e.target.value)}><option value="">اختر</option>{allowedTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field" style={{gridColumn:'1/-1'}}><label>ملاحظات {type==='other'?'*':''}</label><textarea rows={2} value={details} onChange={(e)=>setDetails(e.target.value)}/></div><div className="field"><label>مرجع المستند</label><input value={reference} onChange={(e)=>setReference(e.target.value)}/></div><div className="field"><label>تاريخ الاعتماد</label><input type="date" value={approvedOn} onChange={(e)=>setApprovedOn(e.target.value)}/></div></div>
          {person&&<><div className="rowsplit" style={{marginTop:12,justifyContent:'flex-start',gap:8,flexWrap:'wrap'}}><button className="btn ghost" type="button" disabled={!candidates.length||busy} onClick={()=>setSelectedIds(candidates.map((d)=>d.id))}>تحديد الكل</button><button className="btn ghost" type="button" disabled={!selectedIds.length||busy} onClick={()=>setSelectedIds([])}>إلغاء التحديد</button><button className="btn" type="button" disabled={!selected.length||busy} onClick={applyGroup}>{busy?'جارٍ الحفظ…':`حفظ (${selected.length})`}</button></div><div style={{overflowX:'auto',marginTop:12}}><table><thead><tr><th style={{width:48}}>تحديد</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>{candidates.map((d)=><tr key={d.id}><td><input type="checkbox" checked={selectedIds.includes(d.id)} onChange={()=>toggle(d.id)}/></td><td>{dateOnly(d.work_date)}</td><td>{STATUS_LABEL[d.day_status]||d.day_status}</td></tr>)}</tbody></table></div></>}
          {!pendingPeople.length&&<div className="hint" style={{marginTop:10}}>لا توجد حالات غير مبررة في هذه الفئة.</div>}
        </div>
      </div>

      <div className="section"><header><h2>قرار العميل</h2></header><div style={{padding:18,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        {clientPending.length>0&&<><button className="btn ghost" disabled={busy} onClick={exportClientReview}>تنزيل ملف العميل ({clientPending.length})</button><button className="btn" disabled={busy} onClick={()=>clientFileRef.current?.click()}>رفع قرارات العميل</button></>}
        <input ref={clientFileRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={(e)=>importClientReview(e.target.files?.[0])}/>
        {!clientPending.length&&needsJustification.length>0&&<strong>أكمل التبريرات أولًا.</strong>}
        {readyForFinal&&!resultApproved&&<button className="btn" disabled={busy} onClick={approveResult}>{busy?'جارٍ الاعتماد…':'اعتماد النتيجة'}</button>}
        {resultApproved&&<><AttendanceClientExcelReport activeImport={activeImport} disabled={busy}/><Link className="btn ghost" href="/dashboard/attendance/payroll">الرواتب</Link></>}
      </div></div>

      <div className="section"><header><h2>الحالات</h2></header><div style={{padding:18}}><div className="rowsplit" style={{justifyContent:'flex-start',gap:10,alignItems:'end',flexWrap:'wrap'}}><div className="field"><label>الحالة</label><select value={view} onChange={(e)=>chooseView(e.target.value)}><option value="unjustified">غير مبررة</option><option value="pending">بانتظار العميل</option><option value="closed">مراجعة مكتملة</option></select></div>{view!=='unjustified'&&<div className="field"><label>الموظف</label><select value={person} onChange={(e)=>choosePerson(e.target.value)}><option value="">الكل</option>{peopleList(reviewable.filter((d)=>groupDef.statuses.includes(d.day_status))).map((p)=><option key={p.key} value={p.key}>{p.no?`${p.no} - `:''}{p.name}</option>)}</select></div>}</div></div>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>الحالة</th><th>التبرير</th><th>القرار</th><th>إجراء</th></tr></thead><tbody>{displayed.map((d)=><tr key={d.id}><td>{d.subject_no?`${d.subject_no} - `:''}{d.subject_name}</td><td>{dateOnly(d.work_date)}</td><td><strong>{STATUS_LABEL[d.day_status]||d.day_status}</strong></td><td>{d.justification_id?(TYPE_LABEL[d.justification_type]||d.justification_type||'مسجل'):'—'}</td><td><strong>{stateLabel(d)}</strong></td><td>{d.justification_id?<button type="button" className="btn ghost" onClick={()=>openEdit(d)}>تعديل</button>:'—'}</td></tr>)}{!displayed.length&&<tr><td colSpan={6}><div className="hint" style={{padding:14}}>لا توجد حالات.</div></td></tr>}</tbody></table></div>
      </div>
    </>}

    {editDay&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.38)',display:'flex',alignItems:'center',justifyContent:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)setEditDay(null);}}><div className="section" style={{width:'min(720px,96vw)',maxHeight:'90vh',overflowY:'auto',background:'#fff',margin:0}}><header><div><h2>تعديل التبرير</h2><span className="hint">{editDay.subject_name} — {dateOnly(editDay.work_date)}</span></div><button className="btn ghost" disabled={busy} onClick={()=>setEditDay(null)}>إغلاق</button></header><div style={{padding:18}}><div className="form-grid"><div className="field"><label>التبرير</label><select value={editType} onChange={(e)=>setEditType(e.target.value)}>{TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>مرجع المستند</label><input value={editReference} onChange={(e)=>setEditReference(e.target.value)}/></div><div className="field"><label>تاريخ الاعتماد</label><input type="date" value={editApprovedOn} onChange={(e)=>setEditApprovedOn(e.target.value)}/></div><div className="field" style={{gridColumn:'1/-1'}}><label>ملاحظات</label><textarea rows={3} value={editDetails} onChange={(e)=>setEditDetails(e.target.value)}/></div></div><div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}><button className="btn ghost" disabled={busy} onClick={()=>setEditDay(null)}>إلغاء</button><button className="btn" disabled={busy} onClick={saveEdit}>{busy?'جارٍ الحفظ…':'حفظ'}</button></div></div></div></div>}
  </div>;
}
