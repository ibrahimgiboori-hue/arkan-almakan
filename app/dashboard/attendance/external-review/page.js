'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const TYPES = [
  ['sick_leave','إجازة مرضية'],
  ['approved_leave','إجازة معتمدة'],
  ['non_working_day','اليوم غير ضمن أيام العمل'],
  ['outside_work','عمل خارج المركز'],
  ['biometric_device_issue','مشكلة تقنية في جهاز البصمة'],
  ['forgot_punch','نسيان البصمة'],
  ['approved_shift_change','تغيير ساعات دوام / شفت معتمد'],
  ['approved_late_early_permission','إذن تأخير أو خروج معتمد'],
  ['training_meeting_assignment','تدريب / اجتماع / تكليف رسمي'],
  ['other_site_branch','العمل في فرع أو موقع آخر'],
  ['other','أخرى'],
];

const TYPE_LABEL = Object.fromEntries(TYPES);
const STATUS_LABEL = {
  complete:'مكتمل',
  missing_in:'بصمة دخول مفقودة',
  missing_out:'بصمة خروج مفقودة',
  absent:'غياب',
  day_off:'إجازة',
  no_schedule:'ساعات الدوام غير محددة',
  needs_review:'يحتاج مراجعة',
};

const ISSUE_GROUPS = [
  {key:'absence',label:'الغياب',hint:'حالات الغياب فقط',statuses:['absent']},
  {key:'missing_punch',label:'البصمات المفقودة / النسيان',hint:'دخول أو خروج مفقود فقط',statuses:['missing_in','missing_out']},
  {key:'other_review',label:'حالات أخرى تحتاج مراجعة',hint:'حالات التحليل التي تحتاج مراجعة يدوية',statuses:['needs_review']},
];

const TYPE_ALLOWLIST = {
  absence:['sick_leave','approved_leave','non_working_day','outside_work','approved_shift_change','training_meeting_assignment','other_site_branch','other'],
  missing_punch:['biometric_device_issue','forgot_punch','outside_work','approved_late_early_permission','approved_shift_change','training_meeting_assignment','other_site_branch','other'],
  other_review:TYPES.map(([value])=>value),
};

const REVIEW_STATUSES = ['analyzed','justifications','recalculated','ready_to_post'];

function needsReview(day) {
  return ['missing_in','missing_out','absent','needs_review'].includes(day?.day_status);
}

function decision(day) {
  return String(day?.justification_decision || 'pending');
}

function subjectKey(day) {
  return day?.external_person_id || day?.employee_id || `${day?.subject_no || ''}|${day?.subject_name || ''}`;
}

function groupMatches(day, groupKey) {
  const group = ISSUE_GROUPS.find((item)=>item.key===groupKey);
  return !!group?.statuses.includes(day?.day_status);
}

function stateOf(day) {
  if (day?.justification_id && decision(day) === 'accepted') return 'closed_accepted';
  if (day?.justification_id && decision(day) === 'rejected') return 'closed_rejected';
  if (day?.justification_id) return 'client_pending';
  if (needsReview(day)) return 'needs_justification';
  return 'clear';
}

function stateLabel(day) {
  const state = stateOf(day);
  if (state === 'closed_accepted') return 'مغلق — مقبول';
  if (state === 'closed_rejected') return 'مغلق — مرفوض';
  if (state === 'client_pending') return 'بانتظار قرار العميل';
  if (state === 'needs_justification') return 'يحتاج تبرير';
  return 'مكتمل';
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y=value.getFullYear();
    const m=String(value.getMonth()+1).padStart(2,'0');
    const d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0,10);
}

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'object' && value.text != null) return String(value.text).trim();
  if (typeof value === 'object' && value.result != null) return String(value.result).trim();
  return String(value).trim();
}

function safeName(value) {
  return String(value || 'العميل').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim();
}

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

