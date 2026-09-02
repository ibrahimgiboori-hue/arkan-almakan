'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_AR = {
  complete:'مكتمل', missing_in:'بصمة دخول مفقودة', missing_out:'بصمة خروج مفقودة',
  absent:'غياب', day_off:'إجازة', no_schedule:'ساعات الدوام غير محددة', needs_review:'يحتاج مراجعة',
};

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

function fmtSubmittedAt(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
}

function needsReview(day) {
  return ['missing_in','missing_out','absent','needs_review'].includes(day.day_status);
}

function reviewState(day) {
  if (day.justification_decision === 'accepted') return 'accepted';
  if (day.justification_decision === 'rejected') return 'rejected';
  if (day.justification_id || day.justification_decision === 'pending') return 'pending';
  if (day.day_status === 'no_schedule') return 'needs_schedule';
  if (needsReview(day)) return 'needs_justification';
  return 'clear';
}

function transactionMeta(day) {
  const state = reviewState(day);
  if (state === 'accepted') return {state,label:'تبرير مقبول',background:'rgba(22,163,74,.10)',border:'rgba(22,163,74,.22)',color:'#166534'};
  if (state === 'clear') return {state,label:'مكتمل',background:'rgba(22,163,74,.08)',border:'rgba(22,163,74,.18)',color:'#166534'};
  if (state === 'pending') return {state,label:'بانتظار القرار',background:'rgba(37,99,235,.09)',border:'rgba(37,99,235,.20)',color:'#1d4ed8'};
  if (state === 'needs_schedule') return {state,label:'يحتاج ساعات دوام',background:'rgba(37,99,235,.07)',border:'rgba(37,99,235,.18)',color:'#1d4ed8'};
  if (state === 'rejected') return {state,label:'تبرير مرفوض',background:'rgba(220,38,38,.08)',border:'rgba(220,38,38,.18)',color:'#b91c1c'};
  return {state,label:'يحتاج تبرير',background:'rgba(220,38,38,.07)',border:'rgba(220,38,38,.16)',color:'#b91c1c'};
}

function subjectKey(day) {
  return day.external_person_id || day.employee_id || `${day.subject_no || ''}|${day.subject_name || ''}`;
}

function compareNames(a,b) {
  const byName = String(a?.subject_name || '').localeCompare(String(b?.subject_name || ''),'ar',{sensitivity:'base',numeric:true});
  if (byName !== 0) return byName;
  const byNo = String(a?.subject_no || '').localeCompare(String(b?.subject_no || ''),'ar',{sensitivity:'base',numeric:true});
  if (byNo !== 0) return byNo;
  return String(a?.work_date || '').localeCompare(String(b?.work_date || ''));
}

