'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';
import LeaveSubstituteActions from '@/components/LeaveSubstituteActions';

export default function LeaveParallelActionsPanel() {
  const [rows, setRows] = useState([]);
  const [emps, setEmps] = useState([]);
  const [subs, setSubs] = useState({});
  const [consents, setConsents] = useState({});
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    const [r,e,s,a] = await Promise.all([
      supabase.from('leave_requests')
        .select('id,employee_id,status,start_date,end_date,record_source,employees:employees!leave_requests_employee_id_fkey(full_name_ar,employee_no)')
        .in('status',['submitted','hr_reviewed'])
        .neq('record_source','historical_paper')
        .order('created_at',{ascending:false}),
      supabase.from('employees')
        .select('id,employee_no,full_name_ar')
        .in('status',['active','on_leave'])
        .order('employee_no'),
      supabase.from('leave_request_substitutes')
        .select('request_id,substitute_employee_id,substitute:employees!leave_request_substitutes_substitute_employee_id_fkey(full_name_ar,employee_no)'),
      supabase.from('v_approval_register')
        .select('entity_id,actor_employee_id,decision,recorded_at,step_order')
        .eq('entity_table','leave_requests')
        .eq('action_code','substitute_consent')
        .order('recorded_at',{ascending:true}),
    ]);
    const first = r.error || e.error || s.error || a.error;
    if (first) {
      console.error('Leave parallel actions load failed', first);
      setErr('تعذر تحميل إجراءات الإجازات حاليًا. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
      return;
    }
    const sm = {};
    (s.data || []).forEach((x)=>{ sm[x.request_id]=x; });
    const cm = {};
    (a.data || []).forEach((x)=>{ cm[`${x.entity_id}:${x.actor_employee_id}`]=x; });
    setRows(r.data || []); setEmps(e.data || []); setSubs(sm); setConsents(cm);
  }

  useEffect(()=>{ load(); },[]);

  const prepared = useMemo(()=>rows.map((r)=>{
    const sub = subs[r.id] || null;
    const key = sub ? `${r.id}:${sub.substitute_employee_id}` : null;
    const approval = key ? consents[key] : null;
    const consentState = !sub ? 'not_required' : !approval ? 'pending' : approval.decision === 'approved' ? 'approved' : 'rejected';
    return {
      ...r,
      substitute_employee_id: sub?.substitute_employee_id || null,
      substitute_name: sub?.substitute?.full_name_ar || null,
      consentState,
    };
  }),[rows,subs,consents]);

  if (!prepared.length && !err) return null;

  return (
    <div className="section" style={{marginBottom:16}}>
      <header>
        <div>
          <h2>الإجراءات المتوازية للإجازات</h2>
          <p style={{margin:'4px 0 0',fontSize:13,color:'var(--ink-soft)'}}>إجراء الموارد البشرية وموافقة الموظف البديل يمكن تسجيلهما بأي ترتيب. الاعتماد النهائي يبدأ بعد اكتمال المطلوب.</p>
        </div>
      </header>
      {err ? <div className="msg err" style={{margin:14}}>{err}</div> : (
        <div style={{overflowX:'auto'}}>
          <table>
            <thead><tr><th>الموظف</th><th>الفترة</th><th>الإجراء الرئيسي</th><th>الموظف البديل</th><th>الإجراء الموازي</th></tr></thead>
            <tbody>{prepared.map((r)=>{
              const hrDone = r.status === 'hr_reviewed';
              const readyFinal = hrDone && (!r.substitute_employee_id || r.consentState === 'approved');
              return <tr key={r.id}>
                <td>{r.employees?.employee_no ? `${r.employees.employee_no} - ` : ''}{r.employees?.full_name_ar || '—'}</td>
                <td className="mono">{dateAr(r.start_date)} - {dateAr(r.end_date)}</td>
                <td>
                  <span className={`pill ${hrDone ? 'ok' : 'warn'}`}>{hrDone ? 'الإجراء الأول مكتمل' : 'بانتظار الإجراء الأول'}</span>
                  {readyFinal && <span className="pill warn" style={{marginInlineStart:6}}>بانتظار الاعتماد النهائي</span>}
                </td>
                <td>{r.substitute_name || '—'}</td>
                <td><LeaveSubstituteActions request={r} employees={emps} consentState={r.consentState} onSaved={load} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}