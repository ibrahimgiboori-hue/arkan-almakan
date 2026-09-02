'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import AttendanceCalibrationPanel from '@/components/attendance/AttendanceCalibrationPanel';
import AttendanceClientExcelReport from '@/components/attendance/AttendanceClientExcelReport';
import AttendanceProcessingTable from '@/components/attendance/AttendanceProcessingTable';
import AttendanceJustificationDialog from '@/components/attendance/AttendanceJustificationDialog';

const WEEKDAYS = [
  {weekday:0,label:'الأحد'}, {weekday:1,label:'الاثنين'}, {weekday:2,label:'الثلاثاء'},
  {weekday:3,label:'الأربعاء'}, {weekday:4,label:'الخميس'}, {weekday:5,label:'الجمعة'}, {weekday:6,label:'السبت'},
];

const STATUS_AR = {
  complete:'مكتمل', missing_in:'بصمة دخول مفقودة', missing_out:'بصمة خروج مفقودة',
  absent:'غياب', day_off:'إجازة', no_schedule:'ساعات الدوام غير محددة', needs_review:'يحتاج مراجعة',
};

const STAGE_AR = {
  uploaded:'مرفوع', parsed:'تم الاستخراج', calibrated:'تمت معايرة ساعات الدوام', analyzed:'تم التحليل', justifications:'معالجة التبريرات',
  recalculated:'أعيد الاحتساب', ready_to_post:'جاهز للترحيل / التسليم', posted:'مرحّل إلى HR',
  closed:'مغلق ومسلّم', failed:'فشل', superseded:'مستبدل',
};

const STAGE_ORDER = ['parsed','calibrated','analyzed','justifications','recalculated','ready_to_post','posted'];

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ','T'));
  if (Number.isNaN(d.getTime())) return String(value).slice(11,16) || '—';
  return new Intl.DateTimeFormat('ar-SA',{hour:'2-digit',minute:'2-digit',hour12:true}).format(d);
}

function fmtMinutes(value) {
  const n = Number(value || 0);
  if (!n) return '0د';
  const h = Math.floor(Math.abs(n) / 60);
  const m = Math.abs(n) % 60;
  return h ? `${h}س ${m}د` : `${m}د`;
}

function deviationText(value, earlyWord, lateWord) {
  const n = Number(value || 0);
  if (!n) return 'في الموعد';
  return n < 0 ? `${earlyWord} ${Math.abs(n)}د` : `${lateWord} ${n}د`;
}

function blankDays() {
  return WEEKDAYS.map((d) => ({...d,is_workday:d.weekday !== 5,start_time:'',end_time:'',notes:''}));
}

