'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr, daysUntil } from '@/lib/format';
import { useLiveRefresh, notifyChange } from '@/lib/live';

const DIR = { outgoing:'صادر', incoming:'وارد' };
const METHODS = ['باليد','بريد','واتساب','بريد إلكتروني','بوابة إلكترونية','فاكس'];
const EMPTY = {
  direction:'outgoing',
  reg_date:'',
  counterparty:'',
  subject:'',
  delivered_by:'',
  due_date:'',
  notes:'',
  status:'open',
};

export default function Register() {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [registerQ, userQ] = await Promise.all([
      supabase.from('correspondence_register').select('*').order('reg_date', { ascending:false }),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(registerQ.data || []);
    setRole(userQ.data?.role || null);
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['register','all']);

  const set = (key) => (event) => setForm({ ...form, [key]:event.target.value });

  function resetForm() {
    setOpen(false);
    setEditId(null);
    setForm({ ...EMPTY });
  }

  function startNew(direction) {
    setEditId(null);
    setForm({ ...EMPTY, direction, reg_date:new Date().toISOString().slice(0,10) });
    setOpen(true);
    setErr('');
    setMsg('');
  }

  function startEdit(row) {
    setEditId(row.id);
    setForm({ ...EMPTY, ...row });
    setOpen(true);
    setErr('');
    setMsg('');
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  async function save(event) {
    event.preventDefault();
    setErr('');
    setMsg('');
    const payload = { ...form };
    ['due_date','closed_at'].forEach((key) => { payload[key] = payload[key] || null; });
    delete payload.id;
    delete payload.created_at;

    if (editId) {
      const { error } = await supabase.from('correspondence_register').update(payload).eq('id', editId);
      if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    } else {
      const { data:no, error:numberError } = await supabase.rpc('next_register_no', { p_direction:payload.direction });
      if (numberError) { setErr(numberError.message); return; }
      const { error } = await supabase.from('correspondence_register').insert({ ...payload, register_no:no });
      if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }
    }

    setMsg(editId ? 'حُفظت التعديلات' : 'سُجّل في السجل');
    resetForm();
    load();
    notifyChange('register');
  }

  async function close(row) {
    const { error } = await supabase.from('correspondence_register')
      .update({ status:'closed', closed_at:new Date().toISOString().slice(0,10) })
      .eq('id', row.id);
    if (error) setErr(error.message);
    else { load(); notifyChange('register'); }
  }

  async function remove(row) {
    if (!window.confirm(`حذف ${row.register_no}؟`)) return;
    const { error } = await supabase.from('correspondence_register').delete().eq('id', row.id);
    if (error) setErr(error.message);
    else { setMsg('حُذف'); load(); }
  }

  const list = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim();
    return rows
      .filter((row) => dir === 'all' || row.direction === dir)
      .filter((row) => !needle || [row.register_no, row.counterparty, row.subject]
        .filter(Boolean)
        .some((value) => String(value).includes(needle)));
  }, [rows, dir, q]);

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);
  const outgoingCount = rows.filter((row) => row.direction === 'outgoing').length;
  const incomingCount = rows.filter((row) => row.direction === 'incoming').length;
  const openCount = rows.filter((row) => row.status !== 'closed').length;
  const overdue = rows.filter((row) => row.status !== 'closed' && row.due_date && daysUntil(row.due_date) < 0).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>سجل الصادر والوارد</h1>
          <p>{outgoingCount} صادرًا · {incomingCount} واردًا · {openCount} مفتوحًا</p>
        </div>
        {canWrite && (
          <div className="rowsplit">
            <button className="btn ghost" onClick={() => startNew('incoming')}>تسجيل وارد</button>
            <button className="btn" onClick={() => startNew('outgoing')}>تسجيل صادر</button>
          </div>
        )}
      </div>

      {err && <div className="msg err" style={{ marginBottom:14 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom:14 }}>{msg}</div>}
      {overdue > 0 && <div className="msg err" style={{ marginBottom:14 }}>{overdue} معاملة تجاوزت موعد الرد المحدد</div>}

      {open && (
        <form onSubmit={save} className="section" style={{ marginTop:0 }}>
          <header><h2>{editId ? 'تعديل المعاملة' : `تسجيل ${DIR[form.direction]}`}</h2></header>
          <div style={{ padding:18 }}>
            <div className="form-grid">
              <div className="field">
                <label>النوع *</label>
                <select value={form.direction} onChange={set('direction')} disabled={Boolean(editId)}>
                  {Object.entries(DIR).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>التاريخ *</label>
                <input type="date" required dir="ltr" value={form.reg_date || ''} onChange={set('reg_date')} />
              </div>
              <div className="field">
                <label>موعد الرد المطلوب</label>
                <input type="date" dir="ltr" value={form.due_date || ''} onChange={set('due_date')} />
              </div>
              <div className="field span2">
                <label>{form.direction === 'outgoing' ? 'الجهة الموجَّه إليها' : 'الجهة الواردة منها'} *</label>
                <input required value={form.counterparty || ''} onChange={set('counterparty')} />
              </div>
              <div className="field">
                <label>طريقة التسليم</label>
                <select value={form.delivered_by || ''} onChange={set('delivered_by')}>
                  <option value="">—</option>
                  {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
              <div className="field span3">
                <label>الموضوع *</label>
                <input required value={form.subject || ''} onChange={set('subject')} />
              </div>
              <div className="field span3">
                <label>ملاحظات</label>
                <textarea rows="2" value={form.notes || ''} onChange={set('notes')} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">{editId ? 'حفظ التعديل' : 'تسجيل'}</button>
              <button className="btn ghost" type="button" onClick={resetForm}>إلغاء</button>
            </div>
          </div>
        </form>
      )}

      <div className="section">
        <header>
          <h2>السجل ({list.length})</h2>
          <div className="rowsplit">
            <select value={dir} onChange={(event) => setDir(event.target.value)} style={{ fontSize:13, padding:'6px 8px' }}>
              <option value="all">الكل</option>
              <option value="outgoing">الصادر</option>
              <option value="incoming">الوارد</option>
            </select>
            <input className="search" placeholder="ابحث بالرقم أو الجهة أو الموضوع" value={q} onChange={(event) => setQ(event.target.value)} />
          </div>
        </header>

        {list.length === 0 ? (
          <div className="empty"><h3>السجل فارغ</h3><p>سجّل أول صادر أو وارد من الأزرار أعلى الصفحة.</p></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width:130 }}>الرقم</th><th style={{ width:70 }}>النوع</th><th style={{ width:90 }}>التاريخ</th>
                  <th>الجهة</th><th>الموضوع</th><th style={{ width:100 }}>موعد الرد</th><th style={{ width:80 }}>الحالة</th><th style={{ width:150 }}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const left = row.due_date && row.status !== 'closed' ? daysUntil(row.due_date) : null;
                  return (
                    <tr key={row.id} style={row.status === 'closed' ? { opacity:0.6 } : undefined}>
                      <td className="mono" style={{ fontSize:12.5 }}>{row.register_no}</td>
                      <td><span className={`pill ${row.direction === 'outgoing' ? '' : 'warn'}`} style={{ fontSize:11.5 }}>{DIR[row.direction]}</span></td>
                      <td className="mono" style={{ fontSize:12.5 }}>{dateAr(row.reg_date)}</td>
                      <td>{row.counterparty}</td>
                      <td>
                        {row.subject}
                        {row.delivered_by && <div style={{ fontSize:11.5, color:'var(--ink-soft)' }}>{row.delivered_by}</div>}
                      </td>
                      <td>
                        {row.due_date ? (
                          <span className={`pill ${left < 0 ? 'bad' : left <= 3 ? 'warn' : ''}`} style={{ fontSize:11 }}>
                            {left < 0 ? `تأخر ${Math.abs(left)} يوم` : dateAr(row.due_date)}
                          </span>
                        ) : '—'}
                      </td>
                      <td><span className={`pill ${row.status === 'closed' ? 'ok' : 'warn'}`} style={{ fontSize:11.5 }}>{row.status === 'closed' ? 'مغلق' : 'مفتوح'}</span></td>
                      <td>
                        {canWrite && (
                          <div className="rowsplit">
                            {row.status !== 'closed' && <button className="btn ghost" style={{ padding:'4px 9px', fontSize:12.5 }} onClick={() => close(row)}>إغلاق</button>}
                            <button className="btn ghost" style={{ padding:'4px 9px', fontSize:12.5 }} onClick={() => startEdit(row)}>تعديل</button>
                            <button className="btn ghost" style={{ padding:'4px 9px', fontSize:12.5, borderColor:'#EBC3C0', color:'#A32B24' }} onClick={() => remove(row)}>حذف</button>
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
