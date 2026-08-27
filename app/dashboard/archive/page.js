'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { useLiveRefresh, notifyChange } from '@/lib/live';

const CAT_AR = { hr:'موارد بشرية', finance:'مالية', projects:'مشاريع', correspondence:'مراسلات', custom:'أخرى' };
const SRC_AR = { document:'مستند', quotation:'عرض سعر', claim:'مستخلص', settlement:'تسوية' };
const STATE_AR = { issued:'صادر', draft:'مسودة', void:'لاغٍ' };
const STATE_CLS = { issued:'ok', draft:'warn', void:'bad' };
const METHODS = ['باليد','بريد','واتساب','بريد إلكتروني','بوابة إلكترونية','فاكس'];

export default function Archive() {
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [role, setRole] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [src, setSrc] = useState('all');
  const [state, setState] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sendFor, setSendFor] = useState(null);
  const [sendData, setSendData] = useState({ sent_to:'', sent_method:'باليد', sent_at:'' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [archiveQ, statsQ, userQ] = await Promise.all([
      supabase.from('v_archive').select('*').order('doc_date', { ascending:false }).limit(500),
      supabase.from('v_archive_stats').select('*').maybeSingle(),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(archiveQ.data || []);
    setStats(statsQ.data || null);
    setRole(userQ.data?.role || null);
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['all']);

  const list = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim();
    return rows.filter((row) => {
      if (cat !== 'all' && row.category !== cat) return false;
      if (src !== 'all' && row.source !== src) return false;
      if (state !== 'all' && row.state !== state) return false;
      if (from && row.doc_date < from) return false;
      if (to && row.doc_date > to) return false;
      if (!needle) return true;
      return [row.doc_number, row.subject, row.doc_type, row.person_name, row.client_name, row.sent_to]
        .filter(Boolean)
        .some((value) => String(value).includes(needle));
    });
  }, [rows, q, cat, src, state, from, to]);

  function openSend(row) {
    setSendFor(row);
    setSendData({
      sent_to: row.sent_to || row.client_name || row.person_name || '',
      sent_method: row.sent_method || 'باليد',
      sent_at: row.sent_at || new Date().toISOString().slice(0,10),
    });
    setErr('');
    setMsg('');
  }

  async function saveSend() {
    if (!sendFor) return;
    const table = sendFor.source === 'quotation' ? 'quotations' : 'documents';
    const { error } = await supabase.from(table).update({
      sent_at: sendData.sent_at || null,
      sent_to: sendData.sent_to || null,
      sent_method: sendData.sent_method || null,
    }).eq('id', sendFor.id);
    if (error) { setErr(error.message); return; }
    setMsg('سُجّل الإرسال');
    setSendFor(null);
    load();
    notifyChange('archive');
  }

  function clearFilters() {
    setQ('');
    setCat('all');
    setSrc('all');
    setState('all');
    setFrom('');
    setTo('');
  }

  function exportCsv() {
    const cols = ['الرقم','النوع','التصنيف','الموضوع','التاريخ','الحالة','الجهة','المبلغ','أُرسل في','بواسطة'];
    const esc = (value) => {
      const text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text;
    };
    const body = list.map((row) => [
      row.doc_number,
      row.doc_type,
      CAT_AR[row.category] || row.category,
      row.subject,
      dateAr(row.doc_date),
      STATE_AR[row.state],
      row.client_name || row.person_name || '',
      row.amount ?? '',
      row.sent_at ? dateAr(row.sent_at) : '',
      row.sent_method || '',
    ].map(esc).join(','));
    const csv = '\uFEFF' + cols.join(',') + '\n' + body.join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `أرشيف-أركان-${new Date().toISOString().slice(0,10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);
  const cats = [...new Set(rows.map((row) => row.category))];
  const filtersActive = Boolean(q || cat !== 'all' || src !== 'all' || state !== 'all' || from || to);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الأرشيف</h1>
          <p>السجل العام للمستندات والعروض والمستخلصات والتسويات بعد إنشائها.</p>
        </div>
        <button className="btn ghost" onClick={exportCsv}>تصدير إكسل</button>
      </div>

      {err && <div className="msg err" style={{ marginBottom:14 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom:14 }}>{msg}</div>}

      {stats && (
        <div className="grid k4" style={{ marginBottom:18 }}>
          <div className="card"><h3>صادر</h3><div className="big">{stats.issued}</div><div className="foot">مستند برقم نهائي</div></div>
          <div className="card"><h3>مسودات</h3><div className="big">{stats.drafts}</div><div className="foot">لم تُصدَر بعد</div></div>
          <div className="card">
            <h3>صدر ولم يُرسل</h3>
            <div className="big" style={{ color:stats.issued_not_sent ? 'var(--warn)' : undefined }}>{stats.issued_not_sent}</div>
            <div className="foot">يحتاج متابعة</div>
          </div>
          <div className="card"><h3>آخر ٣٠ يومًا</h3><div className="big">{stats.last_30_days}</div><div className="foot">من {stats.total} في الأرشيف</div></div>
        </div>
      )}

      {sendFor && (
        <div className="section" style={{ marginTop:0, marginBottom:14, borderColor:'var(--maroon)' }}>
          <header><h2>تسجيل الإرسال: {sendFor.doc_number}</h2></header>
          <div style={{ padding:18 }}>
            <div className="form-grid">
              <div className="field span2">
                <label>أُرسل إلى</label>
                <input value={sendData.sent_to} onChange={(event) => setSendData({ ...sendData, sent_to:event.target.value })} />
              </div>
              <div className="field">
                <label>الطريقة</label>
                <select value={sendData.sent_method} onChange={(event) => setSendData({ ...sendData, sent_method:event.target.value })}>
                  {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
              <div className="field">
                <label>التاريخ</label>
                <input type="date" dir="ltr" value={sendData.sent_at} onChange={(event) => setSendData({ ...sendData, sent_at:event.target.value })} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" onClick={saveSend}>حفظ</button>
              <button className="btn ghost" onClick={() => setSendFor(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop:0 }}>
        <header>
          <h2>السجل ({list.length})</h2>
          <input className="search" placeholder="ابحث بالرقم أو الموضوع أو الجهة" value={q} onChange={(event) => setQ(event.target.value)} />
        </header>

        <div className="arc-filters">
          <select value={src} onChange={(event) => setSrc(event.target.value)}>
            <option value="all">كل الأنواع</option>
            {Object.entries(SRC_AR).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select value={cat} onChange={(event) => setCat(event.target.value)}>
            <option value="all">كل التصنيفات</option>
            {cats.map((key) => <option key={key} value={key}>{CAT_AR[key] || key}</option>)}
          </select>
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="all">كل الحالات</option>
            {Object.entries(STATE_AR).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label>من <input type="date" dir="ltr" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>إلى <input type="date" dir="ltr" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          {filtersActive && <button className="btn ghost" style={{ padding:'5px 11px', fontSize:12.5 }} onClick={clearFilters}>مسح الفلاتر</button>}
        </div>

        {list.length === 0 ? (
          <div className="empty"><h3>لا نتائج</h3><p>جرّب كلمة أخرى أو امسح الفلاتر.</p></div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width:150 }}>الرقم</th><th style={{ width:110 }}>النوع</th><th>الموضوع</th>
                  <th style={{ width:90 }}>التاريخ</th><th style={{ width:100 }} className="num">المبلغ</th>
                  <th style={{ width:80 }}>الحالة</th><th style={{ width:130 }}>الإرسال</th><th style={{ width:150 }}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={`${row.source}-${row.id}`} style={row.state === 'void' ? { opacity:0.55 } : undefined}>
                    <td className="mono" style={{ fontSize:12.5 }}>
                      {row.doc_number}
                      <div style={{ fontSize:11, color:'var(--ink-soft)' }}>{SRC_AR[row.source]}</div>
                    </td>
                    <td style={{ fontSize:12.5 }}>{row.doc_type}</td>
                    <td>
                      {row.subject || '—'}
                      {(row.client_name || row.person_name) && <div style={{ fontSize:11.5, color:'var(--ink-soft)' }}>{row.client_name || row.person_name}</div>}
                    </td>
                    <td className="mono" style={{ fontSize:12.5 }}>{dateAr(row.doc_date)}</td>
                    <td className="num">{row.amount != null ? money(row.amount) : '—'}</td>
                    <td><span className={`pill ${STATE_CLS[row.state]}`} style={{ fontSize:11.5 }}>{STATE_AR[row.state]}</span></td>
                    <td>
                      {row.sent_at ? (
                        <div style={{ fontSize:11.5 }}>
                          <span className="pill ok" style={{ fontSize:10.5 }}>{dateAr(row.sent_at)}</span>
                          <div style={{ color:'var(--ink-soft)', marginTop:2 }}>{row.sent_method} · {row.sent_to}</div>
                        </div>
                      ) : row.state === 'issued' && canWrite && ['document','quotation'].includes(row.source) ? (
                        <button className="btn ghost" style={{ padding:'3px 8px', fontSize:11.5 }} onClick={() => openSend(row)}>تسجيل الإرسال</button>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="rowsplit">
                        {row.print_url && <a className="btn ghost" style={{ padding:'4px 9px', fontSize:12.5 }} href={row.print_url} target="_blank" rel="noreferrer">طباعة</a>}
                        {row.edit_url && <Link className="btn ghost" style={{ padding:'4px 9px', fontSize:12.5 }} href={row.edit_url}>فتح</Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
