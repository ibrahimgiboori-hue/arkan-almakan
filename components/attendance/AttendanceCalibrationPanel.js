'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const CONF_AR = { high:'عالية', medium:'متوسطة', low:'منخفضة', insufficient:'غير كافية', off:'إجازة' };

export default function AttendanceCalibrationPanel({ activeImport, employees = [], externalPeople = [], onRefresh }) {
  const [rows,setRows] = useState([]);
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');

  async function load() {
    if (!activeImport?.id) { setRows([]); return; }
    const q = await supabase.from('hr_attendance_calibration_proposals').select('*').eq('import_id',activeImport.id).order('weekday');
    if (q.error) setErr(q.error.message); else setRows(q.data || []);
  }

  useEffect(()=>{ load(); },[activeImport?.id,activeImport?.status]);

  const summary = useMemo(()=>{
    const people = new Map();
    employees.forEach((e)=>people.set(e.id,{no:e.employee_no||'',name:e.full_name_ar||''}));
    externalPeople.forEach((e)=>people.set(e.id,{no:e.external_employee_no||'',name:e.external_employee_name||''}));
    const rank={high:3,medium:2,low:1,insufficient:0};
    const groups=new Map();
    rows.forEach((r)=>{
      const id=r.external_person_id||r.employee_id;
      if(!id) return;
      if(!groups.has(id)) groups.set(id,{id,rows:[]});
      groups.get(id).rows.push(r);
    });
    return Array.from(groups.values()).map((g)=>{
      const work=g.rows.filter((r)=>r.is_workday);
      const patterns=[...new Set(work.filter((r)=>r.proposed_start&&r.proposed_end).map((r)=>`${String(r.proposed_start).slice(0,5)}–${String(r.proposed_end).slice(0,5)}`))];
      const confidence=work.length?work.reduce((a,r)=>(rank[r.confidence]??0)<(rank[a]??0)?r.confidence:a,work[0].confidence||'insufficient'):'insufficient';
      const candidate=Math.max(0,...work.map((r)=>Number(r.candidate_days||0)));
      const decisions=[...new Set(work.map((r)=>r.decision).filter(Boolean))];
      return {...g,...(people.get(g.id)||{}),patterns,confidence,candidate,decision:decisions.join(' / ')||'pending'};
    }).sort((a,b)=>String(a.no||a.name).localeCompare(String(b.no||b.name),'ar'));
  },[rows,employees,externalPeople]);

  async function act(kind) {
    if(!activeImport?.id) return;
    setBusy(true); setErr(''); setMsg('');
    let q;
    if(kind==='calibrate') q=await supabase.rpc('hr_calibrate_attendance_import',{p_import_id:activeImport.id,p_snap_minutes:60});
    if(kind==='apply') q=await supabase.rpc('hr_apply_attendance_calibration',{p_import_id:activeImport.id,p_min_confidence:'medium'});
    if(kind==='analyze') q=await supabase.rpc('hr_analyze_attendance_import',{p_import_id:activeImport.id});
    setBusy(false);
    if(q?.error){setErr(q.error.message);return;}
    if(kind==='calibrate') setMsg('تمت معايرة ساعات الدوام جماعيًا باعتماد النمط الأكثر تكرارًا فعليًا، مع تثبيت الساعات على رأس الساعة.');
    if(kind==='apply') setMsg('تم اعتماد ساعات الدوام ذات الثقة المتوسطة فأعلى. راجع الاستثناءات فقط.');
    if(kind==='analyze') setMsg('تم تحليل الحضور بناءً على ساعات الدوام المعتمدة.');
    await load();
    await onRefresh?.();
  }

  if(!activeImport || ['posted','closed'].includes(activeImport.status)) return null;

  return <div className="section">
    <header><h2>معايرة ساعات الدوام</h2><span className="hint">يستنتج البرنامج ساعات الدوام من النمط الأكثر تكرارًا فعليًا لحركات البصمة حول رأس الساعة :00؛ التعادل فقط يُحال للمراجعة.</span></header>
    <div style={{padding:18}}>
      {err&&<div className="msg err">{err}</div>}{msg&&<div className="msg ok">{msg}</div>}
      <div className="rowsplit" style={{marginBottom:14}}>
        {activeImport.status==='parsed'&&<button className="btn" disabled={busy} onClick={()=>act('calibrate')}>معايرة ساعات الدوام من الملف</button>}
        {activeImport.status==='calibrated'&&<><button className="btn" disabled={busy} onClick={()=>act('apply')}>اعتماد الساعات الواضحة</button><button className="btn ghost" disabled={busy} onClick={()=>act('analyze')}>تحليل الحضور بعد المراجعة</button></>}
        <span className="hint">نافذة المعايرة ليست فترة سماح؛ 13:30 أمام دوام 13:00 تظل تأخير 30 دقيقة.</span>
      </div>
      {rows.length>0&&<><div style={{overflowX:'auto'}}><table><thead><tr><th>الشخص</th><th>ساعات الدوام المقترحة</th><th>أيام القياس</th><th>الثقة</th><th>الحالة</th></tr></thead><tbody>{summary.map((r)=><tr key={r.id}><td>{r.no?`${r.no} - `:''}{r.name||'غير معروف'}</td><td>{r.patterns.length?r.patterns.join('، '):'تحتاج مراجعة'}</td><td>{r.candidate}</td><td>{CONF_AR[r.confidence]||r.confidence}</td><td>{r.decision==='accepted'?'معتمدة':r.decision==='manual'?'مراجعة يدوية / ساعات قائمة':'مقترحة'}</td></tr>)}</tbody></table></div><p className="hint" style={{marginTop:12}}>الحالات منخفضة الثقة أو غير الكافية لا تُفرض تلقائيًا؛ عدّل ساعاتها فقط من قسم «مراجعة / تعديل ساعات الدوام».</p></>}
      {activeImport.status==='parsed'&&<p className="hint">ابدأ المعايرة أولًا. لا تحتاج إدخال ساعات كل موظف يدويًا.</p>}
    </div>
  </div>;
}
