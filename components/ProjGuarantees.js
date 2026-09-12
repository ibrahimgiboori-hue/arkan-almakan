'use client';

import { useEffect, useState } from 'react';
import { money, dateAr } from '@/lib/format';
import { PROJECT_GUARANTEE_KINDS } from '@/lib/project-guarantees.mjs';
import { projectGuaranteesService } from '@/lib/application/project-guarantees-service';

export default function ProjGuarantees({ project, canWrite, onChange }) {
  const [guarantees, setGuarantees] = useState([]);
  const [retentions, setRetentions] = useState([]);
  const [form, setForm] = useState({ kind:'performance', issuer:'', reference_no:'', amount:'', expiry_date:'' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    if (!project?.id) return;
    setErr('');
    try {
      const workspace=await projectGuaranteesService.loadWorkspace({ projectId:project.id });
      setGuarantees(workspace.guarantees);
      setRetentions(workspace.retentions);
      onChange?.();
    } catch (error) {
      setErr('تعذر تحميل الضمانات والمحتجزات: ' + (error?.message || error));
    }
  }

  useEffect(() => { load(); }, [project?.id]);

  async function addGuarantee(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      await projectGuaranteesService.addGuarantee({ projectId:project.id, form });
      setForm({ kind:'performance', issuer:'', reference_no:'', amount:'', expiry_date:'' });
      setMsg('أُضيف الضمان.');
      await load();
    } catch (error) {
      setErr('تعذر إضافة الضمان: ' + (error?.message || error));
    }
  }

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      <div className="grid k2">
        <div className="section" style={{marginTop:0}}>
          <header><h2>الضمانات البنكية</h2></header>
          {canWrite && (
            <form onSubmit={addGuarantee} style={{padding:18,borderBottom:'1px solid var(--hair)'}}>
              <div className="form-grid">
                <div className="field">
                  <label>النوع</label>
                  <select value={form.kind} onChange={(e)=>setForm({...form,kind:e.target.value})}>
                    {Object.entries(PROJECT_GUARANTEE_KINDS).map(([key,label])=><option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>القيمة</label>
                  <input type="number" step="0.01" dir="ltr" value={form.amount}
                         onChange={(e)=>setForm({...form,amount:e.target.value})} />
                </div>
                <div className="field">
                  <label>تاريخ الانتهاء</label>
                  <input type="date" dir="ltr" value={form.expiry_date}
                         onChange={(e)=>setForm({...form,expiry_date:e.target.value})} />
                </div>
                <div className="field span2">
                  <label>الجهة المُصدِرة</label>
                  <input value={form.issuer} onChange={(e)=>setForm({...form,issuer:e.target.value})} />
                </div>
                <div className="field">
                  <label>رقم الضمان</label>
                  <input dir="ltr" value={form.reference_no}
                         onChange={(e)=>setForm({...form,reference_no:e.target.value})} />
                </div>
              </div>
              <button className="btn" type="submit">إضافة ضمان</button>
            </form>
          )}
          {guarantees.length === 0 ? (
            <div className="empty"><h3>لا ضمانات</h3></div>
          ) : (
            <table>
              <thead><tr><th>النوع</th><th className="num">القيمة</th><th>الانتهاء</th><th>الحالة</th></tr></thead>
              <tbody>
                {guarantees.map((g) => (
                  <tr key={g.id}>
                    <td>{PROJECT_GUARANTEE_KINDS[g.kind] || g.kind}</td>
                    <td className="num">{money(g.amount)}</td>
                    <td className="mono">{dateAr(g.expiry_date)}</td>
                    <td>{g.expiry_state ? (
                      <span className={`pill ${g.expiry_state.tone}`}>{g.expiry_state.label}</span>
                    ) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="section" style={{marginTop:0}}>
          <header><h2>المحتجزات</h2></header>
          {retentions.length === 0 ? (
            <div className="empty"><h3>لا محتجزات</h3><p>تُسجَّل مع المستخلصات التي تتضمن نسبة محتجزات.</p></div>
          ) : (
            <table>
              <thead><tr><th>التاريخ</th><th className="num">المبلغ</th><th>الإفراج</th><th>الحالة</th></tr></thead>
              <tbody>
                {retentions.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{dateAr(r.held_at)}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="mono">{dateAr(r.due_release)}</td>
                    <td><span className={`pill ${r.released ? 'ok' : 'warn'}`}>{r.released ? 'أُفرج عنه' : 'محتجز'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
