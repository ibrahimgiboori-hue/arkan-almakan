'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { useLiveRefresh, notifyChange } from '@/lib/live';

const CAT_AR = { hr:'موارد بشرية', finance:'مالية', projects:'مشاريع',
                 correspondence:'مراسلات', custom:'أخرى' };
const SRC_AR = { document:'مستند', quotation:'عرض سعر',
                 claim:'مستخلص', settlement:'تسوية' };
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
    const [a, s, u] = await Promise.all([
      supabase.from('v_archive').select('*').order('doc_date', { ascending:false }).limit(500),
      supabase.from('v_archive_stats').select('*').maybeSingle(),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(a.data || []); setStats(s.data || null); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['all']);

  const list = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows.filter((r) => {
      if (cat !== 'all' && r.category !== cat) return false;
      if (src !== 'all' && r.source !== src) return false;
      if (state !== 'all' && r.state !== state) return false;
      if (from && r.doc_date < from) return false;
      if (to && r.doc_date > to) return false;
      if (!t) return true;
      return [r.doc_number, r.subject, r.doc_type, r.person_name, r.client_name, r.sent_to]
        .filter(Boolean).some((v) => String(v).includes(t));
    });
  }, [rows, q, cat, src, state, from, to]);

  function openSend(r) {
    setSendFor(r);
    setSendData({ sent_to: r.sent_to || r.client_name || r.person_name || '',
                  sent_method: r.sent_method || 'باليد',
                  sent_at: r.sent_at || new Date().toISOString().slice(0,10) });
    setErr(''); setMsg('');
  }

  async function saveSend() {
    const table = sendFor.source === 'quotation' ? 'quotations' : 'documents';
    const { error } = await supabase.from(table).update({
      sent_at: sendData.sent_at || null,
      sent_to: sendData.sent_to || null,
      sent_method: sendData.sent_method || null,
    }).eq('id', sendFor.id);
    if (error) { setErr(error.message); return; }
    setMsg('سُجّل الإرسال'); setSendFor(null); load(); notifyChange('archive');
  }

  function exportCsv() {
    const cols = ['الرقم','النوع','التصنيف','الموضوع','التاريخ','الحالة',
                  'الجهة','المبلغ','أُرسل في','بواسطة'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    const body = list.map((r)=>[
      r.doc_number, r.doc_type, CAT_AR[r.category] || r.category, r.subject,
      dateAr(r.doc_date), STATE_AR[r.state],
      r.client_name || r.person_name || '', r.amount ?? '',
      r.sent_at ? dateAr(r.sent_at) : '', r.sent_method || '',
    ].map(esc).join(','));
    const csv = '\uFEFF' + cols.join(',') + '\n' + body.join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `أرشيف-أركان-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);
  const cats = [...new Set(rows.map((r)=>r.category))];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الأرشيف</h1>
          <p>كل ما صدر من أركان — خطابات ونماذج وعروض ومستخلصات وتسويات</p>
        </div>
        <div className="rowsplit">
          <button className="btn ghost" onClick={exportCsv}>تصدير إكسل</button>
          <Link className="btn ghost" href="/dashboard/register">الصادر والوارد</Link>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {stats && (
        <div className="grid k4" style={{marginBottom:18}}>
          <div className="card">
            <h3>صادر</h3>
            <div className="big">{stats.issued}</div>
            <div className="foot">مستند برقم نهائي</div>
          </div>
          <div className="card">
            <h3>مسودات</h3>
            <div className="big">{stats.drafts}</div>
            <div className="foot">لم تُصدَر بعد</div>
          </div>
          <div className="card">
            <h3>صدر ولم يُرسل</h3>
            <div className="big" style={{color: stats.issued_not_sent ? 'var(--warn)' : undefined}}>
              {stats.issued_not_sent}
            </div>
            <div className="foot">يحتاج متابعة</div>
          </div>
          <div className="card">
            <h3>آخر ٣٠ يوماً</h3>
            <div className="big">{stats.last_30_days}</div>
            <div className="foot">من {stats.total} في الأرشيف</div>
          </div>
        </div>
      )}

      {sendFor && (
        <div className="section" style={{marginTop:0,marginBottom:14,borderColor:'var(--maroon)'}}>
          <header><h2>تسجيل الإرسال: {sendFor.doc_number}</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              <div className="field span2">
                <label>أُرسل إلى</label>
                <input value={sendData.sent_to}
                       onChange={(e)=>setSendData({...sendData, sent_to:e.target.value})} />
              </div>
              <div className="field">
                <label>الطريقة</label>
                <select value={sendData.sent_method}
                        onChange={(e)=>setSendData({...sendData, sent_method:e.target.value})}>
                  {METHODS.map((m)=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field">
                <label>التاريخ</label>
                <input type="date" dir="ltr" value={sendData.sent_at}
                       onChange={(e)=>setSendData({...sendData, sent_at:e.target.value})} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" onClick={saveSend}>حفظ</button>
              <button className="btn ghost" onClick={()=>setSendFor(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      <div className="section" style={{marginTop:0}}>
        <header>
          <h2>السجل ({list.length})</h2>
          <input className="search" placeholder="ابحث بالرقم أو الموضوع أو الجهة"
                 value={q} onChange={(e)=>setQ(e.target.value)} />
        </header>

        <div className="arc-filters">
          <select value={src} onChange={(e)=>setSrc(e.target.value)}>
            <option value="all">كل الأنواع</option>
            {Object.entries(SRC_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select value={cat} onChange={(e)=>setCat(e.target.value)}>
            <option value="all">كل التصنيفات</option>
            {cats.map((c)=><option key={c} value={c}>{CAT_AR[c] || c}</option>)}
          </select>
          <select value={state} onChange={(e)=>setState(e.target.value)}>
            <option value="all">كل الحالات</option>
            {Object.entries(STATE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <label>من <input type="date" dir="ltr" value={from}
                           onChange={(e)=>setFrom(e.target.value)} /></label>
          <label>إلى <input type="date" dir="ltr" value={to}
                            onChange={(e)=>setTo(e.target.value)} /></label>
          {(q || cat!=='all' || src!=='all' || state!=='all' || from || to) && (
            <button className="btn ghost" style={{padding:'5px 11px',fontSize:12.5}}
                    onClick={()=>{setQ('');setCat('all');setSrc('all');
                                  setState('all');setFrom('');setTo('');}}>
              مسح الفلاتر
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <div className="empty">
            <h3>لا نتائج</h3>
            <p>جرّب كلمة أخرى أو امسح الفلاتر.</p>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th style={{width:150}}>الرقم</th><th style={{width:110}}>النوع</th>
                    <th>الموضوع</th><th style={{width:90}}>التاريخ</th>
                    <th style={{width:100}} className="num">المبلغ</th>
                    <th style={{width:80}}>الحالة</th><th style={{width:130}}>الإرسال</th>
                    <th style={{width:150}}>—</th></tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={`${r.source}-${r.id}`} style={r.state === 'void' ? {opacity:.55} : undefined}>
                    <td className="mono" style={{fontSize:12.5}}>
                      {r.doc_number}
                      <div style={{fontSize:11,color:'var(--ink-soft)'}}>
                        {SRC_AR[r.source]}
                      </div>
                    </td>
                    <td style={{fontSize:12.5}}>{r.doc_type}</td>
                    <td>
                      {r.subject || '—'}
                      {(r.client_name || r.person_name) && (
                        <div style={{fontSize:11.5,color:'var(--ink-soft)'}}>
                          {r.client_name || r.person_name}
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{fontSize:12.5}}>{dateAr(r.doc_date)}</td>
                    <td className="num">{r.amount != null ? money(r.amount) : '—'}</td>
                    <td>
                      <span className={`pill ${STATE_CLS[r.state]}`} style={{fontSize:11.5}}>
                        {STATE_AR[r.state]}
                      </span>
                    </td>
                    <td>
                      {r.sent_at ? (
                        <div style={{fontSize:11.5}}>
                          <span className="pill ok" style={{fontSize:10.5}}>
                            {dateAr(r.sent_at)}
                          </span>
                          <div style={{color:'var(--ink-soft)',marginTop:2}}>
                            {r.sent_method} · {r.sent_to}
                          </div>
                        </div>
                      ) : r.state === 'issued' && canWrite
                          && ['document','quotation'].includes(r.source) ? (
                        <button className="btn ghost" style={{padding:'3px 8px',fontSize:11.5}}
                                onClick={()=>openSend(r)}>تسجيل الإرسال</button>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="rowsplit">
                        {r.print_url && (
                          <a className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                             href={r.print_url} target="_blank" rel="noreferrer">طباعة</a>
                        )}
                        {r.edit_url && (
                          <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                href={r.edit_url}>فتح</Link>
                        )}
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
