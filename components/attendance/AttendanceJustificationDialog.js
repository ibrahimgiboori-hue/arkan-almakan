'use client';

import { useEffect, useState } from 'react';
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

export default function AttendanceJustificationDialog({ day, isPrimary = false, onClose, onRefresh }) {
  const [type,setType] = useState('');
  const [details,setDetails] = useState('');
  const [reference,setReference] = useState('');
  const [approvedOn,setApprovedOn] = useState('');
  const [decision,setDecision] = useState('pending');
  const [decisionNote,setDecisionNote] = useState('');
  const [justificationId,setJustificationId] = useState(null);
  const [busy,setBusy] = useState(false);
  const [err,setErr] = useState('');
  const [msg,setMsg] = useState('');

  useEffect(()=>{
    if (!day) return;
    setType(day.justification_type || '');
    setDetails(day.justification_text || '');
    setReference(day.paper_reference || '');
    setApprovedOn(day.paper_approved_on || '');
    setDecision(day.justification_decision || 'pending');
    setDecisionNote(day.decision_note || '');
    setJustificationId(day.justification_id || null);
    setErr(''); setMsg('');
  },[day?.id]);

  if (!day) return null;

  async function save() {
    if (!type) { setErr('اختر نوع التبرير.'); return; }
    if (type === 'other' && !details.trim()) { setErr('اكتب تفاصيل التبرير عند اختيار «أخرى».'); return; }
    setBusy(true); setErr(''); setMsg('');
    const {data,error} = await supabase.rpc('hr_submit_attendance_justification_v2',{
      p_attendance_day_id:day.id,
      p_justification_type:type,
      p_justification_text:details.trim() || null,
      p_paper_reference:reference.trim() || null,
      p_paper_approved_on:approvedOn || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setJustificationId(data);
    setDecision('pending');
    setMsg('تم تسجيل التبرير. وجود التبرير لا يعني قبوله؛ يلزم قرار صاحب العمل ثم إعادة الاحتساب.');
    await onRefresh?.();
  }

  async function decide(nextDecision) {
    if (!justificationId || !isPrimary) return;
    setBusy(true); setErr(''); setMsg('');
    const {error} = await supabase.rpc('hr_decide_attendance_justification',{
      p_justification_id:justificationId,
      p_decision:nextDecision,
      p_decision_note:decisionNote.trim() || null,
      p_paper_reference:reference.trim() || null,
      p_paper_approved_on:approvedOn || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDecision(nextDecision);
    setMsg(nextDecision==='accepted'?'تم قبول التبرير لهذه الحالة فقط. أعد الاحتساب لتطبيق أثر القرار.':'تم رفض التبرير لهذه الحالة فقط، ويظل الأثر قائمًا بعد إعادة الاحتساب.');
    await onRefresh?.();
  }

  return <div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(15,23,42,.38)',display:'flex',alignItems:'center',justifyContent:'center',padding:18}} onMouseDown={(e)=>{if(e.target===e.currentTarget) onClose?.();}}>
    <div className="section" style={{width:'min(760px,96vw)',maxHeight:'90vh',overflowY:'auto',background:'#fff',boxShadow:'0 24px 70px rgba(15,23,42,.24)',margin:0}}>
      <header><div><h2>تبرير / مراجعة — {day.subject_name}</h2><span className="hint">{day.work_date} — كل تاريخ مستقل في القبول أو الرفض.</span></div><button type="button" className="btn ghost" onClick={onClose}>إغلاق</button></header>
      <div style={{padding:18}}>
        {err&&<div className="msg err">{err}</div>}{msg&&<div className="msg ok">{msg}</div>}
        <div className="form-grid">
          <div className="field"><label>نوع التبرير</label><select value={type} onChange={(e)=>setType(e.target.value)}><option value="">اختر التبرير</option>{TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
          <div className="field"><label>حالة اليوم</label><input disabled value={day.day_status==='absent'?'غياب':day.day_status==='missing_in'?'بصمة دخول مفقودة':day.day_status==='missing_out'?'بصمة خروج مفقودة':'يحتاج مراجعة'} /></div>
          <div className="field" style={{gridColumn:'1/-1'}}><label>تفاصيل إضافية {type==='other'?'*':'(اختياري)'}</label><textarea rows={3} value={details} onChange={(e)=>setDetails(e.target.value)} placeholder={type?`تفاصيل ${TYPE_LABEL[type]||'التبرير'} أو ما يفيد المراجع`:'اختر نوع التبرير أولًا'} /></div>
          <div className="field"><label>مرجع المستند / الاعتماد</label><input value={reference} onChange={(e)=>setReference(e.target.value)} /></div>
          <div className="field"><label>تاريخ الاعتماد</label><input type="date" value={approvedOn} onChange={(e)=>setApprovedOn(e.target.value)} /></div>
          <div className="field"><label>قرار صاحب العمل</label><input disabled value={decision==='accepted'?'مقبول':decision==='rejected'?'غير مقبول':'بانتظار القرار'} /></div>
          {isPrimary&&<div className="field"><label>ملاحظة القرار</label><input value={decisionNote} onChange={(e)=>setDecisionNote(e.target.value)} /></div>}
        </div>
        <p className="hint" style={{marginTop:12}}>اختيار سبب أو إرفاق مستند لا يلغي الأثر تلقائيًا. إذا لم يُسجل أي تبرير للحالة فتبقى «لا يوجد تبرير» ويظل الأثر قائمًا.</p>
        {type==='non_working_day'&&<p className="hint" style={{marginTop:8}}>هذا السبب يُراجع تاريخًا بتاريخ. يمكن لصاحب العمل قبول بعض الأيام ورفض أخرى بحسب أيام العمل الفعلية للموظف.</p>}
        <div className="rowsplit" style={{marginTop:16}}><button className="btn ghost" disabled={busy} onClick={save}>{busy?'جارٍ الحفظ':'حفظ التبرير'}</button>{isPrimary&&justificationId&&<><button className="btn" disabled={busy} onClick={()=>decide('accepted')}>قبول لهذه الحالة</button><button className="btn ghost" disabled={busy} onClick={()=>decide('rejected')}>رفض لهذه الحالة</button></>}</div>
      </div>
    </div>
  </div>;
}
