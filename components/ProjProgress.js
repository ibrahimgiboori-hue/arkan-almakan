'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, qty as fq, dateAr } from '@/lib/format';

export default function ProjProgress({ projectId, canWrite, onChange }) {
  const [rows, setRows] = useState(null);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const { data: prog } = await supabase.from('v_item_progress')
      .select('*').eq('project_id', projectId);
    const ids = (prog || []).map((p) => p.project_item_id);
    const { data: ent } = ids.length
      ? await supabase.from('progress_entries').select('*')
          .in('project_item_id', ids).order('entry_date', { ascending: false })
      : { data: [] };
    setRows(prog || []); setEntries(ent || []); onChange?.();
  }

  useEffect(() => { load(); }, [projectId]);

  async function record(item) {
    const v = form[item.project_item_id] || {};
    if (!v.qty && !v.pct) { setErr('أدخل الكمية المنفَّذة أو النسبة'); return; }
    setErr(''); setMsg('');
    const { error } = await supabase.from('progress_entries').insert({
      project_item_id: item.project_item_id,
      entry_date: v.date || new Date().toISOString().slice(0,10),
      qty_done: Number(v.qty || 0),
      manual_pct: v.pct === '' || v.pct === undefined ? null : Number(v.pct),
      notes: v.notes || null,
    });
    if (error) { setErr('تعذّر التسجيل: ' + error.message); return; }
    setMsg('سُجّل الإنجاز');
    setForm({ ...form, [item.project_item_id]: {} });
    load();
  }

  async function delEntry(id) {
    if (!window.confirm('حذف هذا التسجيل؟')) return;
    const { error } = await supabase.from('progress_entries').delete().eq('id', id);
    if (error) setErr('تعذّر الحذف: ' + error.message); else load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;
  if (rows.length === 0) return (
    <div className="section" style={{marginTop:0}}>
      <div className="empty"><h3>لا بنود</h3><p>أضف بنود النطاق أولاً.</p></div>
    </div>
  );

  const setF = (id, k, v) => setForm({ ...form, [id]: { ...(form[id]||{}), [k]: v } });

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      <div className="section" style={{marginTop:0,overflowX:'auto'}}>
        <header><h2>الإنجاز لكل بند</h2></header>
        <table>
          <thead>
            <tr><th>البند</th><th className="num">الكمية التعاقدية</th>
                <th className="num">المنفَّذ</th><th className="num">النسبة المحسوبة</th>
                <th className="num">النسبة اليدوية</th><th className="num">القيمة المكتسبة</th>
                {canWrite && <th style={{width:300}}>تسجيل إنجاز</th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const f = form[r.project_item_id] || {};
              const gap = r.manual_pct !== null && r.manual_pct !== undefined
                        && Math.abs(Number(r.manual_pct) - Number(r.computed_pct)) > 10;
              return (
                <tr key={r.project_item_id}>
                  <td>
                    {r.description_ar || '—'}
                    {!r.has_decision && (
                      <div><span className="pill bad" style={{fontSize:11}}>بلا قرار تنفيذ</span></div>
                    )}
                  </td>
                  <td className="num">{fq(r.contract_qty)} {r.unit}</td>
                  <td className="num">{fq(r.qty_done)}</td>
                  <td className="num">
                    <span className={`pill ${Number(r.computed_pct) >= 100 ? 'ok' : ''}`}>
                      {Number(r.computed_pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="num">
                    {r.manual_pct !== null && r.manual_pct !== undefined ? (
                      <span className={`pill ${gap ? 'bad' : ''}`}>
                        {Number(r.manual_pct).toFixed(0)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="num">{money(r.earned_value)}</td>
                  {canWrite && (
                    <td>
                      <div className="rowsplit">
                        <input type="date" dir="ltr" value={f.date || ''}
                               onChange={(e)=>setF(r.project_item_id,'date',e.target.value)}
                               style={{width:120,border:'1px solid var(--hair)',padding:'3px',fontSize:12.5}} />
                        <input type="number" step="any" dir="ltr" placeholder="الكمية"
                               value={f.qty ?? ''}
                               onChange={(e)=>setF(r.project_item_id,'qty',e.target.value)}
                               style={{width:80,border:'1px solid var(--hair)',padding:'3px',fontSize:12.5}} />
                        <input type="number" step="any" dir="ltr" placeholder="نسبة %"
                               value={f.pct ?? ''}
                               onChange={(e)=>setF(r.project_item_id,'pct',e.target.value)}
                               style={{width:70,border:'1px solid var(--hair)',padding:'3px',fontSize:12.5}} />
                        <button className="btn" style={{padding:'4px 9px',fontSize:12.5}}
                                onClick={()=>record(r)}>تسجيل</button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section">
        <header><h2>سجل التسجيلات</h2></header>
        {entries.length === 0 ? (
          <div className="empty"><h3>لا تسجيلات</h3><p>سجّل أول إنجاز من الجدول أعلاه.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>التاريخ</th><th>البند</th><th className="num">الكمية</th>
                  <th className="num">النسبة</th><th>في مستخلص</th>
                  {canWrite && <th style={{width:80}}>—</th>}</tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const it = rows.find((r) => r.project_item_id === e.project_item_id);
                return (
                  <tr key={e.id}>
                    <td className="mono">{dateAr(e.entry_date)}</td>
                    <td>{it?.description_ar || '—'}</td>
                    <td className="num">{fq(e.qty_done)}</td>
                    <td className="num">{e.manual_pct ?? '—'}</td>
                    <td>
                      <span className={`pill ${e.claimed ? 'ok' : 'warn'}`}>
                        {e.claimed ? 'مُطالَب به' : 'لم يُطالَب'}
                      </span>
                    </td>
                    {canWrite && (
                      <td>
                        {!e.claimed && (
                          <button className="btn ghost" style={{padding:'3px 8px',fontSize:12,
                                          borderColor:'#EBC3C0',color:'#A32B24'}}
                                  onClick={()=>delEntry(e.id)}>حذف</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
