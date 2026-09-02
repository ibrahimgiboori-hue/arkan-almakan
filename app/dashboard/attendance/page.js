'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDashboardSession } from '@/lib/dashboard-session-context';

const WEEKDAYS = [
  {weekday:0,label:'الأحد'}, {weekday:1,label:'الاثنين'}, {weekday:2,label:'الثلاثاء'},
  {weekday:3,label:'الأربعاء'}, {weekday:4,label:'الخميس'}, {weekday:5,label:'الجمعة'}, {weekday:6,label:'السبت'},
];

const STATUS_AR = {
  complete:'مكتمل', missing_in:'بصمة دخول مفقودة', missing_out:'بصمة خروج مفقودة',
  absent:'غياب', day_off:'إجازة', no_schedule:'لا يوجد روتين', needs_review:'يحتاج مراجعة',
};

function monthBounds(month) {
  const [y,m] = String(month).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from:`${month}-01`, to:`${month}-${String(last).padStart(2,'0')}` };
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

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ','T'));
  if (Number.isNaN(d.getTime())) return String(value).slice(11,16) || '—';
  return new Intl.DateTimeFormat('ar-SA',{hour:'2-digit',minute:'2-digit',hour12:true}).format(d);
}

function fmtMinutes(value) {
  const n = Number(value || 0);
  const h = Math.floor(n / 60); const m = Math.abs(n % 60);
  if (!n) return '0د';
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

export default function EmployeeAttendancePage() {
  const me = useDashboardSession();
  const isPrimary = me?.actionContext?.isPrimaryUser === true;
  const [employees,setEmployees] = useState([]);
  const [employeeId,setEmployeeId] = useState('');
  const [scheduleId,setScheduleId] = useState(null);
  const [scheduleName,setScheduleName] = useState('الدوام الأساسي');
  const [validFrom,setValidFrom] = useState('');
  const [validTo,setValidTo] = useState('');
  const [scheduleDays,setScheduleDays] = useState(blankDays());
  const [bulkStart,setBulkStart] = useState('');
  const [bulkEnd,setBulkEnd] = useState('');
  const [month,setMonth] = useState(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7));
  const [days,setDays] = useState([]);
  const [imports,setImports] = useState([]);
  const [file,setFile] = useState(null);
  const [parsedRows,setParsedRows] = useState([]);
  const [selectedDay,setSelectedDay] = useState(null);
  const [justification,setJustification] = useState({id:null,text:'',paper_reference:'',paper_approved_on:'',decision:'pending',decision_note:''});
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');

  async function loadBase() {
    const [eQ,iQ] = await Promise.all([
      supabase.from('employees').select('id,employee_no,full_name_ar,status').order('employee_no'),
      supabase.from('hr_attendance_imports').select('id,source_file_name,period_from,period_to,status,rows_received,matched_punches,unmatched_punches,uploaded_at').order('uploaded_at',{ascending:false}).limit(8),
    ]);
    if (eQ.error) setErr(eQ.error.message); else setEmployees(eQ.data || []);
    if (!iQ.error) setImports(iQ.data || []);
  }

  async function loadMonth() {
    const {from,to} = monthBounds(month);
    const q = await supabase.from('v_hr_attendance_days').select('*').gte('work_date',from).lte('work_date',to).order('work_date').order('employee_no');
    if (q.error) { setErr(q.error.message); return; }
    setDays(q.data || []);
  }

  useEffect(() => { loadBase(); }, []);
  useEffect(() => { loadMonth(); }, [month]);

  async function loadSchedule(id) {
    setEmployeeId(id); setScheduleId(null); setScheduleName('الدوام الأساسي'); setValidFrom(''); setValidTo(''); setScheduleDays(blankDays());
    if (!id) return;
    const sQ = await supabase.from('hr_employee_work_schedules').select('*').eq('employee_id',id).eq('is_active',true).order('valid_from',{ascending:false}).limit(1).maybeSingle();
    if (sQ.error || !sQ.data) return;
    const dQ = await supabase.from('hr_employee_work_schedule_days').select('*').eq('schedule_id',sQ.data.id).order('weekday');
    setScheduleId(sQ.data.id); setScheduleName(sQ.data.name || 'الدوام الأساسي'); setValidFrom(sQ.data.valid_from || ''); setValidTo(sQ.data.valid_to || '');
    const byDay = new Map((dQ.data || []).map((r)=>[Number(r.weekday),r]));
    setScheduleDays(WEEKDAYS.map((d)=>{ const r=byDay.get(d.weekday); return {...d,is_workday:r ? r.is_workday : d.weekday!==5,start_time:r?.start_time?.slice(0,5)||'',end_time:r?.end_time?.slice(0,5)||'',notes:r?.notes||''}; }));
  }

  function updateScheduleDay(weekday,patch) {
    setScheduleDays((list)=>list.map((d)=>d.weekday===weekday ? {...d,...patch} : d));
  }

  function applyBulkTime() {
    if (!bulkStart || !bulkEnd) return;
    setScheduleDays((list)=>list.map((d)=>d.is_workday ? {...d,start_time:bulkStart,end_time:bulkEnd} : d));
  }

  async function saveSchedule() {
    setErr(''); setMsg('');
    if (!employeeId || !validFrom) { setErr('اختر الموظف وحدد تاريخ بداية سريان الروتين.'); return; }
    const invalid = scheduleDays.some((d)=>d.is_workday && (!d.start_time || !d.end_time));
    if (invalid) { setErr('كل يوم عمل يحتاج وقت بداية ونهاية.'); return; }
    setBusy(true);
    const {data,error} = await supabase.rpc('hr_save_employee_work_schedule',{
      p_schedule_id:scheduleId,
      p_employee_id:employeeId,
      p_name:scheduleName,
      p_valid_from:validFrom,
      p_valid_to:validTo || null,
      p_days:scheduleDays.map(({weekday,is_workday,start_time,end_time,notes})=>({weekday,is_workday,start_time,end_time,notes})),
      p_notes:null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setScheduleId(data); setMsg('تم حفظ روتين الدوام. أي تحليل جديد سيقارن البصمات بهذا الروتين.');
  }

  async function readAttendanceFile(nextFile) {
    setErr(''); setMsg(''); setFile(nextFile || null); setParsedRows([]);
    if (!nextFile) return;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await nextFile.arrayBuffer(),{type:'array',cellDates:true});
      const rows = [];
      workbook.SheetNames.forEach((sheetName)=>{
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:false,dateNF:'yyyy-mm-dd hh:mm:ss',defval:''});
        matrix.forEach((r,index)=>{
          const punch = normalizePunchTimestamp(r?.[2]);
          if (!punch) return;
          rows.push({
            employee_name:String(r?.[0] ?? '').trim(),
            employee_no:String(r?.[1] ?? '').trim(),
            punch_local:punch,
            source_sheet:sheetName,
            source_row:index+1,
            raw_payload:r?.[3] ? {source_note:String(r[3])} : {},
          });
        });
      });
      if (!rows.length) { setErr('لم أجد حركات بصمة في العمود الثالث من أوراق الملف.'); return; }
      setParsedRows(rows);
    } catch (e) { setErr('تعذر قراءة ملف Excel: ' + (e.message || e)); }
  }

  async function sha256(nextFile) {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', await nextFile.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');
  }

  async function importAttendance() {
    if (!file || !parsedRows.length) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const hash = await sha256(file);
      const {data,error} = await supabase.rpc('hr_import_attendance_punches',{
        p_file_name:file.name,
        p_file_size:file.size,
        p_file_hash:hash,
        p_rows:parsedRows,
        p_parser_version:'xlsx-v1',
      });
      if (error) throw error;
      setMsg(`تم استيراد ${data?.days || 0} سجل يومي. مكتمل ${data?.complete || 0}، غياب ${data?.absent || 0}، نقص دخول ${data?.missing_in || 0}، نقص خروج ${data?.missing_out || 0}، بدون روتين ${data?.no_schedule || 0}.`);
      setFile(null); setParsedRows([]);
      await Promise.all([loadBase(),loadMonth()]);
    } catch (e) { setErr('تعذر استيراد الحضور: ' + (e.message || e)); }
    setBusy(false);
  }

  const summary = useMemo(()=>days.reduce((a,d)=>{
    a.total += 1; a[d.day_status]=(a[d.day_status]||0)+1; a.pre += Number(d.preliminary_deduction_days||0); a.final += Number(d.final_deduction_days||0); a.work += Number(d.worked_minutes||0); return a;
  },{total:0,complete:0,missing_in:0,missing_out:0,absent:0,day_off:0,no_schedule:0,needs_review:0,pre:0,final:0,work:0}),[days]);

  async function openJustification(day) {
    setSelectedDay(day); setErr(''); setMsg('');
    const kind = day.day_status==='missing_in'?'missing_in':day.day_status==='missing_out'?'missing_out':day.day_status==='absent'?'absence':'other';
    const q = await supabase.from('hr_attendance_justifications').select('*').eq('attendance_day_id',day.id).eq('issue_kind',kind).maybeSingle();
    const r=q.data;
    setJustification({id:r?.id||null,text:r?.justification_text||'',paper_reference:r?.paper_reference||'',paper_approved_on:r?.paper_approved_on||'',decision:r?.decision||'pending',decision_note:r?.decision_note||''});
  }

  async function saveJustification() {
    if (!selectedDay || !justification.text.trim()) { setErr('اكتب التبرير أولًا.'); return; }
    setBusy(true); setErr('');
    const {data,error}=await supabase.rpc('hr_submit_attendance_justification',{
      p_attendance_day_id:selectedDay.id,
      p_justification_text:justification.text,
      p_paper_reference:justification.paper_reference || null,
      p_paper_approved_on:justification.paper_approved_on || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setJustification((j)=>({...j,id:data,decision:'pending'})); setMsg('تم تسجيل التبرير وبقي الخصم مبدئيًا حتى قرار المستخدم الرئيسي.'); await loadMonth();
  }

  async function decide(decision) {
    if (!justification.id || !isPrimary) return;
    setBusy(true); setErr('');
    const {error}=await supabase.rpc('hr_decide_attendance_justification',{
      p_justification_id:justification.id,
      p_decision:decision,
      p_decision_note:justification.decision_note || null,
      p_paper_reference:justification.paper_reference || null,
      p_paper_approved_on:justification.paper_approved_on || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setJustification((j)=>({...j,decision})); setMsg(decision==='accepted'?'تم قبول التبرير وأصبح الخصم النهائي صفرًا.':'تم رفض التبرير ويظل الخصم قائمًا.'); await loadMonth();
  }

  return <>
    <div className="page-head"><div><h1>الحضور والانصراف</h1><p>روتين الموظف ← حركات البصمة الخام ← نتيجة اليوم ← التبرير والخصم النهائي</p></div></div>
    {err && <div className="msg err">{err}</div>}{msg && <div className="msg ok">{msg}</div>}

    <div className="section" style={{marginTop:16}}>
      <header><h2>روتين دوام الموظف</h2><span className="hint">الجمعة إجازة افتراضيًا، ويمكن أن يختلف وقت أي يوم عن بقية الأسبوع.</span></header>
      <div style={{padding:18}}>
        <div className="form-grid">
          <div className="field"><label>الموظف</label><select value={employeeId} onChange={(e)=>loadSchedule(e.target.value)}><option value="">اختر موظفًا</option>{employees.map((e)=><option key={e.id} value={e.id}>{e.employee_no} - {e.full_name_ar}</option>)}</select></div>
          <div className="field"><label>اسم الروتين</label><input value={scheduleName} onChange={(e)=>setScheduleName(e.target.value)} /></div>
          <div className="field"><label>يسري من</label><input type="date" value={validFrom} onChange={(e)=>setValidFrom(e.target.value)} /></div>
          <div className="field"><label>يسري إلى</label><input type="date" value={validTo} onChange={(e)=>setValidTo(e.target.value)} /><span className="hint">اتركه فارغًا إذا كان الروتين مستمرًا.</span></div>
        </div>
        <div className="rowsplit" style={{margin:'16px 0'}}><div className="field"><label>وقت موحد لأيام العمل</label><input type="time" value={bulkStart} onChange={(e)=>setBulkStart(e.target.value)} /></div><div className="field"><label>إلى</label><input type="time" value={bulkEnd} onChange={(e)=>setBulkEnd(e.target.value)} /></div><button type="button" className="btn ghost" onClick={applyBulkTime}>تطبيق على أيام العمل</button></div>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>اليوم</th><th>يوم عمل</th><th>بداية الدوام</th><th>نهاية الدوام</th><th>ملاحظات</th></tr></thead><tbody>{scheduleDays.map((d)=><tr key={d.weekday}><td>{d.label}</td><td><input type="checkbox" checked={d.is_workday} onChange={(e)=>updateScheduleDay(d.weekday,{is_workday:e.target.checked,start_time:e.target.checked?d.start_time:'',end_time:e.target.checked?d.end_time:''})} /></td><td><input type="time" disabled={!d.is_workday} value={d.start_time} onChange={(e)=>updateScheduleDay(d.weekday,{start_time:e.target.value})} /></td><td><input type="time" disabled={!d.is_workday} value={d.end_time} onChange={(e)=>updateScheduleDay(d.weekday,{end_time:e.target.value})} /></td><td><input disabled={!d.is_workday} value={d.notes} onChange={(e)=>updateScheduleDay(d.weekday,{notes:e.target.value})} /></td></tr>)}</tbody></table></div>
        <div style={{marginTop:16}}><button className="btn" disabled={busy} onClick={saveSchedule}>{busy?'جارٍ الحفظ':'حفظ الروتين'}</button></div>
      </div>
    </div>

    <div className="section">
      <header><h2>رفع ملف البصمة</h2><span className="hint">يحتفظ النظام بكل الحركات الخام، لكنه يستخدم فقط بصمة الدخول والخروج المنطقيتين حول روتين الموظف.</span></header>
      <div style={{padding:18}}>
        <div className="rowsplit"><label className="btn ghost" style={{cursor:'pointer'}}>اختيار ملف Excel<input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={(e)=>readAttendanceFile(e.target.files?.[0])} /></label>{file && <span>{file.name}</span>}{parsedRows.length>0 && <strong>{parsedRows.length} حركة جاهزة</strong>}<button className="btn" disabled={busy||!parsedRows.length} onClick={importAttendance}>{busy?'جارٍ التحليل':'استيراد وتحليل'}</button></div>
      </div>
    </div>

    <div className="section">
      <header><h2>كشف الشهر</h2><div className="field" style={{minWidth:180}}><input type="month" value={month} onChange={(e)=>setMonth(e.target.value)} /></div></header>
      <div style={{padding:18}}><div className="stat-grid"><div className="stat"><span>مكتمل</span><strong>{summary.complete}</strong></div><div className="stat"><span>غياب</span><strong>{summary.absent}</strong></div><div className="stat"><span>نقص دخول</span><strong>{summary.missing_in}</strong></div><div className="stat"><span>نقص خروج</span><strong>{summary.missing_out}</strong></div><div className="stat"><span>الخصم المبدئي</span><strong>{summary.pre.toFixed(2)} يوم</strong></div><div className="stat"><span>الخصم النهائي</span><strong>{summary.final.toFixed(2)} يوم</strong></div></div></div>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>الموظف</th><th>التاريخ</th><th>الروتين</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th>انحراف الدخول</th><th>انحراف الخروج</th><th>الحالة</th><th>الخصم</th><th>المعالجة</th></tr></thead><tbody>{days.map((d)=><tr key={d.id}><td>{d.employee_no} - {d.employee_name}</td><td className="mono">{d.work_date}</td><td>{d.scheduled_start?`${fmtTime(d.scheduled_start)} — ${fmtTime(d.scheduled_end)}`:'—'}</td><td>{fmtTime(d.check_in)}</td><td>{fmtTime(d.check_out)}</td><td>{d.worked_minutes==null?'—':fmtMinutes(d.worked_minutes)}</td><td>{d.arrival_delta_minutes==null?'—':deviationText(d.arrival_delta_minutes,'تبكير','تأخير')}</td><td>{d.departure_delta_minutes==null?'—':deviationText(d.departure_delta_minutes,'خروج مبكر','خروج متأخر')}</td><td>{STATUS_AR[d.day_status]||d.day_status}</td><td>{Number(d.preliminary_deduction_days||0).toFixed(2)} ← <strong>{Number(d.final_deduction_days||0).toFixed(2)}</strong></td><td>{['missing_in','missing_out','absent','needs_review'].includes(d.day_status)?<button className="btn ghost" type="button" onClick={()=>openJustification(d)}>تبرير / مراجعة</button>:'—'}</td></tr>)}</tbody></table>{!days.length && <div style={{padding:18}} className="hint">لا توجد نتائج حضور في هذا الشهر حتى الآن.</div>}</div>
    </div>

    {selectedDay && <div className="section"><header><h2>معالجة حالة — {selectedDay.employee_name} — {selectedDay.work_date}</h2><span className="hint">الخصم لا يختفي لمجرد كتابة التبرير؛ يختفي فقط إذا سجّل المستخدم الرئيسي قبوله بعد الاعتماد الورقي.</span></header><div style={{padding:18}}><div className="form-grid"><div className="field" style={{gridColumn:'1/-1'}}><label>التبرير</label><textarea rows={4} value={justification.text} onChange={(e)=>setJustification({...justification,text:e.target.value})} /></div><div className="field"><label>مرجع الورقة</label><input value={justification.paper_reference} onChange={(e)=>setJustification({...justification,paper_reference:e.target.value})} /></div><div className="field"><label>تاريخ الاعتماد الورقي</label><input type="date" value={justification.paper_approved_on} onChange={(e)=>setJustification({...justification,paper_approved_on:e.target.value})} /></div><div className="field"><label>الحالة</label><input disabled value={justification.decision==='accepted'?'مقبول':justification.decision==='rejected'?'مرفوض':'بانتظار القرار'} /></div>{isPrimary && <div className="field"><label>ملاحظة القرار</label><input value={justification.decision_note} onChange={(e)=>setJustification({...justification,decision_note:e.target.value})} /></div>}</div><div className="rowsplit" style={{marginTop:16}}><button className="btn ghost" disabled={busy} onClick={saveJustification}>حفظ التبرير</button>{isPrimary && justification.id && <><button className="btn" disabled={busy} onClick={()=>decide('accepted')}>قبول التبرير</button><button className="btn ghost" disabled={busy} onClick={()=>decide('rejected')}>رفض التبرير</button></>}</div></div></div>}

    {imports.length>0 && <div className="section"><header><h2>آخر ملفات البصمة</h2></header><div style={{overflowX:'auto'}}><table><thead><tr><th>الملف</th><th>الفترة</th><th>الحركات</th><th>مطابقة</th><th>غير مطابقة</th><th>الحالة</th></tr></thead><tbody>{imports.map((i)=><tr key={i.id}><td>{i.source_file_name}</td><td>{i.period_from||'—'} — {i.period_to||'—'}</td><td>{i.rows_received}</td><td>{i.matched_punches}</td><td>{i.unmatched_punches}</td><td>{i.status}</td></tr>)}</tbody></table></div></div>}
  </>;
}
