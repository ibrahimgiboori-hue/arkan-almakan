'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, daysUntil } from '@/lib/format';
import { useLiveRefresh, notifyChange } from '@/lib/live';

const DIR = { outgoing:'صادر', incoming:'وارد' };
const METHODS = ['باليد','بريد','واتساب','بريد إلكتروني','بوابة إلكترونية','فاكس'];
const EMPTY = { direction:'outgoing', reg_date:'', counterparty:'', subject:'',
                delivered_by:'', due_date:'', notes:'', status:'open' };

export default function Register() {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [r, u] = await Promise.all([
      supabase.from('correspondence_register').select('*')
        .order('reg_date', { ascending:false }),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(r.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['register','all']);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function startNew(direction) {
    setEditId(null);
    setF({ ...EMPTY, direction, reg_date: new Date().toISOString().slice(0,10) });
    setOpen(true); setErr(''); setMsg('');
  }

  function startEdit(r) {
    setEditId(r.id); setF({ ...EMPTY, ...r });
    setOpen(true); setErr(''); setMsg('');
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const p = { ...f };
    ['due_date','closed_at'].forEach((k)=>{ p[k] = p[k] || null; });
    delete p.id; delete p.created_at;

    if (editId) {
      const { error } = await supabase.from('correspondence_register')
        .update(p).eq('id', editId);
      if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    } else {
      const { data: no, error: e1 } = await supabase.rpc('next_register_no',
        { p_direction: p.direction });
      if (e1) { setErr(e1.message); return; }
      const { error } = await supabase.from('correspondence_register')
        .insert({ ...p, register_no: no });
      if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    }
    setMsg(editId ? 'حُفظت التعديلات' : 'سُجّل في السجل');
    setF({ ...EMPTY }); setEditId(null); setOpen(false);
    load(); notifyChange('register');
  }

  async function close(r) {
    const { error } = await supabase.from('correspondence_register')
      .update({ status:'closed', closed_at: new Date().toISOString().slice(0,10) })
      .eq('id', r.id);
    if (error) setErr(error.message); else { load(); notifyChange('register'); }
  }

  async function remove(r) {
    if (!window.confirm(`حذف ${r.register_no}؟`)) return;
    const { error } = await supabase.from('correspondence_register').delete().eq('id', r.id);
    if (error) setErr(error.message); else { setMsg('حُذف'); load(); }
  }

  const list = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows
      .filter((r)=>dir === 'all' || r.direction === dir)
      .filter((r)=>!t || [r.register_no, r.counterparty, r.subject]
        .filter(Boolean).some((v)=>String(v).includes(t)));
  }, [rows, dir, q]);

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);
  const openCount = rows.filter((r)=>r.status !== 'closed').length;
  const overdue = rows.filter((r)=>r.status !== 'closed' && r.due_date
                    && daysUntil(r.due_date) < 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>سجل الصادر والوارد</h1>
          <p>{rows.filter((r)=>r.direction==='outgoing').length} صادراً ·
            {' '}{rows.filter((r)=>r.direction==='incoming').length} وارداً ·
            {' '}{openCount} مفتوحاً</p>
        </div>
        <div className="rowsplit">
          <Link className="btn ghost" href="/dashboard/archive">الأرشيف</Link>
          {canWrite && (
            <>
              <button className="btn ghost" onClick={()=>startNew('incoming')}>
                تسجيل وارد
              </button>
              <button className="btn" onClick={()=>startNew('outgoing')}>
                تسجيل صادر
              </button>
            </>
          )}
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}
      {overdue > 0 && (
        <div className="msg err" style={{marginBottom:14}}>
          {overdue} معاملة تجاوزت موعد الرد المحدد
        </div>
      )}

      {open && (
        <form onSubmit={save} className="section" style={{marginTop:0}}>
          <header>
            <h2>{editId ? 'تعديل' : `تسجيل ${DIR[f.direction]}`}</h2>
          </header>
          <div style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>النوع *</label>
                <select value={f.direction} onChange={set('direction')} disabled={!!editId}>
                  {Object.entries(DIR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field">
                <label>التاريخ *</label>
                <input type="date" required dir="ltr" value={f.reg_date || ''}
                       onChange={set('reg_date')} />
              </div>
              <div className="field">
                <label>موعد الرد المطلوب</label>
                <input type="date" dir="ltr" value={f.due_date || ''} onChange={set('due_date')} />
              </div>
              <div className="field span2">
                <label>{f.direction === 'outgoing' ? 'الجهة الموجَّه إليها' : 'الجهة الواردة منها'} *</label>
                <input required value={f.counterparty || ''} onChange={set('counterparty')} />
              </div>
              <div className="field">
                <label>طريقة التسليم</label>
                <select value={f.delivered_by || ''} onChange={set('delivered_by')}>
                  <option value="">—</option>
                  {METHODS.map((m)=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field span3">
                <label>الموضوع *</label>
                <input required value={f.subject || ''} onChange={set('subject')} />
              </div>
              <div className="field span3">
                <label>ملاحظات</label>
                <textarea rows="2" value={f.notes || ''} onChange={set('notes')} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">{editId ? 'حفظ' : 'تسجيل'}</button>
              <button className="btn ghost" type="button"
                      onClick={()=>{setOpen(false);setEditId(null);setF({...EMPTY});}}>إلغاء</button>
            </div>
          </div>
        </form>
      )}

      <div className="section">
        <header>
          <h2>السجل ({list.length})</h2>
          <div className="rowsplit">
            <select value={dir} onChange={(e)=>setDir(e.target.value)}
                    style={{fontSize:13,padding:'6px 8px'}}>
              <option value="all">الكل</option>
              <option value="outgoing">الصادر</option>
              <option value="incoming">الوارد</option>
            </select>
            <input className="search" placeholder="ابحث بالرقم أو الجهة أو الموضوع"
                   value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
        </header>

        {list.length === 0 ? (
          <div className="empty">
            <h3>السجل فارغ</h3>
            <p>سجّل أول صادر أو وارد من الأزرار أعلى الصفحة.</p>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th style={{width:130}}>الرقم</th><th style={{width:70}}>النوع</th>
                    <th style={{width:90}}>التاريخ</th><th>الجهة</th><th>الموضوع</th>
                    <th style={{width:100}}>موعد الرد</th><th style={{width:80}}>الحالة</th>
                    <th style={{width:150}}>—</th></tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const left = r.due_date && r.status !== 'closed' ? daysUntil(r.due_date) : null;
                  return (
                    <tr key={r.id} style={r.status === 'closed' ? {opacity:.6} : undefined}>
                      <td className="mono" style={{fontSize:12.5}}>{r.register_no}</td>
                      <td>
                        <span className={`pill ${r.direction === 'outgoing' ? '' : 'warn'}`}
                              style={{fontSize:11.5}}>{DIR[r.direction]}</span>
                      </td>
                      <td className="mono" style={{fontSize:12.5}}>{dateAr(r.reg_date)}</td>
                      <td>{r.counterparty}</td>
                      <td>
                        {r.subject}
                        {r.delivered_by && (
                          <div style={{fontSize:11.5,color:'var(--ink-soft)'}}>
                            {r.delivered_by}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.due_date ? (
                          <span className={`pill ${left < 0 ? 'bad' : left <= 3 ? 'warn' : ''}`}
                                style={{fontSize:11}}>
                            {left < 0 ? `تأخر ${Math.abs(left)} يوم` : dateAr(r.due_date)}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`pill ${r.status === 'closed' ? 'ok' : 'warn'}`}
                              style={{fontSize:11.5}}>
                          {r.status === 'closed' ? 'مغلق' : 'مفتوح'}
                        </span>
                      </td>
                      <td>
                        {canWrite && (
                          <div className="rowsplit">
                            {r.status !== 'closed' && (
                              <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                      onClick={()=>close(r)}>إغلاق</button>
                            )}
                            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                    onClick={()=>startEdit(r)}>تعديل</button>
                            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                            borderColor:'#EBC3C0',color:'#A32B24'}}
                                    onClick={()=>remove(r)}>حذف</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