function localTimestamp(date) {
  const pad = (n) => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizePunchTimestamp(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${String(m[4]).padStart(2,'0')}:${m[5]}:${m[6] || '00'}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : localTimestamp(d);
}

function stageIndex(status) {
  if (status === 'closed') return STAGE_ORDER.length;
  return STAGE_ORDER.indexOf(status);
}

export default function EmployeeAttendancePage() {
  const me = useDashboardSession();
  const isPrimary = me?.actionContext?.isPrimaryUser === true;
  const canPost = isPrimary || me?.capabilityKeys?.has?.('hr.attendance.post');

  const [imports,setImports] = useState([]);
  const [activeId,setActiveId] = useState('');
  const [activeImport,setActiveImport] = useState(null);
  const [days,setDays] = useState([]);
  const [events,setEvents] = useState([]);
  const [employees,setEmployees] = useState([]);
  const [externalPeople,setExternalPeople] = useState([]);

  const [newScope,setNewScope] = useState('internal');
  const [clientName,setClientName] = useState('');
  const [clientReference,setClientReference] = useState('');
  const [file,setFile] = useState(null);
  const [parsedRows,setParsedRows] = useState([]);

  const [subjectId,setSubjectId] = useState('');
  const [scheduleId,setScheduleId] = useState(null);
  const [scheduleName,setScheduleName] = useState('الدوام الأساسي');
  const [validFrom,setValidFrom] = useState('');
  const [validTo,setValidTo] = useState('');
  const [scheduleDays,setScheduleDays] = useState(blankDays());
  const [bulkStart,setBulkStart] = useState('');
  const [bulkEnd,setBulkEnd] = useState('');

  const [selectedDay,setSelectedDay] = useState(null);
  const [justification,setJustification] = useState({id:null,text:'',paper_reference:'',paper_approved_on:'',decision:'pending',decision_note:''});
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');

  const punchCount = useMemo(() => parsedRows.filter((r)=>r.punch_local).length, [parsedRows]);

  const summary = useMemo(() => days.reduce((a,d) => {
    a.total += 1;
    a[d.day_status] = (a[d.day_status] || 0) + 1;
    a.pre += Number(d.preliminary_deduction_days || 0);
    a.final += Number(d.final_deduction_days || 0);
    a.work += Number(d.worked_minutes || 0);
    return a;
  },{total:0,complete:0,missing_in:0,missing_out:0,absent:0,day_off:0,no_schedule:0,needs_review:0,pre:0,final:0,work:0}), [days]);

  async function loadImports(selectId = null) {
    const q = await supabase.from('hr_attendance_imports')
      .select('id,source_file_name,period_from,period_to,status,processing_scope,client_name_snapshot,client_reference,rows_received,matched_punches,unmatched_punches,review_revision,uploaded_at')
      .order('uploaded_at',{ascending:false}).limit(30);
    if (q.error) { setErr(q.error.message); return; }
    setImports(q.data || []);
    const target = selectId || activeId || q.data?.[0]?.id || '';
    if (target && target !== activeId) setActiveId(target);
  }

  async function loadEmployees() {
    const q = await supabase.from('employees').select('id,employee_no,full_name_ar,status').order('employee_no');
    if (q.error) setErr(q.error.message); else setEmployees(q.data || []);
  }

  async function loadActive(id) {
    if (!id) { setActiveImport(null); setDays([]); setEvents([]); setExternalPeople([]); return; }
    const [iQ,dQ,eQ,pQ] = await Promise.all([
      supabase.from('hr_attendance_imports').select('*').eq('id',id).single(),
      supabase.from('v_hr_attendance_processing_days').select('*').eq('import_id',id).order('work_date').order('subject_no'),
      supabase.from('hr_attendance_processing_events').select('*').eq('import_id',id).order('created_at'),
      supabase.from('hr_attendance_external_people').select('*').eq('import_id',id).order('external_employee_no').order('external_employee_name'),
    ]);
    if (iQ.error) { setErr(iQ.error.message); return; }
    setActiveImport(iQ.data);
    setDays(dQ.error ? [] : (dQ.data || []));
    setEvents(eQ.error ? [] : (eQ.data || []));
    setExternalPeople(pQ.error ? [] : (pQ.data || []));
    setSubjectId(''); setScheduleId(null); setScheduleName('الدوام الأساسي'); setValidFrom(iQ.data?.period_from || ''); setValidTo(iQ.data?.period_to || ''); setScheduleDays(blankDays());
  }

  useEffect(() => { loadEmployees(); loadImports(); }, []);
  useEffect(() => { loadActive(activeId); }, [activeId]);

  async function readAttendanceFile(nextFile) {
    setErr(''); setMsg(''); setFile(nextFile || null); setParsedRows([]);
    if (!nextFile) return;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await nextFile.arrayBuffer(),{type:'array',cellDates:true});
      const rows = [];
      const roster = new Map();
      workbook.SheetNames.forEach((sheetName) => {
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:false,dateNF:'yyyy-mm-dd hh:mm:ss',defval:''});
        let sheetIdentity = null;
        matrix.forEach((r,index) => {
          const name = String(r?.[0] ?? '').trim();
          const no = String(r?.[1] ?? '').trim();
          if ((name || no) && !sheetIdentity) sheetIdentity = {employee_name:name || sheetName,employee_no:no,source_sheet:sheetName};
          if (name || no) roster.set(`${no}|${name || sheetName}`,{employee_name:name || sheetName,employee_no:no,source_sheet:sheetName});
          const punch = normalizePunchTimestamp(r?.[2]);
          if (!punch) return;
          rows.push({employee_name:name || sheetIdentity?.employee_name || sheetName,employee_no:no || sheetIdentity?.employee_no || '',punch_local:punch,source_sheet:sheetName,source_row:index+1,raw_payload:r?.[3]?{source_note:String(r[3])}:{}});
        });
        if (!sheetIdentity && sheetName) roster.set(`|${sheetName}`,{employee_name:sheetName,employee_no:'',source_sheet:sheetName});
      });
      roster.forEach((person) => rows.push({...person,punch_local:'',source_row:null,raw_payload:{roster_only:true}}));
      if (!rows.some((r)=>r.punch_local)) { setErr('لم أجد حركات بصمة قابلة للقراءة في الملف.'); return; }
      setParsedRows(rows);
    } catch (e) { setErr('تعذر قراءة ملف Excel: ' + (e.message || e)); }
  }

  async function sha256(nextFile) {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', await nextFile.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');
  }

  async function createBatch() {
    if (!file || !parsedRows.length) return;
    if (newScope === 'external' && !clientName.trim()) { setErr('اكتب اسم العميل قبل إنشاء المعالجة الخارجية.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      const hash = await sha256(file);
      const {data,error} = await supabase.rpc('hr_import_attendance_punches',{
        p_file_name:file.name,p_file_size:file.size,p_file_hash:hash,p_rows:parsedRows,p_parser_version:'xlsx-lab-v2',
        p_processing_scope:newScope,p_client_entity_id:null,p_client_name:newScope==='external'?clientName.trim():null,p_client_reference:newScope==='external'?(clientReference.trim()||null):null,
      });
      if (error) throw error;
      setMsg(`تم استخراج ${data?.rows || 0} حركة خام. لم يتم ترحيل أي شيء إلى HR.`);
      setFile(null); setParsedRows([]);
      await loadImports(data?.import_id);
      setActiveId(data?.import_id || '');
    } catch (e) { setErr('تعذر إنشاء دفعة المعالجة: ' + (e.message || e)); }
    setBusy(false);
  }

  async function loadSchedule(id) {
    setSubjectId(id); setScheduleId(null); setScheduleName('الدوام الأساسي'); setValidFrom(activeImport?.period_from || ''); setValidTo(activeImport?.period_to || ''); setScheduleDays(blankDays());
    if (!id || !activeImport) return;
    const external = activeImport.processing_scope === 'external';
    const table = external ? 'hr_attendance_external_schedules' : 'hr_employee_work_schedules';
    let q = supabase.from(table).select('*').eq(external?'external_person_id':'employee_id',id).eq('is_active',true).order('valid_from',{ascending:false}).limit(1);
    if (external) q = q.eq('import_id',activeImport.id);
    const sQ = await q.maybeSingle();
    if (sQ.error || !sQ.data) return;
    const dayTable = external ? 'hr_attendance_external_schedule_days' : 'hr_employee_work_schedule_days';
    const dQ = await supabase.from(dayTable).select('*').eq('schedule_id',sQ.data.id).order('weekday');
    setScheduleId(sQ.data.id); setScheduleName(sQ.data.name || 'الدوام الأساسي'); setValidFrom(sQ.data.valid_from || activeImport.period_from || ''); setValidTo(sQ.data.valid_to || activeImport.period_to || '');
    const byDay = new Map((dQ.data || []).map((r)=>[Number(r.weekday),r]));
    setScheduleDays(WEEKDAYS.map((d)=>{ const r=byDay.get(d.weekday); return {...d,is_workday:r?r.is_workday:d.weekday!==5,start_time:r?.start_time?.slice(0,5)||'',end_time:r?.end_time?.slice(0,5)||'',notes:r?.notes||''}; }));
  }

  function updateScheduleDay(weekday,patch) { setScheduleDays((list)=>list.map((d)=>d.weekday===weekday?{...d,...patch}:d)); }
  function applyBulkTime() { if (bulkStart && bulkEnd) setScheduleDays((list)=>list.map((d)=>d.is_workday?{...d,start_time:bulkStart,end_time:bulkEnd}:d)); }

  async function saveSchedule() {
    if (!activeImport || !subjectId || !validFrom) { setErr('اختر الشخص وحدد بداية سريان ساعات الدوام.'); return; }
    if (scheduleDays.some((d)=>d.is_workday && (!d.start_time || !d.end_time))) { setErr('كل يوم عمل يحتاج ساعة بداية وساعة نهاية.'); return; }
    setBusy(true); setErr('');
    const daysPayload = scheduleDays.map(({weekday,is_workday,start_time,end_time,notes})=>({weekday,is_workday,start_time,end_time,notes}));
    const external = activeImport.processing_scope === 'external';
    const {data,error} = external
      ? await supabase.rpc('hr_save_external_attendance_schedule',{p_schedule_id:scheduleId,p_import_id:activeImport.id,p_external_person_id:subjectId,p_name:scheduleName,p_valid_from:validFrom,p_valid_to:validTo||null,p_days:daysPayload,p_notes:null})
      : await supabase.rpc('hr_save_employee_work_schedule',{p_schedule_id:scheduleId,p_employee_id:subjectId,p_name:scheduleName,p_valid_from:validFrom,p_valid_to:validTo||null,p_days:daysPayload,p_notes:null});
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setScheduleId(data); setMsg('تم حفظ ساعات الدوام. لا يوجد أثر رسمي قبل الترحيل.');
  }

  async function runStage(action) {
    if (!activeImport) return;
    setBusy(true); setErr(''); setMsg('');
    let q;
    if (action === 'analyze') q = await supabase.rpc('hr_analyze_attendance_import',{p_import_id:activeImport.id});
    if (action === 'review') q = await supabase.rpc('hr_start_attendance_review',{p_import_id:activeImport.id});
    if (action === 'recalculate') q = await supabase.rpc('hr_recalculate_attendance_import',{p_import_id:activeImport.id});
    if (action === 'ready') q = await supabase.rpc('hr_mark_attendance_ready',{p_import_id:activeImport.id});
    if (action === 'post') q = await supabase.rpc('hr_post_attendance_import',{p_import_id:activeImport.id});
    if (action === 'close') q = await supabase.rpc('hr_close_external_attendance_import',{p_import_id:activeImport.id});
    setBusy(false);
    if (q?.error) { setErr(q.error.message); return; }
    const labels = {analyze:'تم التحليل الفني.',review:'بدأت مرحلة معالجة التبريرات.',recalculate:'تمت إعادة الاحتساب بعد المعالجة.',ready:'النتيجة جاهزة للمراجعة النهائية.',post:'تم الترحيل إلى سجل HR الرسمي.',close:'تم إغلاق المعالجة الخارجية دون أي أثر على HR.'};
    setMsg(labels[action] || 'تمت العملية.');
    await loadImports(activeImport.id); await loadActive(activeImport.id);
  }

  async function openJustification(day) {
    setSelectedDay(day); setErr(''); setMsg('');
    setJustification({id:day.justification_id||null,text:day.justification_text||'',paper_reference:day.paper_reference||'',paper_approved_on:day.paper_approved_on||'',decision:day.justification_decision||'pending',decision_note:day.decision_note||''});
  }

  async function saveJustification() {
    if (!selectedDay || !justification.text.trim()) { setErr('اكتب التبرير أولًا.'); return; }
    setBusy(true); setErr('');
    const {data,error} = await supabase.rpc('hr_submit_attendance_justification',{p_attendance_day_id:selectedDay.id,p_justification_text:justification.text,p_paper_reference:justification.paper_reference||null,p_paper_approved_on:justification.paper_approved_on||null});
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setJustification((j)=>({...j,id:data,decision:'pending'})); setMsg('تم تسجيل التبرير. النتيجة الرسمية لم تتغير؛ يلزم القرار ثم إعادة الاحتساب.');
    await loadActive(activeImport.id);
  }

  async function decide(decision) {
    if (!justification.id || !isPrimary) return;
    setBusy(true); setErr('');
    const {error} = await supabase.rpc('hr_decide_attendance_justification',{p_justification_id:justification.id,p_decision:decision,p_decision_note:justification.decision_note||null,p_paper_reference:justification.paper_reference||null,p_paper_approved_on:justification.paper_approved_on||null});
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setJustification((j)=>({...j,decision})); setMsg('تم تسجيل القرار. أعد الاحتساب لإنتاج نتيجة المراجعة الجديدة.');
    await loadActive(activeImport.id);
  }

  async function exportWorkbook() {
    if (!activeImport) return;
    setBusy(true); setErr('');
    try {
      const XLSX = await import('xlsx');
      const [pQ,eQ] = await Promise.all([
        supabase.from('hr_attendance_punches').select('external_employee_no,external_employee_name,punch_local,source_sheet,source_row,match_method').eq('import_id',activeImport.id).order('punch_local'),
        supabase.from('hr_attendance_processing_events').select('stage,action_key,summary,created_at').eq('import_id',activeImport.id).order('created_at'),
      ]);
      if (pQ.error) throw pQ.error;
      const wb = XLSX.utils.book_new();
      const summaryRows = [
        ['نوع المعالجة',activeImport.processing_scope==='external'?'خدمة لعميل خارجي':'داخلي - أركان المكان'],
        ['العميل',activeImport.client_name_snapshot||'أركان المكان'],['مرجع العميل',activeImport.client_reference||''],
        ['الملف',activeImport.source_file_name],['الفترة من',activeImport.period_from||''],['الفترة إلى',activeImport.period_to||''],
        ['المرحلة',STAGE_AR[activeImport.status]||activeImport.status],['إصدار المراجعة',activeImport.review_revision||0],
        ['الحركات الخام',activeImport.rows_received||0],['غير المطابق',activeImport.unmatched_punches||0],
        ['مكتمل',summary.complete],['غياب',summary.absent],['نقص دخول',summary.missing_in],['نقص خروج',summary.missing_out],
        ['الخصم المبدئي',summary.pre],['الخصم بعد المعالجة',summary.final],
      ];
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summaryRows),'ملخص');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((pQ.data||[]).map((r)=>({'الرقم':r.external_employee_no||'','الاسم':r.external_employee_name||'','الحركة':r.punch_local,'الورقة':r.source_sheet||'','السطر':r.source_row||'','المطابقة':r.match_method||''}))),'الحركات الخام');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(days.map((d)=>({'الرقم':d.subject_no||'','الاسم':d.subject_name||'','التاريخ':d.work_date,'بداية الروتين':d.scheduled_start||'','نهاية الروتين':d.scheduled_end||'','الدخول المختار':d.check_in||'','الخروج المختار':d.check_out||'','ساعات العمل بالدقائق':d.worked_minutes??'','انحراف الدخول بالدقائق':d.arrival_delta_minutes??'','انحراف الخروج بالدقائق':d.departure_delta_minutes??'','الحالة':STATUS_AR[d.day_status]||d.day_status,'الخصم المبدئي':Number(d.preliminary_deduction_days||0),'التبرير':d.justification_text||'','قرار التبرير':d.justification_decision||'','مرجع الورقة':d.paper_reference||'','الخصم بعد المعالجة':Number(d.final_deduction_days||0),'ملاحظة التحليل':d.analysis_note||''}))),'النتائج المعالجة');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((eQ.data||events||[]).map((r)=>({'المرحلة':STAGE_AR[r.stage]||r.stage,'الإجراء':r.action_key,'التاريخ':r.created_at,'الملخص':JSON.stringify(r.summary||{})}))),'سجل المعالجة');
      const safe = String(activeImport.client_name_snapshot||'أركان المكان').replace(/[\\/:*?"<>|]/g,'-');
      XLSX.writeFile(wb,`حضور_${safe}_${activeImport.status}_${activeImport.period_from||''}.xlsx`);
    } catch (e) { setErr('تعذر إنشاء ملف المراجعة: ' + (e.message||e)); }
    setBusy(false);
  }

  const subjects = activeImport?.processing_scope === 'external'
    ? externalPeople.map((p)=>({id:p.id,no:p.external_employee_no,name:p.external_employee_name}))
    : employees.map((p)=>({id:p.id,no:p.employee_no,name:p.full_name_ar}));

  const stage = activeImport?.status;

  return <>
    <div className="page-head"><div><h1>معمل الحضور والانصراف</h1><p>معالجة ومراجعة ملفات البصمة أولًا، ثم الترحيل فقط عند اعتماد النتيجة النهائية.</p></div></div>
    {err && <div className="msg err">{err}</div>}{msg && <div className="msg ok">{msg}</div>}

    <div className="section" style={{marginTop:16}}>
      <header><h2>دفعة معالجة جديدة</h2><span className="hint">الخدمة الخارجية لا تنشئ موظفين ولا تؤثر على بيانات أركان المكان.</span></header>
      <div style={{padding:18}}>
        <div className="form-grid">
          <div className="field"><label>نوع المعالجة</label><select value={newScope} onChange={(e)=>setNewScope(e.target.value)}><option value="internal">داخلي — أركان المكان</option><option value="external">خدمة لعميل خارجي</option></select></div>
          {newScope==='external' && <><div className="field"><label>اسم العميل</label><input value={clientName} onChange={(e)=>setClientName(e.target.value)} /></div><div className="field"><label>مرجع العميل / المهمة</label><input value={clientReference} onChange={(e)=>setClientReference(e.target.value)} /></div></>}
        </div>
        <div className="rowsplit" style={{marginTop:16}}><label className="btn ghost" style={{cursor:'pointer'}}>اختيار ملف Excel<input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={(e)=>readAttendanceFile(e.target.files?.[0])} /></label>{file&&<span>{file.name}</span>}{punchCount>0&&<strong>{punchCount} حركة خام مقروءة</strong>}<button className="btn" disabled={busy||!punchCount} onClick={createBatch}>{busy?'جارٍ الاستخراج':'رفع واستخراج فقط'}</button></div>
        <p className="hint" style={{marginTop:10}}>الرفع لا يحسب خصمًا رسميًا ولا يرحّل شيئًا. بعد الاستخراج يعاير البرنامج ساعات الدوام من البصمات، ثم تراجع الاستثناءات وتبدأ التحليل.</p>
      </div>
    </div>

    <div className="section">
      <header><h2>دفعات المعالجة</h2><div className="field" style={{minWidth:300}}><select value={activeId} onChange={(e)=>setActiveId(e.target.value)}><option value="">اختر دفعة</option>{imports.map((i)=><option key={i.id} value={i.id}>{i.processing_scope==='external'?(i.client_name_snapshot||'عميل خارجي'):'أركان المكان'} — {i.period_from||'بدون فترة'} — {STAGE_AR[i.status]||i.status}</option>)}</select></div></header>
      {activeImport && <div style={{padding:18}}>
        <div className="stat-grid">
          <div className="stat"><span>النوع</span><strong>{activeImport.processing_scope==='external'?'خارجي':'داخلي'}</strong></div>
          <div className="stat"><span>المرحلة</span><strong>{STAGE_AR[stage]||stage}</strong></div>
          <div className="stat"><span>الحركات</span><strong>{activeImport.rows_received||0}</strong></div>
          <div className="stat"><span>غير مطابق</span><strong>{activeImport.unmatched_punches||0}</strong></div>
          <div className="stat"><span>إصدار المراجعة</span><strong>{activeImport.review_revision||0}</strong></div>
        </div>
        <div className="rowsplit" style={{marginTop:16}}>
          <button className="btn ghost" disabled={busy} onClick={exportWorkbook}>ملف المراجعة Excel</button>
          <AttendanceClientExcelReport activeImport={activeImport} disabled={busy || !['recalculated','ready_to_post','posted','closed'].includes(stage)} />
          {stage==='analyzed'&&<button className="btn" disabled={busy} onClick={()=>runStage('review')}>بدء معالجة التبريرات</button>}
          {['justifications','analyzed'].includes(stage)&&<button className="btn" disabled={busy} onClick={()=>runStage('recalculate')}>إعادة الاحتساب</button>}
          {stage==='recalculated'&&<button className="btn" disabled={busy} onClick={()=>runStage('ready')}>اعتماد نتيجة المراجعة</button>}
          {stage==='ready_to_post'&&activeImport.processing_scope==='internal'&&canPost&&<button className="btn" disabled={busy} onClick={()=>runStage('post')}>ترحيل إلى HR</button>}
          {stage==='ready_to_post'&&activeImport.processing_scope==='external'&&<button className="btn" disabled={busy} onClick={()=>runStage('close')}>إغلاق وتسليم للعميل</button>}
        </div>
        {activeImport.processing_scope==='external'&&<p className="hint" style={{marginTop:10}}>حتى بعد الإغلاق لا تُنشأ أي حركة حضور أو خصم في سجلات موظفي أركان المكان.</p>}
      </div>}
    </div>

    <AttendanceCalibrationPanel activeImport={activeImport} employees={employees} externalPeople={externalPeople} onRefresh={async()=>{ if(activeImport?.id){ await loadImports(activeImport.id); await loadActive(activeImport.id); } }} />

    {activeImport && !['posted','closed'].includes(stage) && <div className="section">
      <header><h2>مراجعة / تعديل ساعات الدوام</h2><span className="hint">استخدم هذا القسم فقط لتعديل الحالات التي لم يستطع البرنامج معايرتها بثقة أو لتسجيل ساعات دوام معتمدة من العميل.</span></header>
      <div style={{padding:18}}>
        <div className="form-grid">
          <div className="field"><label>{activeImport.processing_scope==='external'?'شخص ملف العميل':'الموظف'}</label><select value={subjectId} onChange={(e)=>loadSchedule(e.target.value)}><option value="">اختر</option>{subjects.map((s)=><option key={s.id} value={s.id}>{s.no?`${s.no} - `:''}{s.name}</option>)}</select></div>
          <div className="field"><label>وصف ساعات الدوام</label><input value={scheduleName} onChange={(e)=>setScheduleName(e.target.value)} /></div>
          <div className="field"><label>يسري من</label><input type="date" value={validFrom} onChange={(e)=>setValidFrom(e.target.value)} /></div>
          <div className="field"><label>يسري إلى</label><input type="date" value={validTo} onChange={(e)=>setValidTo(e.target.value)} /></div>
        </div>
        <div className="rowsplit" style={{margin:'16px 0'}}><div className="field"><label>وقت موحد</label><input type="time" value={bulkStart} onChange={(e)=>setBulkStart(e.target.value)} /></div><div className="field"><label>إلى</label><input type="time" value={bulkEnd} onChange={(e)=>setBulkEnd(e.target.value)} /></div><button type="button" className="btn ghost" onClick={applyBulkTime}>تطبيق على أيام العمل</button></div>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>اليوم</th><th>يوم عمل</th><th>البداية</th><th>النهاية</th><th>ملاحظات</th></tr></thead><tbody>{scheduleDays.map((d)=><tr key={d.weekday}><td>{d.label}</td><td><input type="checkbox" checked={d.is_workday} onChange={(e)=>updateScheduleDay(d.weekday,{is_workday:e.target.checked,start_time:e.target.checked?d.start_time:'',end_time:e.target.checked?d.end_time:''})}/></td><td><input type="time" disabled={!d.is_workday} value={d.start_time} onChange={(e)=>updateScheduleDay(d.weekday,{start_time:e.target.value})}/></td><td><input type="time" disabled={!d.is_workday} value={d.end_time} onChange={(e)=>updateScheduleDay(d.weekday,{end_time:e.target.value})}/></td><td><input disabled={!d.is_workday} value={d.notes} onChange={(e)=>updateScheduleDay(d.weekday,{notes:e.target.value})}/></td></tr>)}</tbody></table></div>
        <div style={{marginTop:16}}><button className="btn" disabled={busy||!subjectId} onClick={saveSchedule}>حفظ ساعات الدوام</button></div>
      </div>
    </div>}

    {activeImport && stageIndex(stage)>=stageIndex('analyzed') && <AttendanceProcessingTable days={days} stage={stage} onOpenJustification={openJustification} />}

    {selectedDay && activeImport && !['posted','closed'].includes(stage) && <AttendanceJustificationDialog day={selectedDay} isPrimary={isPrimary} onClose={()=>setSelectedDay(null)} onRefresh={async()=>{ await loadActive(activeImport.id); await loadImports(activeImport.id); }} />}

    {activeImport && events.length>0 && <div className="section"><header><h2>سجل مراحل المعالجة</h2></header><div style={{overflowX:'auto'}}><table><thead><tr><th>الوقت</th><th>المرحلة</th><th>الإجراء</th></tr></thead><tbody>{events.map((e)=><tr key={e.id}><td>{new Date(e.created_at).toLocaleString('ar-SA')}</td><td>{STAGE_AR[e.stage]||e.stage}</td><td>{e.action_key}</td></tr>)}</tbody></table></div></div>}
  </>;
}
