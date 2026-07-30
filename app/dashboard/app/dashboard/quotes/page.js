'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, money } from '@/lib/format';
import { QSTATUS_AR } from '@/lib/quote-calc';

export default function Quotes() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [tot, setTot] = useState({});
  const [role, setRole] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [q, t, u] = await Promise.all([
      supabase.from('quotations').select('*').order('created_at', { ascending: false }),
      supabase.from('v_quote_totals').select('*'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(q.data || []);
    const m = {}; (t.data || []).forEach((x) => { m[x.id] = x; });
    setTot(m); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  async function create(kind) {
    setErr(''); setBusy(true);
    const { data: num, error: e1 } = await supabase
      .rpc('next_document_number', { p_doc_type: kind === 'boq' ? 'BOQ' : 'QUOTE',
                                     p_prefix: kind === 'boq' ? 'BOQ' : 'QT' });
    if (e1) { setErr('تعذّر توليد الرقم: ' + e1.message); setBusy(false); return; }

    const { data: cfg } = await supabase.from('app_settings')
      .select('quote_terms_default, vat_rate').eq('id',1).maybeSingle();

    const { data, error } = await supabase.from('quotations').insert({
      quote_no: num, doc_kind: kind, client_name: 'عميل جديد',
      vat_rate: cfg?.vat_rate ?? 0.15,
      terms_text: cfg?.quote_terms_default || '',
      intro_text: 'يسرنا في أركان المكان أن نضع بين أيديكم عرض السعر التالي لتنفيذ الأعمال الموضحة أدناه وفقاً للمواصفات الفنية المعتمدة.',
      closing_text: 'آملين أن ينال عرضنا استحسانكم، وتفضلوا بقبول فائق الاحترام والتقدير.',
      show_qty: kind === 'boq',
    }).select('id').single();

    setBusy(false);
    if (error) { setErr('تعذّر الإنشاء: ' + error.message); return; }
    router.push(`/dashboard/quotes/${data.id}`);
  }

  async function duplicate(r) {
    setErr(''); setMsg(''); setBusy(true);
    const { data, error } = await supabase.rpc('duplicate_quotation', { p_id: r.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push(`/dashboard/quotes/${data}`);
  }

  async function remove(r) {
    if (!window.confirm(`حذف ${r.quote_no} وكل بنوده نهائياً؟`)) return;
    setErr(''); setMsg('');
    const { error } = await supabase.from('quotations').delete().eq('id', r.id);
    if (error) { setErr('تعذّر الحذف: ' + error.message); return; }
    setMsg('حُذف العرض'); load();
  }

  async function toProject(r) {
    if (!window.confirm(`تحويل ${r.quote_no} إلى مشروع بكل بنوده؟`)) return;
    setErr(''); setMsg('');
    const { error } = await supabase.rpc('quote_to_project', { p_quote: r.id });
    if (error) { setErr(error.message); return; }
    setMsg('حُوّل إلى مشروع'); load();
  }

  async function setStatus(r, status) {
    const { error } = await supabase.from('quotations').update({ status }).eq('id', r.id);
    if (error) setErr(error.message); else load();
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>عروض الأسعار وجداول الكميات</h1>
          <p>محرّك واحد مرن — تُظهر وتُخفي الأعمدة والأقسام كما يناسب كل عرض</p>
        </div>
        <div className="rowsplit">
          <button className="btn" disabled={busy} onClick={()=>create('quotation')}>عرض سعر جديد</button>
          <button className="btn ghost" disabled={busy} onClick={()=>create('boq')}>جدول كميات جديد</button>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>السجل</h2></header>
        {rows.length === 0 ? (
          <div className="empty"><h3>لا عروض بعد</h3><p>أنشئ عرضاً من الزرّين أعلى الصفحة.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>الرقم</th><th>النوع</th><th>العميل</th><th>التاريخ</th>
                  <th className="num">المجموع</th><th>الحالة</th>
                  <th style={{width:280}}>الإجراءات</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.quote_no}</td>
                  <td>{r.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'}</td>
                  <td><Link href={`/dashboard/quotes/${r.id}`}>{r.client_name}</Link></td>
                  <td className="mono">{dateAr(r.quote_date)}</td>
                  <td className="num">{money(tot[r.id]?.grand_total || 0)}</td>
                  <td>
                    {canWrite ? (
                      <select value={r.status} onChange={(e)=>setStatus(r, e.target.value)}
                              style={{fontSize:12.5,padding:'2px 4px'}}>
                        {Object.entries(QSTATUS_AR).map(([k,v])=>(
                          <option key={k} value={k}>{v}</option>))}
                      </select>
                    ) : (
                      <span className="pill">{QSTATUS_AR[r.status]}</span>
                    )}
                  </td>
                  <td>
                    <div className="rowsplit">
                      <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                            href={`/dashboard/quotes/${r.id}`}>تعديل</Link>
                      <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                            href={`/print/quote/${r.id}`} target="_blank">طباعة</Link>
                      {canWrite && (
                        <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                disabled={busy} onClick={()=>duplicate(r)}>نسخ</button>
                      )}
                      {canWrite && r.status === 'accepted' && (
                        <button className="btn" style={{padding:'4px 9px',fontSize:12.5}}
                                onClick={()=>toProject(r)}>← مشروع</button>
                      )}
                      {canWrite && (
                        <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                        borderColor:'#EBC3C0',color:'#A32B24'}}
                                onClick={()=>remove(r)}>حذف</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
