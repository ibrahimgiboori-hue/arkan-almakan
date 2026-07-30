'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';

const KINDS = {
  verbal_warning:'تنبيه شفهي', written_warning:'إنذار كتابي', deduction:'خصم من الراتب',
  suspension:'إيقاف عن العمل', termination_notice:'إشعار بالإنهاء',
};

export default function EmpDiscipline({ employeeId }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ action_kind:'written_warning', violation_date:'', description:'',
                               deduction_amount:0, suspension_days:0, employee_response:'' });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => supabase.from('disciplinary_actions')
    .select('*').eq('employee_id', employeeId).order('violation_date', { ascending: false })
    .then(({ data }) => setRows(data || []));

  useEffect(() => { load(); }, [employeeId]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const { error } = await supabase.from('disciplinary_actions').insert({
      employee_id: employeeId, ...f,
      deduction_amount: Number(f.deduction_amount || 0),
      suspension_days: Number(f.suspension_days || 0),
      status: 'submitted',
    });
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    setMsg('تم تسجيل الجزاء');
    setF({ action_kind:'written_warning', violation_date:'', description:'',
           deduction_amount:0, suspension_days:0, employee_response:'' });
    setOpen(false); load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const prior = rows.filter((r) => r.action_kind !== 'verbal_warning').length;

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="rowsplit" style={{marginBottom:14}}>
        <button className="btn" onClick={()=>setOpen(!open)}>
          {open ? 'إغلاق' : 'تسجيل جزاء'}
        </button>
        <span style={{fontSize:13,color:'var(--ink-soft)'}}>
          الإنذارات الكتابية السابقة: {prior}
        </span>
      </div>

      {open && (
        <form onSubmit={save} className="section" style={{marginTop:0,padding:18}}>
          <div className="form-grid">
            <div className="field">
              <label>نوع الجزاء *</label>
              <select value={f.action_kind} onChange={set('action_kind')}>
                {Object.entries(KINDS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label>تاريخ المخالفة *</label>
              <input type="date" required dir="ltr" value={f.violation_date} onChange={set('violation_date')} />
            </div>
            <div className="field">
              <label>قيمة الخصم (ريال)</label>
              <input type="number" min="0" step="0.01" dir="ltr"
                     value={f.deduction_amount} onChange={set('deduction_amount')}
                     disabled={f.action_kind !== 'deduction'} />
            </div>
            <div className="field">
              <label>أيام الإيقاف</label>
              <input type="number" min="0" dir="ltr"
                     value={f.suspension_days} onChange={set('suspension_days')}
                     disabled={f.action_kind !== 'suspension'} />
            </div>
            <div className="field span2">
              <label>وصف المخالفة *</label>
              <textarea rows="3" required value={f.description} onChange={set('description')} />
            </div>
            <div className="field span2">
              <label>دفاع الموظف</label>
              <textarea rows="2" value={f.employee_response} onChange={set('employee_response')} />
              <span className="hint">تسجيل الدفاع يحمي الشركة نظاماً عند المنازعة</span>
            </div>
          </div>
          <button className="btn" type="submit">تسجيل الجزاء</button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="section" style={{marginTop:0}}>
          <div className="empty">
            <h3>لا جزاءات</h3>
            <p>سجل الموظف نظيف.</p>
          </div>
        </div>
      ) : (
        <div className="section" style={{marginTop:0}}>
          <table>
            <thead>
              <tr><th>النوع</th><th>تاريخ المخالفة</th><th>الوصف</th>
                  <th className="num">الخصم</th><th className="num">الإيقاف</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className="pill bad">{KINDS[r.action_kind]}</span></td>
                  <td className="mono">{dateAr(r.violation_date)}</td>
                  <td>{r.description}</td>
                  <td className="num">{Number(r.deduction_amount) ? money(r.deduction_amount) : '—'}</td>
                  <td className="num">{r.suspension_days || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