function makePersonList(sourceDays) {
  const map=new Map();
  sourceDays.forEach((day)=>{
    const key=subjectKey(day);
    const current=map.get(key);
    if (!current) map.set(key,{key,no:day.subject_no||'',name:day.subject_name||'غير معروف',count:1});
    else current.count += 1;
  });
  return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar',{sensitivity:'base',numeric:true}));
}

export default function ExternalAttendanceReviewPage() {
  const [imports,setImports] = useState([]);
  const [activeId,setActiveId] = useState('');
  const [days,setDays] = useState([]);
  const [issueGroup,setIssueGroup] = useState('absence');
  const [reviewView,setReviewView] = useState('unjustified');
  const [person,setPerson] = useState('');
  const [selectedIds,setSelectedIds] = useState([]);
  const [type,setType] = useState('');
  const [details,setDetails] = useState('');
  const [reference,setReference] = useState('');
  const [approvedOn,setApprovedOn] = useState('');
  const [editDay,setEditDay] = useState(null);
  const [editType,setEditType] = useState('');
  const [editDetails,setEditDetails] = useState('');
  const [editReference,setEditReference] = useState('');
  const [editApprovedOn,setEditApprovedOn] = useState('');
  const [busy,setBusy] = useState(false);
  const [msg,setMsg] = useState('');
  const [err,setErr] = useState('');
  const clientFileRef = useRef(null);

  const activeImport = useMemo(()=>imports.find((item)=>item.id===activeId) || null,[imports,activeId]);

  async function loadImports(preferredId = '') {
    const q = await supabase.from('hr_attendance_imports')
      .select('id,source_file_name,period_from,period_to,status,processing_scope,client_name_snapshot,client_reference,review_revision,uploaded_at')
      .eq('processing_scope','external')
      .in('status',REVIEW_STATUSES)
      .order('uploaded_at',{ascending:false})
      .limit(40);
    if (q.error) { setErr(q.error.message); return; }
    const list=q.data || [];
    setImports(list);
    const next = preferredId && list.some((item)=>item.id===preferredId)
      ? preferredId
      : activeId && list.some((item)=>item.id===activeId)
        ? activeId
        : list[0]?.id || '';
    setActiveId(next);
  }

  async function loadDays(id = activeId) {
    if (!id) { setDays([]); return; }
    const q = await supabase.from('v_hr_attendance_processing_days')
      .select('*')
      .eq('import_id',id)
      .order('subject_name')
      .order('work_date');
    if (q.error) { setErr(q.error.message); setDays([]); return; }
    setDays(q.data || []);
  }

  useEffect(()=>{ loadImports(); },[]);
  useEffect(()=>{
    setPerson('');
    setSelectedIds([]);
    setMsg('');
    setErr('');
    setEditDay(null);
    loadDays(activeId);
  },[activeId]);

  const needsJustification = useMemo(()=>days.filter((day)=>needsReview(day) && !day.justification_id),[days]);
  const clientPending = useMemo(()=>days.filter((day)=>day.justification_id && decision(day)==='pending'),[days]);
  const closed = useMemo(()=>days.filter((day)=>day.justification_id && ['accepted','rejected'].includes(decision(day))),[days]);

  const unprocessedInGroup = useMemo(()=>needsJustification.filter((day)=>groupMatches(day,issueGroup)),[needsJustification,issueGroup]);
  const pendingPeople = useMemo(()=>makePersonList(unprocessedInGroup),[unprocessedInGroup]);
  const allowedTypes = useMemo(()=>TYPES.filter(([value])=>TYPE_ALLOWLIST[issueGroup]?.includes(value)),[issueGroup]);
  const groupCandidates = useMemo(()=>unprocessedInGroup.filter((day)=>person && subjectKey(day)===person),[unprocessedInGroup,person]);
  const selectedDays = useMemo(()=>groupCandidates.filter((day)=>selectedIds.includes(day.id)),[groupCandidates,selectedIds]);

  const displayed = useMemo(()=>days.filter((day)=>{
    if (!groupMatches(day,issueGroup)) return false;
    const state=stateOf(day);
    if (reviewView==='unjustified' && state!=='needs_justification') return false;
    if (reviewView==='client_pending' && state!=='client_pending') return false;
    if (reviewView==='closed' && !['closed_accepted','closed_rejected'].includes(state)) return false;
    if (person && subjectKey(day)!==person) return false;
    return true;
  }),[days,issueGroup,reviewView,person]);

  const countsByGroup = useMemo(()=>Object.fromEntries(ISSUE_GROUPS.map((group)=>[
    group.key,
    needsJustification.filter((day)=>group.statuses.includes(day.day_status)).length,
  ])),[needsJustification]);

  function chooseIssueGroup(key) {
    setIssueGroup(key);
    setReviewView('unjustified');
    setPerson('');
    setSelectedIds([]);
    setType('');
    setErr('');
  }

  function chooseReviewView(value) {
    setReviewView(value);
    setPerson('');
    setSelectedIds([]);
    setErr('');
  }

  function choosePerson(value) {
    setPerson(value);
    setSelectedIds([]);
  }

  function toggleSelected(id) {
    setSelectedIds((current)=>current.includes(id) ? current.filter((x)=>x!==id) : [...current,id]);
  }

  function selectAllForPerson() {
    if (!person) { setErr('اختر الموظف أولًا.'); return; }
    setErr('');
    setSelectedIds(groupCandidates.map((day)=>day.id));
  }

  async function applyGroupJustification() {
    if (!person) { setErr('اختر موظفًا من قائمة الذين لم يتم تبرير حالاتهم بعد.'); return; }
    if (!selectedDays.length) { setErr('حدد حالة واحدة على الأقل لهذا الموظف.'); return; }
    if (!type) { setErr('اختر نوع التبرير.'); return; }
    if (!TYPE_ALLOWLIST[issueGroup]?.includes(type)) { setErr('هذا التبرير غير متاح لنوع الحالة المحدد حتى لا يحدث خلط بين الغياب والبصمة المفقودة.'); return; }
    if (type==='other' && !details.trim()) { setErr('اكتب تفاصيل التبرير عند اختيار «أخرى».'); return; }

    setBusy(true); setErr(''); setMsg('');
    let applied=0;
    const failures=[];
    for (const day of selectedDays) {
      const q=await supabase.rpc('hr_submit_attendance_justification_v2',{
        p_attendance_day_id:day.id,
        p_justification_type:type,
        p_justification_text:details.trim() || null,
        p_paper_reference:reference.trim() || null,
        p_paper_approved_on:approvedOn || null,
      });
      if (q.error) failures.push(`${day.work_date}: ${q.error.message}`);
      else applied+=1;
    }

    const completedPerson = pendingPeople.find((item)=>item.key===person)?.name || 'الموظف';
    setPerson('');
    setSelectedIds([]);
    setType('');
    setDetails('');
    setReference('');
    setApprovedOn('');
    await loadDays();
    await loadImports(activeId);
    setBusy(false);

    if (failures.length) {
      setErr(`تم تطبيق ${applied} حالة، وتعذر ${failures.length}: ${failures.slice(0,3).join(' | ')}`);
    } else {
      setMsg(`تم تبرير ${applied} حالة لـ ${completedPerson}. اختفى من قائمة العمل الحالية إذا لم تبقَ له حالات غير مبررة من هذا النوع.`);
    }
  }

  function openEdit(day) {
    setEditDay(day);
    setEditType(day.justification_type || '');
    setEditDetails(day.justification_text || '');
    setEditReference(day.paper_reference || '');
    setEditApprovedOn(dateOnly(day.paper_approved_on));
    setErr('');
  }

  async function saveEdit() {
    if (!editDay || !editType) { setErr('اختر نوع التبرير.'); return; }
    if (editType==='other' && !editDetails.trim()) { setErr('اكتب تفاصيل التبرير عند اختيار «أخرى».'); return; }
    setBusy(true); setErr(''); setMsg('');
    const q=await supabase.rpc('hr_submit_attendance_justification_v2',{
      p_attendance_day_id:editDay.id,
      p_justification_type:editType,
      p_justification_text:editDetails.trim() || null,
      p_paper_reference:editReference.trim() || null,
      p_paper_approved_on:editApprovedOn || null,
    });
    setBusy(false);
    if (q.error) { setErr(q.error.message); return; }
    setEditDay(null);
    setMsg('تم تعديل التبرير وأُعيدت الحالة إلى انتظار المراجعة.');
    await loadDays();
    await loadImports(activeId);
  }

  async function exportClientReview() {
    if (!activeImport || !clientPending.length) { setErr('لا توجد حالات مفتوحة بانتظار قرار العميل.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      const {default:ExcelJS}=await import('exceljs');
      const workbook=new ExcelJS.Workbook();
      workbook.creator='Arkan Al-Makan External Attendance Review';
      const lists=workbook.addWorksheet('__lists');
      lists.getCell('A1').value='مقبول';
      lists.getCell('A2').value='مرفوض';
      lists.state='veryHidden';

      const ws=workbook.addWorksheet('مراجعة العميل',{views:[{rightToLeft:true}]});
      ws.views=[{state:'frozen',ySplit:1,rightToLeft:true}];
      ws.columns=[
        {header:'رقم الموظف',key:'no',width:14},
        {header:'الموظف',key:'name',width:28},
        {header:'التاريخ',key:'date',width:14},
        {header:'الحالة الأصلية',key:'status',width:23},
        {header:'نوع التبرير',key:'type',width:30},
        {header:'تفاصيل التبرير',key:'details',width:38},
        {header:'المرجع / المستند',key:'reference',width:24},
        {header:'قرار العميل',key:'decision',width:18},
        {header:'ملاحظة العميل',key:'note',width:34},
        {header:'__batch_id',key:'batch',hidden:true,width:18},
        {header:'__attendance_day_id',key:'day',hidden:true,width:18},
        {header:'__justification_id',key:'justification',hidden:true,width:18},
        {header:'__review_revision',key:'revision',hidden:true,width:12},
      ];

      clientPending.forEach((day)=>ws.addRow({
        no:day.subject_no||'',
        name:day.subject_name||'',
        date:dateOnly(day.work_date),
        status:STATUS_LABEL[day.day_status]||day.day_status||'',
        type:TYPE_LABEL[day.justification_type]||day.justification_type||'',
        details:day.justification_text||'',
        reference:day.paper_reference||'',
        decision:'',
        note:'',
        batch:activeImport.id,
        day:day.id,
        justification:day.justification_id,
        revision:Number(activeImport.review_revision||0),
      }));

      const header=ws.getRow(1);
      header.height=30;
      header.eachCell((cell)=>{
        cell.font={bold:true,color:{argb:'FFFFFFFF'}};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF24364B'}};
        cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
      });
      for(let rowNo=2;rowNo<=ws.lastRow.number;rowNo+=1){
        const row=ws.getRow(rowNo);
        row.height=27;
        for(let col=1;col<=9;col+=1){
          const cell=row.getCell(col);
          cell.alignment={vertical:'middle',horizontal:[2,6,7,9].includes(col)?'right':'center',wrapText:true};
          cell.border={top:{style:'hair',color:{argb:'FFD9E1E8'}},bottom:{style:'hair',color:{argb:'FFD9E1E8'}},left:{style:'hair',color:{argb:'FFD9E1E8'}},right:{style:'hair',color:{argb:'FFD9E1E8'}}};
        }
        [8,9].forEach((col)=>{ row.getCell(col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F7FB'}}; });
        row.getCell(8).dataValidation={type:'list',allowBlank:true,formulae:["'__lists'!$A$1:$A$2"]};
      }
      ws.autoFilter={from:{row:1,column:1},to:{row:1,column:9}};
      ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};

      const note=workbook.addWorksheet('تعليمات');
      note.views=[{rightToLeft:true}];
      note.getColumn(1).width=110;
      note.getCell('A1').value='ملف مراجعة العميل — الحالات المفتوحة فقط';
      note.getCell('A1').font={bold:true,size:16};
      note.getCell('A3').value='يظهر في هذا الملف فقط ما تم تبريره وما زال بانتظار قرار العميل. عدّل «قرار العميل» إلى مقبول أو مرفوض، ويمكن إضافة ملاحظة.';
      note.getCell('A4').value='عمود «الحالة الأصلية» يوضح هل أصل الحالة غياب أم بصمة دخول/خروج مفقودة حتى لا يختلط سبب التبرير على المراجع.';
      note.getCell('A5').value='الحالات التي سبق قبولها أو رفضها لا تظهر هنا لأنها مغلقة. لا تعدّل الأعمدة التقنية المخفية.';
      [3,4,5].forEach((r)=>{note.getCell(r,1).alignment={wrapText:true,horizontal:'right',vertical:'top'};note.getRow(r).height=45;});

      const buffer=await workbook.xlsx.writeBuffer();
      downloadBuffer(buffer,`مراجعة_العميل_${safeName(activeImport.client_name_snapshot)}_${dateOnly(activeImport.period_from)}.xlsx`);
      setMsg(`تم تنزيل ملف مراجعة العميل وفيه ${clientPending.length} حالة مفتوحة فقط.`);
    } catch(e) {
      setErr('تعذر إنشاء ملف مراجعة العميل: '+(e.message||e));
    }
    setBusy(false);
  }

  async function importClientReview(file) {
    if (!file || !activeImport) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const {default:ExcelJS}=await import('exceljs');
      const workbook=new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const ws=workbook.getWorksheet('مراجعة العميل');
      if (!ws) throw new Error('لم أجد ورقة «مراجعة العميل». استخدم الملف الذي تم تنزيله من هذه الشاشة.');
      const headers=['رقم الموظف','الموظف','التاريخ','الحالة الأصلية','نوع التبرير','تفاصيل التبرير','المرجع / المستند','قرار العميل','ملاحظة العميل'];
      headers.forEach((label,index)=>{
        if (cellText(ws.getRow(1).getCell(index+1))!==label) throw new Error('تم تغيير بنية ملف المراجعة. نزّل نسخة جديدة ولا تغيّر ترتيب الأعمدة.');
      });

      const currentById=new Map(days.map((day)=>[String(day.id),day]));
      let applied=0,unchanged=0,conflicts=0,errors=0;
      const problems=[];
      for(let rowNo=2;rowNo<=ws.lastRow.number;rowNo+=1){
        const row=ws.getRow(rowNo);
        const batchId=cellText(row.getCell(10));
        const dayId=cellText(row.getCell(11));
        const justificationId=cellText(row.getCell(12));
        const revision=Number(cellText(row.getCell(13))||0);
        const answer=cellText(row.getCell(8));
        const note=cellText(row.getCell(9));
        if (!dayId) continue;
        if (!answer) { unchanged+=1; continue; }
        if (!['مقبول','مرفوض'].includes(answer)) { errors+=1; problems.push(`صف ${rowNo}: القرار يجب أن يكون «مقبول» أو «مرفوض».`); continue; }
        const current=currentById.get(dayId);
        if (batchId!==activeImport.id || revision!==Number(activeImport.review_revision||0)) { conflicts+=1; problems.push(`صف ${rowNo}: الملف يخص دفعة أو إصدار مراجعة مختلف.`); continue; }
        if (!current || String(current.justification_id||'')!==justificationId || decision(current)!=='pending') { conflicts+=1; problems.push(`صف ${rowNo}: الحالة أغلقت أو تغيرت بعد تنزيل الملف.`); continue; }
        const q=await supabase.rpc('hr_decide_attendance_justification',{
          p_justification_id:justificationId,
          p_decision:answer==='مقبول'?'accepted':'rejected',
          p_decision_note:note||null,
          p_paper_reference:current.paper_reference||null,
          p_paper_approved_on:current.paper_approved_on||null,
        });
        if (q.error) { errors+=1; problems.push(`صف ${rowNo}: ${q.error.message}`); }
        else applied+=1;
      }
      setPerson('');
      setSelectedIds([]);
      await loadDays();
      await loadImports(activeImport.id);
      const summary=`تم تطبيق ${applied} قرار، دون تغيير ${unchanged}، تعارض ${conflicts}، أخطاء ${errors}.`;
      if (problems.length) setErr(`${summary} ${problems.slice(0,5).join(' | ')}`);
      else setMsg(`${summary} الحالات التي تم قبولها أو رفضها أغلقت واختفت من قائمة المفتوح تلقائيًا.`);
    } catch(e) {
      setErr('تعذر رفع مراجعة العميل: '+(e.message||e));
    }
    setBusy(false);
    if (clientFileRef.current) clientFileRef.current.value='';
  }

  async function recalculate() {
    if (!activeImport) return;
    setBusy(true); setErr(''); setMsg('');
    const q=await supabase.rpc('hr_recalculate_attendance_import',{p_import_id:activeImport.id});
    setBusy(false);
    if (q.error) { setErr(q.error.message); return; }
    setMsg('تمت إعادة الاحتساب بعد قرارات المراجعة.');
    await loadImports(activeImport.id);
    await loadDays(activeImport.id);
  }

  const groupTitle=ISSUE_GROUPS.find((item)=>item.key===issueGroup)?.label || '';

  return <div>
    <div className="page-head">
      <div>
        <h1>المراجعة الخارجية</h1>
        <p>كل نوع حالة في مسار مستقل حتى لا تختلط الغيابات بالبصمات المفقودة أثناء التبرير الجماعي.</p>
      </div>
      <Link className="btn ghost" href="/dashboard/attendance">الرجوع إلى معمل الحضور</Link>
    </div>

    {err&&<div className="msg err" style={{marginTop:14}}>{err}</div>}
    {msg&&<div className="msg ok" style={{marginTop:14}}>{msg}</div>}

    <div className="section" style={{marginTop:16}}>
      <header><h2>دفعة العميل</h2><span className="hint">الدفعات القديمة المحذوفة لا تظهر هنا؛ اختر الدفعة الحالية فقط.</span></header>
      <div style={{padding:18}}>
        <div className="field">
          <label>اختر الدفعة</label>
          <select value={activeId} onChange={(e)=>setActiveId(e.target.value)}>
            {!imports.length&&<option value="">لا توجد دفعات خارجية جاهزة للمراجعة</option>}
            {imports.map((item)=><option key={item.id} value={item.id}>{item.client_name_snapshot||'عميل خارجي'} — {item.period_from||''} إلى {item.period_to||''}</option>)}
          </select>
        </div>
        {activeImport&&<div className="stat-grid" style={{marginTop:14}}>
          <div className="stat"><span>بدون تبرير</span><strong>{needsJustification.length}</strong></div>
          <div className="stat"><span>بانتظار قرار العميل</span><strong>{clientPending.length}</strong></div>
          <div className="stat"><span>مغلق بقرار</span><strong>{closed.length}</strong></div>
          <div className="stat"><span>إصدار المراجعة</span><strong>{activeImport.review_revision||0}</strong></div>
        </div>}
      </div>
    </div>

    {activeImport&&<>
      <div className="section">
        <header><h2>اختر أصل الحالة أولًا</h2><span className="hint">هذا الاختيار يقفل التبرير الجماعي على نوع واحد من العمليات.</span></header>
        <div style={{padding:18,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>
          {ISSUE_GROUPS.map((group)=>{
            const active=issueGroup===group.key;
            return <button key={group.key} type="button" className={active?'btn':'btn ghost'} onClick={()=>chooseIssueGroup(group.key)} style={{minHeight:66,justifyContent:'space-between'}}>
              <span><strong>{group.label}</strong><small style={{display:'block',marginTop:4,opacity:.8}}>{group.hint}</small></span>
              <strong>{countsByGroup[group.key]||0}</strong>
            </button>;
          })}
        </div>
      </div>

      <div className="section">
        <header><h2>التبرير الجماعي — {groupTitle}</h2><span className="hint">قائمة الموظفين هنا تعرض فقط من بقيت له حالات غير مبررة من النوع المحدد.</span></header>
        <div style={{padding:18}}>
          <div className="form-grid">
            <div className="field"><label>الموظف غير المعالج</label><select value={person} onChange={(e)=>choosePerson(e.target.value)}><option value="">اختر الموظف</option>{pendingPeople.map((p)=><option key={p.key} value={p.key}>{p.no?`${p.no} - `:''}{p.name} — {p.count} حالة</option>)}</select></div>
            <div className="field"><label>نوع التبرير المناسب لـ {groupTitle}</label><select value={type} onChange={(e)=>setType(e.target.value)}><option value="">اختر</option>{allowedTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field" style={{gridColumn:'1/-1'}}><label>تفاصيل إضافية {type==='other'?'*':'(اختياري)'}</label><textarea rows={3} value={details} onChange={(e)=>setDetails(e.target.value)} /></div>
            <div className="field"><label>مرجع المستند / الاعتماد</label><input value={reference} onChange={(e)=>setReference(e.target.value)} /></div>
            <div className="field"><label>تاريخ الاعتماد</label><input type="date" value={approvedOn} onChange={(e)=>setApprovedOn(e.target.value)} /></div>
          </div>
          <div className="rowsplit" style={{marginTop:14,justifyContent:'flex-start',gap:10,flexWrap:'wrap'}}>
            <button className="btn ghost" type="button" disabled={!person||!groupCandidates.length||busy} onClick={selectAllForPerson}>تحديد كل حالات الموظف من هذا النوع</button>
            <button className="btn ghost" type="button" disabled={!selectedIds.length||busy} onClick={()=>setSelectedIds([])}>إلغاء التحديد</button>
            <button className="btn" type="button" disabled={!selectedDays.length||busy} onClick={applyGroupJustification}>{busy?'جارٍ التطبيق…':`تطبيق التبرير على ${selectedDays.length || 0} حالة`}</button>
          </div>
          {person&&<div style={{overflowX:'auto',marginTop:16}}><table><thead><tr><th style={{width:48}}>تحديد</th><th>التاريخ</th><th>أصل الحالة</th><th>الموظف</th></tr></thead><tbody>{groupCandidates.map((day)=><tr key={day.id}><td><input type="checkbox" checked={selectedIds.includes(day.id)} onChange={()=>toggleSelected(day.id)}/></td><td>{dateOnly(day.work_date)}</td><td><strong>{STATUS_LABEL[day.day_status]||day.day_status}</strong></td><td>{day.subject_name}</td></tr>)}</tbody></table></div>}
          {!pendingPeople.length&&<div className="hint" style={{marginTop:14}}>لا يوجد موظفون متبقون بدون تبرير في فئة «{groupTitle}».</div>}
        </div>
      </div>

      <div className="section">
        <header><h2>ملف مراجعة العميل</h2><span className="hint">يحتوي فقط الحالات التي تم تبريرها وما زالت تنتظر قبولًا أو رفضًا.</span></header>
        <div style={{padding:18}}>
          <div className="rowsplit" style={{justifyContent:'flex-start',gap:10,flexWrap:'wrap'}}>
            <button className="btn ghost" type="button" disabled={!clientPending.length||busy} onClick={exportClientReview}>تنزيل الحالات المفتوحة للعميل Excel</button>
            <button className="btn" type="button" disabled={busy} onClick={()=>clientFileRef.current?.click()}>رفع قرارات العميل</button>
            <input ref={clientFileRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={(e)=>importClientReview(e.target.files?.[0])}/>
            <button className="btn ghost" type="button" disabled={busy} onClick={recalculate}>إعادة الاحتساب بعد القرارات</button>
          </div>
        </div>
      </div>

      <div className="section">
        <header><h2>استعراض حالات {groupTitle}</h2><span className="hint">الافتراضي هو الحالات التي لم يتم تبريرها بعد.</span></header>
        <div style={{padding:18}}>
          <div className="rowsplit" style={{justifyContent:'flex-start',gap:12,alignItems:'end',flexWrap:'wrap'}}>
            <div className="field" style={{minWidth:250}}><label>مرحلة المعالجة</label><select value={reviewView} onChange={(e)=>chooseReviewView(e.target.value)}><option value="unjustified">لم يتم تبريرها بعد</option><option value="client_pending">تم تبريرها — بانتظار العميل</option><option value="closed">مقبولة / مرفوضة — مغلقة</option></select></div>
            {reviewView!=='unjustified'&&<div className="field" style={{minWidth:270}}><label>الموظف</label><select value={person} onChange={(e)=>choosePerson(e.target.value)}><option value="">كل الموظفين</option>{makePersonList(days.filter((day)=>groupMatches(day,issueGroup))).map((p)=><option key={p.key} value={p.key}>{p.no?`${p.no} - `:''}{p.name}</option>)}</select></div>}
          </div>
        </div>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>أصل الحالة</th><th>التبرير</th><th>حالة المراجعة</th><th>إجراء</th></tr></thead><tbody>
          {displayed.map((day)=><tr key={day.id}>
            <td>{day.subject_no?`${day.subject_no} - `:''}{day.subject_name}</td>
            <td>{dateOnly(day.work_date)}</td>
            <td><strong>{STATUS_LABEL[day.day_status]||day.day_status}</strong></td>
            <td>{day.justification_id?<><strong>{TYPE_LABEL[day.justification_type]||day.justification_type||'تبرير مسجل'}</strong>{day.justification_text&&<div className="hint" style={{marginTop:3}}>{day.justification_text}</div>}</>:'—'}</td>
            <td><strong>{stateLabel(day)}</strong></td>
            <td>{day.justification_id?<button type="button" className="btn ghost" onClick={()=>openEdit(day)}>تعديل التبرير</button>:'—'}</td>
          </tr>)}
          {!displayed.length&&<tr><td colSpan={6}><div className="hint" style={{padding:18}}>لا توجد حالات ضمن هذا الفلتر.</div></td></tr>}
        </tbody></table></div>
      </div>
    </>}

    {editDay&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.38)',display:'flex',alignItems:'center',justifyContent:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)setEditDay(null);}}>
      <div className="section" style={{width:'min(720px,96vw)',maxHeight:'90vh',overflowY:'auto',background:'#fff',margin:0}}>
        <header><div><h2>تعديل التبرير</h2><span className="hint">{editDay.subject_name} — {dateOnly(editDay.work_date)} — {STATUS_LABEL[editDay.day_status]||editDay.day_status}</span></div><button className="btn ghost" type="button" disabled={busy} onClick={()=>setEditDay(null)}>إغلاق</button></header>
        <div style={{padding:18}}>
          <div className="form-grid">
            <div className="field"><label>نوع التبرير</label><select value={editType} onChange={(e)=>setEditType(e.target.value)}>{TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>أصل الحالة</label><input disabled value={STATUS_LABEL[editDay.day_status]||editDay.day_status} /></div>
            <div className="field" style={{gridColumn:'1/-1'}}><label>التفاصيل</label><textarea rows={3} value={editDetails} onChange={(e)=>setEditDetails(e.target.value)} /></div>
            <div className="field"><label>المرجع / المستند</label><input value={editReference} onChange={(e)=>setEditReference(e.target.value)} /></div>
            <div className="field"><label>تاريخ الاعتماد</label><input type="date" value={editApprovedOn} onChange={(e)=>setEditApprovedOn(e.target.value)} /></div>
          </div>
          <p className="hint" style={{marginTop:10}}>تعديل التبرير بعد قبوله أو رفضه يعيده إلى «بانتظار قرار العميل» لأن القرار السابق كان على نسخة مختلفة.</p>
          <div style={{marginTop:14}}><button className="btn" type="button" disabled={busy} onClick={saveEdit}>{busy?'جارٍ الحفظ…':'حفظ وإغلاق'}</button></div>
        </div>
      </div>
    </div>}
  </div>;
}
