'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';

const GUARANTEE_KIND = {
  advance:'دفعة مقدمة',
  performance:'حسن تنفيذ',
  final:'نهائي',
  maintenance:'صيانة',
  other:'أخرى',
};

export default function ProjGuarantees({ project, canWrite, onChange }) {
  const [guarantees, setGuarantees] = useState([]);
  const [retentions, setRetentions] = useState([]);
  const [form, setForm] = useState({ kind:'performance', issuer:'', reference_no:'', amount:'', expiry_date:'' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    if (!project?.id) return;
    const [g, r] = await Promise.all([
      supabase.from('guarantees').select('*').eq('project_id', project.id).order('expiry_date'),
      supabase.from('retentions').select('*').eq('project_id', project.id).order('held_at'),
    ]);
    const firstError = [g, r].find((x) => x.error)?.error;
    if (firstError) {
      setErr('تعذر تحميل الضمانات والمحتجزات: ' + firstError.message);
      return;
    }
    setGuarantees(g.data || []);
    setRetentions(r.data || []);
    onChange?.();
  }

  useEffect(() => { load(); }, [project?.id]);

  async function addGuarantee(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    const { error } = await supabase.from('guarantees').insert({
      project_id: project.id,
      kind: form.kind,
      issuer: form.issuer || null,
      reference_no: form.reference_no || null,
      amount: Number(form.amount || 0),
      expiry_date: form.expiry_date || null,
    });
    if (error) { setErr('تعذر إضافة الضمان: ' + error.message); return; }
    setForm({ kind:'performance', issuer:'', reference_no:'', amount:'', expiry_date:'' });
    setMsg('أُضيف الضمان.');
    await load();
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
                    {Object.entries(GUARANTEE_KIND).map(([key,label])=><option key={key} value={key}>{label}</option>)}
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
                {guarantees.map((g) => {
                  const left = g.expiry_date ? Math.round((new Date(g.expiry_date) - new Date()) / 86400000) : null;
                  return (
                    <tr key={g.id}>
                      <td>{GUARANTEE_KIND[g.kind] || g.kind}</td>
                      <td className="num">{money(g.amount)}</td>
                      <td className="mono">{dateAr(g.expiry_date)}</td>
                      <td>{left === null ? '—' : (
                        <span className={`pill ${left < 0 ? 'bad' : left <= 30 ? 'warn' : 'ok'}`}>
                          {left < 0 ? `منتهٍ منذ ${Math.abs(left)} يوم` : `${left} يوم`}
                        </span>
                      )}</td>
                    </tr>
                  );
                })}
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
