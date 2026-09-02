'use client';

import { useMemo, useState } from 'react';

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

function needsReview(day) {
  return ['missing_in','missing_out','absent','needs_review'].includes(day.day_status);
}

function reviewState(day) {
  if (day.justification_decision === 'accepted') return 'accepted';
  if (day.justification_decision === 'rejected') return 'rejected';
  if (day.justification_id || day.justification_decision === 'pending') return 'pending';
  if (needsReview(day)) return 'needs_justification';
  return 'clear';
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
  const pending = days.filter((d)=>d.justification_decision === 'pending').length;

  return <div className="section">
    <header><h2>البيانات المعالجة</h2><span className="hint">الترتيب الأساسي: الموظف أبجديًا ثم التاريخ من الأقدم للأحدث. الفلاتر تضيق النتائج دون تغيير هذا الترتيب.</span></header>
    <div style={{padding:18}}>
      <div className="rowsplit" style={{alignItems:'end',gap:12,flexWrap:'wrap'}}>
        <div className="field" style={{minWidth:240}}><label>الموظف</label><select value={person} onChange={(e)=>setPerson(e.target.value)}><option value="all">كل الموظفين</option>{people.map((p)=><option key={p.key} value={p.key}>{p.no?`${p.no} - `:''}{p.name}</option>)}</select></div>
        <div className="field" style={{minWidth:220}}><label>المراجعة / التبرير</label><select value={review} onChange={(e)=>setReview(e.target.value)}><option value="all">كل الحالات</option><option value="needs_justification">يحتاج تبرير</option><option value="pending">تبرير بانتظار القرار</option><option value="accepted">تبرير مقبول</option><option value="rejected">تبرير غير مقبول</option><option value="clear">لا يحتاج معالجة</option></select></div>
        <div className="field" style={{minWidth:210}}><label>حالة اليوم</label><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="all">كل الحالات اليومية</option><option value="complete">مكتمل</option><option value="absent">غياب</option><option value="missing_in">بصمة دخول مفقودة</option><option value="missing_out">بصمة خروج مفقودة</option><option value="day_off">إجازة</option><option value="needs_review">يحتاج مراجعة</option></select></div>
        <button type="button" className="btn ghost" onClick={()=>{setPerson('all');setReview('all');setStatus('all');}}>مسح الفلاتر</button>
      </div>
      <div className="stat-grid" style={{marginTop:14}}><div className="stat"><span>حالات تحتاج مراجعة</span><strong>{reviewable}</strong></div><div className="stat"><span>بدون تبرير</span><strong>{withoutJustification}</strong></div><div className="stat"><span>بانتظار القرار</span><strong>{pending}</strong></div><div className="stat"><span>النتائج الظاهرة</span><strong>{filtered.length}</strong></div></div>
    </div>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>الشخص</th><th>التاريخ</th><th>ساعات الدوام</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th>انحراف الدخول</th><th>انحراف الخروج</th><th>الحالة</th><th>الخصم</th><th>المعالجة</th></tr></thead><tbody>{filtered.map((d)=><tr key={d.id}><td>{d.subject_no?`${d.subject_no} - `:''}{d.subject_name}</td><td className="mono">{d.work_date}</td><td>{d.scheduled_start?`${fmtTime(d.scheduled_start)} — ${fmtTime(d.scheduled_end)}`:'—'}</td><td>{fmtTime(d.check_in)}</td><td>{fmtTime(d.check_out)}</td><td>{d.worked_minutes==null?'—':fmtMinutes(d.worked_minutes)}</td><td>{d.arrival_delta_minutes==null?'—':deviationText(d.arrival_delta_minutes,'تبكير','تأخير')}</td><td>{d.departure_delta_minutes==null?'—':deviationText(d.departure_delta_minutes,'خروج مبكر','خروج متأخر')}</td><td>{STATUS_AR[d.day_status]||d.day_status}</td><td>{Number(d.preliminary_deduction_days||0).toFixed(2)} ← <strong>{Number(d.final_deduction_days||0).toFixed(2)}</strong></td><td>{needsReview(d)&&!['posted','closed'].includes(stage)?<button className="btn ghost" type="button" onClick={()=>onOpenJustification?.(d)}>{d.justification_id?'مراجعة التبرير':'تبرير / مراجعة'}</button>:'—'}</td></tr>)}{!filtered.length&&<tr><td colSpan={11}><div style={{padding:18}} className="hint">لا توجد نتائج تطابق الفلاتر الحالية.</div></td></tr>}</tbody></table></div>
  </div>;
}