export default function AttendanceProcessingTable({ days = [], stage, onOpenJustification }) {
  const [person,setPerson] = useState('all');
  const [review,setReview] = useState('all');
  const [status,setStatus] = useState('all');
  const [submitterByJustification,setSubmitterByJustification] = useState({});

  const justificationIds = useMemo(() => [...new Set(days.map((d)=>d.justification_id).filter(Boolean))],[days]);

  useEffect(() => {
    let active = true;
    if (!justificationIds.length) {
      setSubmitterByJustification({});
      return () => { active = false; };
    }
    (async () => {
      const [jQ,uQ] = await Promise.all([
        supabase.from('hr_attendance_justifications').select('id,submitted_by,submitted_at').in('id',justificationIds),
        supabase.rpc('fn_workspace_user_directory'),
      ]);
      if (!active) return;
      const users = new Map((uQ.data || []).map((u)=>[u.user_id,u.display_name]));
      const next = {};
      (jQ.data || []).forEach((j) => {
        next[j.id] = {
          name: users.get(j.submitted_by) || (j.submitted_by ? 'مستخدم النظام' : ''),
          submittedAt: j.submitted_at || null,
        };
      });
      setSubmitterByJustification(next);
    })();
    return () => { active = false; };
  },[justificationIds]);

  const baseSorted = useMemo(() => [...days].sort(compareNames),[days]);

  const people = useMemo(() => {
    const m = new Map();
    baseSorted.forEach((d) => {
      const key = subjectKey(d);
      if (!m.has(key)) m.set(key,{key,no:d.subject_no||'',name:d.subject_name||'غير معروف'});
    });
    return [...m.values()].sort((a,b)=>{
      const byName=String(a.name||'').localeCompare(String(b.name||''),'ar',{sensitivity:'base',numeric:true});
      if(byName!==0) return byName;
      return String(a.no||'').localeCompare(String(b.no||''),'ar',{sensitivity:'base',numeric:true});
    });
  },[baseSorted]);

  const filtered = useMemo(() => baseSorted.filter((d) => {
    const key = subjectKey(d);
    if (person !== 'all' && key !== person) return false;
    if (status !== 'all' && d.day_status !== status) return false;
    if (review !== 'all' && reviewState(d) !== review) return false;
    return true;
  }),[baseSorted,person,review,status]);

  const reviewable = days.filter(needsReview).length;
  const withoutJustification = days.filter((d)=>needsReview(d) && !d.justification_id).length;
  const pending = days.filter((d)=>reviewState(d) === 'pending').length;
  const completed = days.filter((d)=>['clear','accepted'].includes(reviewState(d))).length;

  return <div className="section">
    <header><h2>البيانات المعالجة</h2><span className="hint">المعاملة ملوّنة لتمييز المكتمل، المنتظر، والذي يحتاج تدخلًا. تفاصيل الانحراف تظهر داخل وقت الدخول والخروج بدل أعمدة منفصلة.</span></header>
    <div style={{padding:18}}>
      <div className="rowsplit" style={{alignItems:'end',gap:12,flexWrap:'wrap'}}>
        <div className="field" style={{minWidth:240}}><label>الموظف</label><select value={person} onChange={(e)=>setPerson(e.target.value)}><option value="all">كل الموظفين</option>{people.map((p)=><option key={p.key} value={p.key}>{p.no?`${p.no} - `:''}{p.name}</option>)}</select></div>
        <div className="field" style={{minWidth:220}}><label>المراجعة / التبرير</label><select value={review} onChange={(e)=>setReview(e.target.value)}><option value="all">كل الحالات</option><option value="needs_justification">يحتاج تبرير</option><option value="pending">تبرير بانتظار القرار</option><option value="accepted">تبرير مقبول</option><option value="rejected">تبرير غير مقبول</option><option value="clear">مكتمل ولا يحتاج معالجة</option></select></div>
        <div className="field" style={{minWidth:210}}><label>حالة اليوم</label><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="all">كل الحالات اليومية</option><option value="complete">مكتمل</option><option value="absent">غياب</option><option value="missing_in">بصمة دخول مفقودة</option><option value="missing_out">بصمة خروج مفقودة</option><option value="day_off">إجازة</option><option value="needs_review">يحتاج مراجعة</option></select></div>
        <button type="button" className="btn ghost" onClick={()=>{setPerson('all');setReview('all');setStatus('all');}}>مسح الفلاتر</button>
      </div>
      <div className="stat-grid" style={{marginTop:14}}><div className="stat"><span>مكتمل المعالجة</span><strong>{completed}</strong></div><div className="stat"><span>بدون تبرير</span><strong>{withoutJustification}</strong></div><div className="stat"><span>بانتظار القرار</span><strong>{pending}</strong></div><div className="stat"><span>النتائج الظاهرة</span><strong>{filtered.length}</strong></div></div>
    </div>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>الشخص</th><th>التاريخ</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th>الحالة</th><th>الخصم</th><th style={{minWidth:190}}>المعاملة</th></tr></thead><tbody>{filtered.map((d)=>{
      const transaction = transactionMeta(d);
      const submitter = d.justification_id ? submitterByJustification[d.justification_id] : null;
      const canOpen = needsReview(d) && !['posted','closed'].includes(stage);
      return <tr key={d.id}>
        <td>{d.subject_no?`${d.subject_no} - `:''}{d.subject_name}</td>
        <td className="mono">{d.work_date}</td>
        <td><div>{fmtTime(d.check_in)}</div>{d.arrival_delta_minutes!=null&&<div className="hint" style={{fontSize:11,marginTop:3}}>{deviationText(d.arrival_delta_minutes,'تبكير','تأخير')}</div>}</td>
        <td><div>{fmtTime(d.check_out)}</div>{d.departure_delta_minutes!=null&&<div className="hint" style={{fontSize:11,marginTop:3}}>{deviationText(d.departure_delta_minutes,'خروج مبكر','خروج متأخر')}</div>}</td>
        <td>{d.worked_minutes==null?'—':fmtMinutes(d.worked_minutes)}</td>
        <td>{STATUS_AR[d.day_status]||d.day_status}</td>
        <td>{Number(d.preliminary_deduction_days||0).toFixed(2)} ← <strong>{Number(d.final_deduction_days||0).toFixed(2)}</strong></td>
        <td style={{background:transaction.background}}>
          <div style={{border:`1px solid ${transaction.border}`,borderRadius:10,padding:'8px 10px',display:'grid',gap:5}}>
            <strong style={{color:transaction.color,fontSize:13}}>{transaction.label}</strong>
            {submitter?.name&&<span className="hint" style={{fontSize:11}}>سجّل التبرير: {submitter.name}{submitter.submittedAt?` — ${fmtSubmittedAt(submitter.submittedAt)}`:''}</span>}
            {canOpen&&<button className="btn ghost" type="button" style={{padding:'5px 9px',justifySelf:'start'}} onClick={()=>onOpenJustification?.({...d,justification_submitter_name:submitter?.name||'',justification_submitted_at:submitter?.submittedAt||null})}>{d.justification_id?'فتح التبرير':'إضافة تبرير'}</button>}
          </div>
        </td>
      </tr>;
    })}{!filtered.length&&<tr><td colSpan={8}><div style={{padding:18}} className="hint">لا توجد نتائج تطابق الفلاتر الحالية.</div></td></tr>}</tbody></table></div>
  </div>;
}