'use client';
import { useMemo, useState } from 'react';

export default function LeaveSubstituteActions({ request, employees = [], consentState = 'not_required', onSaved }) {
  const [open, setOpen] = useState(false);
  const [substituteId, setSubstituteId] = useState(request?.substitute_employee_id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const options = useMemo(() => employees.filter((e) => e.id !== request?.employee_id), [employees, request?.employee_id]);
  const closed = ['ceo_approved','rejected','cancelled'].includes(request?.status);

  async function saveSubstitute() {
    if (closed) return;
    setBusy(true); setErr('');
    const { supabase } = await import('@/lib/supabase');
    const { error } = await supabase.from('leave_requests')
      .update({ substitute_employee_id: substituteId || null })
      .eq('id', request.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOpen(false);
    await onSaved?.();
  }

  async function recordConsent() {
    if (!request?.substitute_employee_id || closed) return;
    if (!window.confirm('تسجيل موافقة الموظف البديل على تغطية فترة الإجازة؟')) return;
    setBusy(true); setErr('');
    const { supabase } = await import('@/lib/supabase');
    const { error } = await supabase.rpc('record_leave_substitute_consent', {
      p_id: request.id,
      p_decision: 'approved',
      p_decision_date: new Date().toISOString().slice(0,10),
      p_comment: null,
      p_evidence_path: null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onSaved?.();
  }

  const stateLabel = consentState === 'approved' ? 'موافقة البديل مسجلة'
    : consentState === 'rejected' ? 'البديل لم يوافق'
      : request?.substitute_employee_id ? 'بانتظار موافقة البديل' : 'لا يوجد بديل محدد';

  return (
    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
      <span className={`pill ${consentState === 'approved' ? 'ok' : consentState === 'rejected' ? 'bad' : 'warn'}`}>{stateLabel}</span>
      {!closed && <button type="button" className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>{setSubstituteId(request?.substitute_employee_id || '');setOpen(!open);}}>
        {request?.substitute_employee_id ? 'تغيير البديل' : 'تحديد البديل'}
      </button>}
      {!closed && request?.substitute_employee_id && consentState !== 'approved' && (
        <button type="button" className="btn" style={{padding:'4px 9px',fontSize:12.5}} disabled={busy} onClick={recordConsent}>موافقة الموظف البديل</button>
      )}
      {open && (
        <div style={{display:'flex',gap:6,alignItems:'center',width:'100%',marginTop:4}}>
          <select value={substituteId} onChange={(e)=>setSubstituteId(e.target.value)} style={{minWidth:220}}>
            <option value="">بدون موظف بديل</option>
            {options.map((e)=><option key={e.id} value={e.id}>{e.employee_no ? `${e.employee_no} - ` : ''}{e.full_name_ar}</option>)}
          </select>
          <button type="button" className="btn" disabled={busy} onClick={saveSubstitute}>{busy ? 'جارٍ الحفظ' : 'حفظ'}</button>
        </div>
      )}
      {err && <span style={{fontSize:12,color:'#A32B24'}}>{err}</span>}
    </div>
  );
}
